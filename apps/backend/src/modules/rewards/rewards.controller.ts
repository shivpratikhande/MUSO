import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CreateRewardPoolSchema,
  HeartbeatSchema,
  StartWatchSchema,
  type EventLeaderboards,
  type HeartbeatInput,
  type RewardPoolDetail,
  type RewardPoolDto,
  type StartWatchInput,
  type WatchSessionDto,
} from '@muso/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RewardsService } from './rewards.service.js';
import { WatchService } from './watch.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('rewards')
@ApiBearerAuth()
@Controller()
export class RewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly watch: WatchService,
  ) {}

  @Post('reward-pools')
  create(
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(CreateRewardPoolSchema))
    body: z.output<typeof CreateRewardPoolSchema>,
  ): Promise<RewardPoolDetail> {
    return this.rewards.create(body, u);
  }

  @Get('reward-pools/:id')
  get(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<RewardPoolDetail> {
    return this.rewards.get(id, u);
  }

  @Post('reward-pools/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<RewardPoolDetail> {
    return this.rewards.cancel(id, u);
  }

  @Get('events/:id/reward-pools')
  forEvent(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<RewardPoolDto[]> {
    return this.rewards.listForEvent(id, u);
  }

  @Get('events/:id/leaderboards')
  leaderboards(@Param('id', uuid) id: string): Promise<EventLeaderboards> {
    return this.rewards.eventLeaderboards(id);
  }

  // ─────────── Watch time ───────────

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('watch/sessions')
  start(
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(StartWatchSchema)) body: StartWatchInput,
    @Req() req: Request,
  ): Promise<WatchSessionDto> {
    return this.watch.start(body, u, req.ip);
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('watch/sessions/:id/heartbeat')
  @HttpCode(HttpStatus.OK)
  heartbeat(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(HeartbeatSchema)) body: HeartbeatInput,
  ): Promise<{ status: string }> {
    return this.watch.heartbeat(id, body, u);
  }

  @Post('watch/sessions/:id/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  async end(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<void> {
    await this.watch.end(id, u);
  }
}
