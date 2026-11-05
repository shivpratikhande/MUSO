import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ForgotPasswordSchema,
  RefreshSchema,
  ResetPasswordSchema,
  SignInSchema,
  SignUpSchema,
  VerifyEmailSchema,
  type AuthSession,
  type AuthUser,
  type ForgotPasswordInput,
  type RefreshInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
  type VerifyEmailInput,
} from '@muso/shared';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import type { RequestUser } from './auth.types.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import type { ClientMeta } from './tokens.service.js';

/** Tighter limit for credential endpoints (per IP, per minute). */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

const meta = (req: Request): ClientMeta => ({ userAgent: req.headers['user-agent'], ip: req.ip });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('sign-up')
  signUp(
    @Body(new ZodValidationPipe(SignUpSchema)) body: SignUpInput,
    @Req() req: Request,
  ): Promise<AuthSession> {
    return this.auth.signUp(body, meta(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  signIn(
    @Body(new ZodValidationPipe(SignInSchema)) body: SignInInput,
    @Req() req: Request,
  ): Promise<AuthSession> {
    return this.auth.signIn(body, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(RefreshSchema)) body: RefreshInput,
    @Req() req: Request,
  ): Promise<AuthSession> {
    return this.auth.refresh(body.refreshToken, meta(req));
  }

  @Public()
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshInput): Promise<void> {
    await this.auth.signOut(body.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: RequestUser): Promise<AuthUser> {
    return this.auth.me(user.id);
  }

  @ApiBearerAuth()
  @Throttle(AUTH_THROTTLE)
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(VerifyEmailSchema)) body: VerifyEmailInput,
  ): Promise<AuthUser> {
    return this.auth.verifyEmail(user.id, body.code);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('verify-email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(@CurrentUser() user: RequestUser): Promise<void> {
    await this.auth.resendVerification(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<void> {
    await this.auth.forgotPassword(body);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<void> {
    await this.auth.resetPassword(body);
  }
}
