import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { WorldIdController } from './world-id.controller.js';
import { WorldIdService } from './world-id.service.js';
import { HttpWorldIdVerifier, WORLD_ID_VERIFIER } from './world-id.verifier.js';

@Module({
  controllers: [WorldIdController],
  providers: [
    WorldIdService,
    {
      provide: WORLD_ID_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new HttpWorldIdVerifier(config.get('WORLD_ID_VERIFY_URL', { infer: true })),
    },
  ],
  exports: [WorldIdService],
})
export class WorldIdModule {}
