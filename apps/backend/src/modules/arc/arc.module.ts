import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { EnsModule } from '../ens/ens.module.js';
import { RewardsModule } from '../rewards/rewards.module.js';
import { ARC_CHAIN, ViemArcChain } from './arc.chain.js';
import { ArcController } from './arc.controller.js';
import { ArcService } from './arc.service.js';
import { ArcSessionController, ArcShortLinkController } from './arc.session.controller.js';
import { ArcSessionService } from './arc.session.js';
import { ArcWorker } from './arc.worker.js';

@Module({
  imports: [RewardsModule, EnsModule],
  controllers: [ArcController, ArcSessionController, ArcShortLinkController],
  providers: [
    ArcService,
    ArcSessionService,
    ArcWorker,
    {
      provide: ARC_CHAIN,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const env = {
          ARC_CHAIN_ID: config.get('ARC_CHAIN_ID', { infer: true }),
          ARC_RPC_URL: config.get('ARC_RPC_URL', { infer: true }),
          ARC_EXPLORER_URL: config.get('ARC_EXPLORER_URL', { infer: true }),
          ARC_REWARD_CAMPAIGNS_ADDRESS: config.get('ARC_REWARD_CAMPAIGNS_ADDRESS', { infer: true }),
          ARC_ALLOCATOR_PRIVATE_KEY: config.get('ARC_ALLOCATOR_PRIVATE_KEY', { infer: true }),
        } as Env;
        return config.get('ARC_ENABLED', { infer: true }) ? new ViemArcChain(env) : null;
      },
    },
  ],
  exports: [ArcService, ArcSessionService],
})
export class ArcModule {}
