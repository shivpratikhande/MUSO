import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../auth.types.js';

/** Injects the authenticated user resolved by `JwtAuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser =>
    ctx.switchToHttp().getRequest<{ user: RequestUser }>().user,
);
