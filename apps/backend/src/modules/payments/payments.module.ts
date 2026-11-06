import { Module } from '@nestjs/common';
import { ContentModule } from '../posts/content.module.js';
import { EarningsService } from './earnings.service.js';
import { LedgerService } from './ledger.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaymentsWorker } from './payments.worker.js';
import { PAYMENT_PROVIDER } from './providers/payment-provider.js';
import { SandboxCheckoutController } from './providers/sandbox.controller.js';
import { SandboxProvider } from './providers/sandbox.provider.js';

@Module({
  imports: [ContentModule],
  controllers: [PaymentsController, SandboxCheckoutController],
  providers: [
    PaymentsService,
    EarningsService,
    LedgerService,
    PaymentsWorker,
    SandboxProvider,
    // Swap here when a real provider is added (selected by PAYMENTS_PROVIDER).
    { provide: PAYMENT_PROVIDER, useExisting: SandboxProvider },
  ],
  exports: [PaymentsService, EarningsService],
})
export class PaymentsModule {}
