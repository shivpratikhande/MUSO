import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { ContentModule } from '../posts/content.module.js';
import { RewardsController } from './rewards.controller.js';
import { RewardsService } from './rewards.service.js';
import { RewardsWorker } from './rewards.worker.js';
import { WatchService } from './watch.service.js';

@Module({
  imports: [PaymentsModule, ContentModule],
  controllers: [RewardsController],
  providers: [RewardsService, WatchService, RewardsWorker],
})
export class RewardsModule {}
