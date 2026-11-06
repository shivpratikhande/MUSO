import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { EarningsService } from './earnings.service.js';
import { PaymentsService } from './payments.service.js';

/**
 * Background timers: reconcile payments the app never returned for, and release earnings
 * whose hold window ended. Both operations are idempotent, so running on several instances
 * is safe. Disabled with PAYMENTS_WORKER_ENABLED=false (and in tests, which call them directly).
 */
@Injectable()
export class PaymentsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsWorker.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly payments: PaymentsService,
    private readonly earnings: EarningsService,
  ) {}

  onModuleInit(): void {
    if (
      !this.config.get('PAYMENTS_WORKER_ENABLED', { infer: true }) ||
      this.config.get('NODE_ENV', { infer: true }) === 'test'
    )
      return;
    this.timer = setInterval(() => void this.tick(), 30_000);
  }

  private async tick(): Promise<void> {
    try {
      await this.payments.reconcilePending();
      await this.earnings.releaseDue();
    } catch (err) {
      this.logger.warn(`payments tick failed: ${(err as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
