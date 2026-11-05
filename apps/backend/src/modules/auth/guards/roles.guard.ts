import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, type UserRole } from '@muso/shared';
import type { RequestUser } from '../auth.types.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/** Runs after JwtAuthGuard. Enforces `@Roles(...)` when present. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const user = ctx.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    const ok =
      !!user && (user.roles.includes('ADMIN') || required.some((r) => user.roles.includes(r)));
    if (!ok) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'You do not have permission to do this',
      });
    }
    return true;
  }
}
