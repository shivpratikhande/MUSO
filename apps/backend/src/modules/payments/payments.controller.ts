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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CreateCheckoutSchema,
  CursorQuerySchema,
  type CreateCheckoutInput,
  type CursorQuery,
  type EarningsSummary,
  type Paginated,
  type PaymentDto,
  type PostDto,
} from '@muso/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { EarningsService } from './earnings.service.js';
import { PaymentsService } from './payments.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly earnings: EarningsService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('payments/checkout')
  checkout(
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(CreateCheckoutSchema)) body: CreateCheckoutInput,
  ): Promise<PaymentDto> {
    return this.payments.createCheckout(body, u);
  }

  /** Called when the app returns from the hosted checkout. The server asks the provider for the truth. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('payments/:id/verify')
  @HttpCode(HttpStatus.OK)
  verify(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PaymentDto> {
    return this.payments.verify(id, u);
  }

  /** Fees and mode, so the app can show exactly what the server will charge. */
  @Get('payments/config')
  config(): { feeBpsSales: number; feeBpsTips: number; testMode: boolean; provider: string } {
    return this.payments.publicConfig();
  }

  @Get('payments/:id')
  get(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PaymentDto> {
    return this.payments.get(id, u);
  }

  @Get('payments')
  mine(
    @CurrentUser() u: RequestUser,
    @Query(new ZodValidationPipe(CursorQuerySchema)) q: CursorQuery,
  ): Promise<Paginated<PaymentDto>> {
    return this.payments.listMine(u, q.cursor, q.limit);
  }

  @Get('library')
  library(@CurrentUser() u: RequestUser): Promise<PostDto[]> {
    return this.payments.library(u);
  }

  @Get('earnings')
  summary(@CurrentUser() u: RequestUser): Promise<EarningsSummary> {
    return this.earnings.summary(u.id);
  }
}
