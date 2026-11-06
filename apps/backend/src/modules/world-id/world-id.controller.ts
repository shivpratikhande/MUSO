import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  VerifyHumanSchema,
  type HumanStatus,
  type VerifyHumanInput,
  type WorldIdContext,
} from '@muso/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { WorldIdService } from './world-id.service.js';

@ApiTags('world-id')
@ApiBearerAuth()
@Controller('me/human')
export class WorldIdController {
  constructor(private readonly worldId: WorldIdService) {}

  @Get()
  status(@CurrentUser() u: RequestUser): Promise<HumanStatus> {
    return this.worldId.status(u);
  }

  /** Signed IDKit request context (the RP signing key stays on the server). */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('context')
  @HttpCode(HttpStatus.OK)
  context(@CurrentUser() u: RequestUser): WorldIdContext {
    return this.worldId.context(u);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(VerifyHumanSchema)) body: VerifyHumanInput,
  ): Promise<HumanStatus> {
    return this.worldId.verify(u, body);
  }
}
