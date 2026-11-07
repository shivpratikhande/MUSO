import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { ArcPaymentsService } from './arc.payments.js';
import { ArcService } from './arc.service.js';

/**
 * Pays distributed Arc pools on-chain (award + relayed claim) and picks up USDC unlocks/tips the
 * wallet page didn't report. Idempotent; checks the chain first.
 */
@Injectable()
export class ArcWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArcWorker.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly arc: ArcService,
    private readonly arcPayments: ArcPaymentsService,
  ) {}

  onModuleInit(): void {
    if (
      !this.config.get('ARC_ENABLED', { infer: true }) ||
      !this.config.get('PAYMENTS_WORKER_ENABLED', { infer: true }) ||
      this.config.get('NODE_ENV', { infer: true }) === 'test'
    )
      return;
    this.timer = setInterval(() => {
      this.arc
        .processPayouts()
        .catch((err) => this.logger.warn(`Arc payouts failed: ${(err as Error).message}`));
      // USDC unlocks/tips whose wallet page never reported back.
      this.arcPayments
        .reconcile()
        .catch((err) => this.logger.warn(`USDC payments check failed: ${(err as Error).message}`));
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
