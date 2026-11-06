import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { RewardsService } from './rewards.service.js';

/** Distributes reward pools whose window ended (idempotent; safe on several instances). */
@Injectable()
export class RewardsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RewardsWorker.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly rewards: RewardsService,
  ) {}

  onModuleInit(): void {
    if (
      !this.config.get('PAYMENTS_WORKER_ENABLED', { infer: true }) ||
      this.config.get('NODE_ENV', { infer: true }) === 'test'
    )
      return;
    this.timer = setInterval(() => {
      this.rewards
        .distributeDue()
        .catch((err) => this.logger.warn(`distribution failed: ${(err as Error).message}`));
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
