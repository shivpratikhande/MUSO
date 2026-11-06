import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Hex } from 'viem';
import type { Env } from '../../config/env.js';
import { RewardsModule } from '../rewards/rewards.module.js';
import { ArkivController } from './arkiv.controller.js';
import { ARKIV_GATEWAY, SdkArkivGateway } from './arkiv.gateway.js';
import { ArkivService } from './arkiv.service.js';
import { ArkivWorker } from './arkiv.worker.js';

@Module({
  imports: [RewardsModule],
  controllers: [ArkivController],
  providers: [
    ArkivService,
    ArkivWorker,
    {
      provide: ARKIV_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('ARKIV_ENABLED', { infer: true })
          ? new SdkArkivGateway({
              privateKey: config.get('ARKIV_WRITER_PRIVATE_KEY', { infer: true }) as Hex,
              accessKey: config.get('ARKIV_ACCESS_KEY', { infer: true }),
              explorerUrl: config.get('ARKIV_EXPLORER_URL', { infer: true }),
            })
          : null,
    },
  ],
  exports: [ArkivService],
})
export class ArkivModule {}
