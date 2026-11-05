import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES } from '@muso/shared';
import type { Request } from 'express';
import { PrismaService } from '../../../database/prisma.service.js';
import type { AccessTokenPayload, RequestUser } from '../auth.types.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * Global guard: verifies the Bearer access token and loads the user fresh from the DB
 * (so deleted users and role changes take effect immediately).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw this.unauthorized('Missing access token');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw this.unauthorized('Invalid or expired access token');
    }
    if (payload.typ !== 'access') throw this.unauthorized('Invalid token type');

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, emailVerifiedAt: true, roles: { select: { role: true } } },
    });
    if (!user) throw this.unauthorized('Account not found');

    req.user = {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      roles: user.roles.map((r) => r.role),
    };
    return true;
  }

  private unauthorized(message: string) {
    return new UnauthorizedException({ code: ERROR_CODES.UNAUTHENTICATED, message });
  }
}
