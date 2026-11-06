import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  EnsResolveQuerySchema,
  EnsReverseParamSchema,
  type EnsLookup,
  type EnsResolveQuery,
  type EnsStatus,
  type MyEnsName,
} from '@muso/shared';
import { z } from 'zod';
import type { Hex } from 'viem';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { EnsService } from './ens.service.js';

const GatewayBodySchema = z.object({ sender: z.string().max(64), data: z.string().max(20_000) });

/**
 * ENS subnames for MUSO creators. The gateway answers in the CCIP-Read shape `{ "data": "0x…" }`,
 * which is exactly the app's response envelope, and allows any origin so browser wallets and
 * the ENS app can read it.
 */
@ApiTags('ens')
@Controller()
export class EnsController {
  constructor(private readonly ens: EnsService) {}

  @Public()
  @Get('ens/status')
  status(): EnsStatus {
    return this.ens.status();
  }

  /** EIP-3668 GET form: `{sender}/{data}.json`. This is the URL template set in the resolver. */
  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Get('ens/gateway/:sender/:file')
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'public, max-age=60')
  gatewayGet(@Param('sender') sender: string, @Param('file') file: string): Promise<Hex> {
    return this.ens.gateway(sender, file.replace(/\.json$/, ''));
  }

  /** EIP-3668 POST form (used when the URL template has no `{data}`). */
  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('ens/gateway')
  @HttpCode(HttpStatus.OK)
  @Header('Access-Control-Allow-Origin', '*')
  gatewayPost(
    @Body(new ZodValidationPipe(GatewayBodySchema)) body: z.infer<typeof GatewayBodySchema>,
  ): Promise<Hex> {
    return this.ens.gateway(body.sender, body.data);
  }

  /** Name → address (e.g. a sponsor typing `alice.eth` or `shiv-beats.muso.eth`). */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('ens/resolve')
  resolve(
    @Query(new ZodValidationPipe(EnsResolveQuerySchema)) q: EnsResolveQuery,
  ): Promise<EnsLookup> {
    return this.ens.resolve(q.name);
  }

  /** Address → name (MUSO subname first, then the address's ENS primary name). */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('ens/reverse/:address')
  reverse(
    @Param(new ZodValidationPipe(EnsReverseParamSchema)) p: { address: string },
  ): Promise<EnsLookup> {
    return this.ens.reverse(p.address);
  }

  @ApiBearerAuth()
  @Get('me/ens')
  me(@CurrentUser() u: RequestUser): Promise<MyEnsName> {
    return this.ens.me(u);
  }
}
