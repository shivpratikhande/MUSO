import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { ArkivService } from './arkiv.service.js';

/** Publishes new events, clips, reports and payout receipts to Arkiv every 30 seconds. */
@Injectable()
export class ArkivWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArkivWorker.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly arkiv: ArkivService,
  ) {}

  onModuleInit(): void {
    if (
      !this.arkiv.enabled ||
      !this.config.get('PAYMENTS_WORKER_ENABLED', { infer: true }) ||
      this.config.get('NODE_ENV', { infer: true }) === 'test'
    )
      return;
    this.timer = setInterval(() => {
      this.arkiv
        .sync()
        .catch((err) => this.logger.warn(`Arkiv sync failed: ${(err as Error).message}`));
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
