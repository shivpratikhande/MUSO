import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CreatePredictionSchema,
  PickLinkSchema,
  SettlePredictionSchema,
  WalletChallengeQuerySchema,
  type ArcLink,
  type MyPredictionPickDto,
  type PickLinkInput,
  type PickTicketDto,
  type PredictionDto,
  type PredictionSuggestions,
  type SettlePredictionInput,
} from '@muso/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { PredictionsService } from './predictions.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('predictions')
@ApiBearerAuth()
@Controller()
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Get('events/:id/predictions')
  list(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PredictionDto[]> {
    return this.predictions.list(u, id);
  }

  @Get('events/:id/predictions/suggestions')
  suggestions(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
  ): Promise<PredictionSuggestions> {
    return this.predictions.suggestions(u, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('events/:id/predictions')
  create(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(CreatePredictionSchema))
    body: z.output<typeof CreatePredictionSchema>,
  ): Promise<PredictionDto> {
    return this.predictions.create(u, id, body);
  }

  @Get('predictions/:id')
  get(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PredictionDto> {
    return this.predictions.get(u, id);
  }

  /** Signed link to MUSO's wallet page, where the fan stakes test USDC on their pick. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('predictions/:id/pick-link')
  @HttpCode(HttpStatus.OK)
  pickLink(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(PickLinkSchema)) body: PickLinkInput,
  ): Promise<ArcLink> {
    return this.predictions.pickLink(u, id, body);
  }

  @Post('predictions/:id/settle')
  @HttpCode(HttpStatus.OK)
  settle(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(SettlePredictionSchema)) body: SettlePredictionInput,
  ): Promise<PredictionDto> {
    return this.predictions.settle(u, id, body.option);
  }

  @Post('predictions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PredictionDto> {
    return this.predictions.cancel(u, id);
  }
}

const TxSchema = z.object({ txHash: z.string().max(80) });

/** Wallet page endpoints for picks (authorized by the signed `t` link token, like /arc/session). */
@ApiExcludeController()
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('arc/session')
export class PredictionsSessionController {
  constructor(private readonly predictions: PredictionsService) {}

  @Post('pick-ticket')
  @HttpCode(HttpStatus.OK)
  ticket(
    @Query('t') t: string | undefined,
    @Body(new ZodValidationPipe(WalletChallengeQuerySchema)) body: { address: string },
  ): Promise<PickTicketDto> {
    return this.predictions.ticket(t, body.address);
  }

  @Post('pick')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Query('t') t: string | undefined,
    @Body(new ZodValidationPipe(TxSchema)) body: { txHash: string },
  ): Promise<MyPredictionPickDto> {
    return this.predictions.confirm(t, body.txHash);
  }
}
