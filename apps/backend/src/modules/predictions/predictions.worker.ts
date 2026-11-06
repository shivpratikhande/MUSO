import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { PredictionsService } from './predictions.service.js';

/** Publishes markets, confirms picks, auto-settles watch-time markets and relays payouts. */
@Injectable()
export class PredictionsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PredictionsWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly predictions: PredictionsService,
  ) {}

  onModuleInit(): void {
    if (
      !this.config.get('PREDICTIONS_ENABLED', { infer: true }) ||
      !this.config.get('PAYMENTS_WORKER_ENABLED', { infer: true }) ||
      this.config.get('NODE_ENV', { infer: true }) === 'test'
    )
      return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      this.predictions
        .process()
        .catch((err) => this.logger.warn(`Predictions pass failed: ${(err as Error).message}`))
        .finally(() => (this.running = false));
    }, 20_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
