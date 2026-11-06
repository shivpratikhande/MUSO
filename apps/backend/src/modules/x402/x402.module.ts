import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { Env } from '../../config/env.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { X402Controller } from './x402.controller.js';
import { X402_FACILITATOR, X402Service } from './x402.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [X402Controller],
  providers: [
    X402Service,
    {
      provide: X402_FACILITATOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new HTTPFacilitatorClient({ url: config.get('X402_FACILITATOR_URL', { infer: true }) }),
    },
  ],
})
export class X402Module {}
