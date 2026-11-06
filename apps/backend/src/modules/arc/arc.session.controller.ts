import {
  Body,
  Controller,
  Logger,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  LinkArcCampaignSchema,
  LinkWalletSchema,
  WalletChallengeQuerySchema,
  type LinkArcCampaignInput,
  type LinkWalletInput,
  type MyWallet,
  type WalletChallenge,
} from '@muso/shared';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { renderConnectPage } from './arc.page.js';
import { ArcSessionService, type ArcSessionInfo } from './arc.session.js';

function sendConnectPage(res: Response): void {
  const nonce = randomBytes(16).toString('base64');
  res
    .status(200)
    .setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'`,
    )
    .setHeader('Cache-Control', 'no-store')
    .setHeader('Referrer-Policy', 'no-referrer')
    .type('html')
    .send(renderConnectPage(nonce));
}

/** MUSO's browser wallet page and the JSON it uses. Authorized by the signed `t` link token. */
@ApiExcludeController()
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('arc')
export class ArcSessionController {
  constructor(private readonly sessions: ArcSessionService) {}

  @Get('connect')
  page(@Res() res: Response): void {
    sendConnectPage(res);
  }

  /** Pairing code (typed on the page) → signed link token. */
  @Get('code/:code')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  code(@Param('code') code: string): Promise<{ t: string }> {
    return this.sessions.resolveCode(code);
  }

  /** Error reports from the wallet page (wallet apps' errors can't be reproduced server-side). */
  @Post('client-log')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  clientLog(@Body() body: { v?: unknown; m?: unknown; ua?: unknown; acct?: unknown }): void {
    const str = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : '');
    new Logger('ArcWalletPage').warn(
      `wallet page v${str(body?.v, 8)} error: ${str(body?.m, 600)} | account ${str(body?.acct, 42)} | ${str(body?.ua, 160)}`,
    );
  }

  @Get('session')
  info(@Query('t') t: string | undefined): Promise<ArcSessionInfo> {
    return this.sessions.info(t);
  }

  @Post('session/challenge')
  @HttpCode(HttpStatus.OK)
  challenge(
    @Query('t') t: string | undefined,
    @Body(new ZodValidationPipe(WalletChallengeQuerySchema)) body: { address: string },
  ): Promise<WalletChallenge> {
    return this.sessions.challenge(t, body.address);
  }

  @Put('session/wallet')
  link(
    @Query('t') t: string | undefined,
    @Body(new ZodValidationPipe(LinkWalletSchema)) body: LinkWalletInput,
  ): Promise<MyWallet> {
    return this.sessions.linkWallet(t, body);
  }

  @Post('session/fund')
  @HttpCode(HttpStatus.OK)
  fund(
    @Query('t') t: string | undefined,
    @Body(new ZodValidationPipe(LinkArcCampaignSchema)) body: LinkArcCampaignInput,
  ): Promise<{ poolId: string }> {
    return this.sessions.fund(t, body.campaignId);
  }
}

/**
 * Short links outside /v1: `/w/:code` (pairing code in the path) and `/` (type the code).
 * Wallet apps' browsers sometimes open only the site root, so the page can always recover.
 */
@ApiExcludeController()
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller()
export class ArcShortLinkController {
  @Get()
  root(@Res() res: Response): void {
    sendConnectPage(res);
  }

  @Get('w/:code')
  short(@Res() res: Response): void {
    sendConnectPage(res);
  }
}
