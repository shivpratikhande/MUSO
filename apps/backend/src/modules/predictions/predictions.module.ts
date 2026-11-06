import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { ArcModule } from '../arc/arc.module.js';
import { PREDICTION_CHAIN, ViemPredictionChain } from './predictions.chain.js';
import { PredictionsController, PredictionsSessionController } from './predictions.controller.js';
import { PredictionsService } from './predictions.service.js';
import { PredictionsWorker } from './predictions.worker.js';

@Module({
  imports: [ArcModule],
  controllers: [PredictionsController, PredictionsSessionController],
  providers: [
    PredictionsService,
    PredictionsWorker,
    {
      provide: PREDICTION_CHAIN,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        if (!config.get('PREDICTIONS_ENABLED', { infer: true })) return null;
        const env = {
          ARC_CHAIN_ID: config.get('ARC_CHAIN_ID', { infer: true }),
          ARC_RPC_URL: config.get('ARC_RPC_URL', { infer: true }),
          ARC_EXPLORER_URL: config.get('ARC_EXPLORER_URL', { infer: true }),
          ARC_USDC_ADDRESS: config.get('ARC_USDC_ADDRESS', { infer: true }),
          ARC_ALLOCATOR_PRIVATE_KEY: config.get('ARC_ALLOCATOR_PRIVATE_KEY', { infer: true }),
          PREDICTIONS_CONTRACT_ADDRESS: config.get('PREDICTIONS_CONTRACT_ADDRESS', { infer: true }),
        } as Env;
        return new ViemPredictionChain(env);
      },
    },
  ],
})
export class PredictionsModule {}
