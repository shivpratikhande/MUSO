import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http';
import type { PaymentPayload } from '@x402/core/types';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { X402Service } from './x402.service.js';

/**
 * Public, machine-facing endpoints (no MUSO login): discovery, catalogue, and the
 * x402-protected content route. Responses are raw JSON (not the app's {data} envelope)
 * because generic x402 clients expect the protocol's own shapes.
 */
@ApiExcludeController()
@Public()
@Controller()
export class X402Controller {
  constructor(
    private readonly x402: X402Service,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Discovery document for agents (served at /.well-known/x402, outside the /v1 prefix). */
  @Get('.well-known/x402')
  wellKnown(@Res() res: Response): void {
    this.x402.assertEnabled();
    const base = this.config.get('PUBLIC_API_URL', { infer: true }).replace(/\/+$/, '');
    res.json({
      service: 'MUSO',
      description:
        'Photos and videos captured by fans at live events. Pay per item with x402 on Hedera.',
      network: this.config.get('X402_NETWORK', { infer: true }),
      asset: 'USDC',
      catalog: `${base}/v1/x402/catalog`,
      endpointTemplate: `${base}/v1/x402/posts/{postId}/content`,
      licence: 'Personal use only. No copyright transfer; no rights to the performance or music.',
    });
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('x402/catalog')
  async catalog(@Query('limit') limit: string | undefined, @Res() res: Response): Promise<void> {
    const n = Number(limit);
    res.json({ items: await this.x402.catalog(Number.isInteger(n) && n > 0 ? n : 50) });
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('x402/posts/:id/content')
  async content(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) id: string,
    @Headers('payment-signature') signature: string | undefined,
    @Headers('x-payment') legacy: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    let payload: PaymentPayload | null = null;
    const raw = signature ?? legacy;
    if (raw) {
      try {
        payload = decodePaymentSignatureHeader(raw);
      } catch {
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'Malformed PAYMENT-SIGNATURE header' });
        return;
      }
    }
    const result = await this.x402.content(id, payload);
    res.setHeader('Cache-Control', 'private, no-store');
    if (result.kind === 'payment_required') {
      res
        .status(HttpStatus.PAYMENT_REQUIRED)
        .setHeader('PAYMENT-REQUIRED', encodePaymentRequiredHeader(result.body))
        .json(result.body);
      return;
    }
    res
      .status(HttpStatus.OK)
      .setHeader('PAYMENT-RESPONSE', encodePaymentResponseHeader(result.settlement))
      .json(result.body);
  }
}
