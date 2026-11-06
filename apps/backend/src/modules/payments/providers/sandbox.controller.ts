import { Body, Controller, Get, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { formatMoney } from '@muso/shared';
import type { Response } from 'express';
import { PrismaService } from '../../../database/prisma.service.js';
import { Public } from '../../auth/decorators/public.decorator.js';
import { SandboxProvider } from './sandbox.provider.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Hosted checkout page for the sandbox provider (what a real processor's page would be). */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('payments/sandbox')
export class SandboxCheckoutController {
  constructor(
    private readonly sandbox: SandboxProvider,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':ref')
  async page(
    @Param('ref') ref: string,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.sandbox.verifySignature(ref, sig))
      return void res.status(HttpStatus.FORBIDDEN).type('text/plain').send('Invalid checkout link');
    const p = await this.prisma.sandboxPayment.findUnique({ where: { ref } });
    if (!p)
      return void res.status(HttpStatus.NOT_FOUND).type('text/plain').send('Checkout not found');
    const done = p.status !== 'requires_action';
    res
      .status(200)
      .setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' muso: exp: exps:",
      )
      .setHeader('Cache-Control', 'no-store')
      .type('html')
      .send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MUSO test checkout</title>
<style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F4F0E8;color:#171715;display:flex;min-height:100vh;align-items:center;justify-content:center}
.c{max-width:360px;width:100%;padding:28px;box-sizing:border-box}.b{background:#D9FF55;color:#171715;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.08em;display:inline-block}
h1{font-size:44px;margin:16px 0 4px}p{color:#5E5B54;line-height:1.45}button{width:100%;padding:16px;border-radius:999px;font-size:17px;font-weight:600;border:0;margin-top:12px}
.pay{background:#171715;color:#F4F0E8}.no{background:transparent;border:1.5px solid #D8D1C2;color:#171715}</style></head>
<body><main class="c"><span class="b">TEST PAYMENT · NO REAL MONEY</span>
<h1>${esc(formatMoney(p.amountMinor, p.currency))}</h1>
<p>This is the MUSO sandbox. A real payment provider will replace this page before launch.</p>
${
  done
    ? `<p><strong>This checkout is already ${esc(p.status)}.</strong></p><form method="post" action="${esc(ref)}/complete?sig=${esc(sig!)}"><input type="hidden" name="outcome" value="return"><button class="pay">Return to MUSO</button></form>`
    : `<form method="post" action="${esc(ref)}/complete?sig=${esc(sig!)}"><input type="hidden" name="outcome" value="pay"><button class="pay">Pay ${esc(formatMoney(p.amountMinor, p.currency))}</button></form>
<form method="post" action="${esc(ref)}/complete?sig=${esc(sig!)}"><input type="hidden" name="outcome" value="decline"><button class="no">Simulate declined card</button></form>
<form method="post" action="${esc(ref)}/complete?sig=${esc(sig!)}"><input type="hidden" name="outcome" value="cancel"><button class="no">Cancel</button></form>`
}
</main></body></html>`);
  }

  @Post(':ref/complete')
  async complete(
    @Param('ref') ref: string,
    @Query('sig') sig: string | undefined,
    @Body() body: { outcome?: string },
    @Res() res: Response,
  ): Promise<void> {
    if (!this.sandbox.verifySignature(ref, sig))
      return void res.status(HttpStatus.FORBIDDEN).type('text/plain').send('Invalid checkout link');
    const outcome =
      body?.outcome === 'pay' || body?.outcome === 'decline' || body?.outcome === 'cancel'
        ? body.outcome
        : null;
    const result = outcome
      ? await this.sandbox.complete(ref, outcome)
      : await this.prisma.sandboxPayment
          .findUnique({ where: { ref } })
          .then((p) => (p ? { returnUrl: p.returnUrl, status: p.status } : null));
    if (!result)
      return void res.status(HttpStatus.NOT_FOUND).type('text/plain').send('Checkout not found');
    const sep = result.returnUrl.includes('?') ? '&' : '?';
    res.setHeader('Content-Security-Policy', "form-action 'self' muso: exp: exps:");
    res.redirect(HttpStatus.SEE_OTHER, `${result.returnUrl}${sep}ref=${encodeURIComponent(ref)}`);
  }
}
