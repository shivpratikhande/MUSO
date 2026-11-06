import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ArcLinkRequestSchema,
  LinkArcCampaignSchema,
  LinkWalletSchema,
  WalletChallengeQuerySchema,
  type ArcLink,
  type ArcLinkRequest,
  type LinkArcCampaignInput,
  type LinkWalletInput,
  type MyWallet,
  type RewardPoolDetail,
  type WalletChallenge,
} from '@muso/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ArcService } from './arc.service.js';
import { ArcSessionService } from './arc.session.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('arc')
@ApiBearerAuth()
@Controller()
export class ArcController {
  constructor(
    private readonly arc: ArcService,
    private readonly sessions: ArcSessionService,
  ) {}

  /** Signed link to MUSO's wallet page, where the creator connects and verifies a wallet. */
  @Post('me/wallet/connect-link')
  @HttpCode(HttpStatus.OK)
  walletLink(
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(ArcLinkRequestSchema)) body: ArcLinkRequest,
  ): Promise<ArcLink> {
    return this.sessions.createLink(u, 'wallet', body.returnUrl);
  }

  /** Signed link to MUSO's wallet page, where the organizer funds this pool with USDC on Arc. */
  @Post('reward-pools/:id/arc/fund-link')
  @HttpCode(HttpStatus.OK)
  fundLink(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(ArcLinkRequestSchema)) body: ArcLinkRequest,
  ): Promise<ArcLink> {
    return this.sessions.createLink(u, 'fund', body.returnUrl, id);
  }

  @Get('me/wallet')
  wallet(@CurrentUser() u: RequestUser): Promise<MyWallet> {
    return this.arc.wallet(u);
  }

  @Get('me/wallet/challenge')
  challenge(
    @CurrentUser() u: RequestUser,
    @Query(new ZodValidationPipe(WalletChallengeQuerySchema)) q: { address: string },
  ): WalletChallenge {
    return this.arc.challenge(u, q.address);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Put('me/wallet')
  link(
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(LinkWalletSchema)) body: LinkWalletInput,
  ): Promise<MyWallet> {
    return this.arc.linkWallet(u, body);
  }

  @Delete('me/wallet')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(@CurrentUser() u: RequestUser): Promise<void> {
    return this.arc.unlinkWallet(u);
  }

  /** Fund a draft pool with an on-chain Arc campaign the organizer created. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reward-pools/:id/arc')
  @HttpCode(HttpStatus.OK)
  fund(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(LinkArcCampaignSchema)) body: LinkArcCampaignInput,
  ): Promise<RewardPoolDetail> {
    return this.arc.linkCampaign(id, body.campaignId, u);
  }
}
