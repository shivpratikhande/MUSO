import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES, type AuthTokens } from '@muso/shared';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AccessTokenPayload } from './auth.types.js';
import { generateRefreshToken, sha256 } from './crypto.util.js';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * Access tokens: short-lived JWTs. Refresh tokens: opaque, single-use, rotated on every
 * refresh and stored only as hashes. Presenting an already-rotated token revokes the
 * whole session family (stolen-token detection).
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(
    userId: string,
    meta: ClientMeta,
    familyId: string = randomUUID(),
  ): Promise<AuthTokens> {
    const refreshToken = generateRefreshToken();
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    await this.prisma.session.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: sha256(refreshToken),
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });
    return { ...(await this.signAccess(userId)), refreshToken };
  }

  /** Exchange a refresh token for a new pair. Returns the owning user id. */
  async rotate(
    refreshToken: string,
    meta: ClientMeta,
  ): Promise<{ userId: string; tokens: AuthTokens }> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { user: { select: { deletedAt: true } } },
    });
    if (!session || session.revokedAt || session.user.deletedAt) throw this.invalid();

    if (session.rotatedAt) {
      // Reuse of a rotated token: assume theft, kill every session in this family.
      await this.revokeFamily(session.familyId);
      throw this.invalid();
    }
    if (session.expiresAt.getTime() <= Date.now()) throw this.invalid();

    // Atomic claim: only one concurrent request can rotate a given token.
    const claimed = await this.prisma.session.updateMany({
      where: { id: session.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (claimed.count !== 1) throw this.invalid();

    const tokens = await this.issue(session.userId, meta, session.familyId);
    return { userId: session.userId, tokens };
  }

  /** Sign out of one device. Idempotent; unknown tokens are ignored. */
  async revoke(refreshToken: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      select: { familyId: true },
    });
    if (session) await this.revokeFamily(session.familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async signAccess(userId: string): Promise<Omit<AuthTokens, 'refreshToken'>> {
    const ttl = this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    const payload: AccessTokenPayload = { sub: userId, typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ttl });
    return { accessToken, accessTokenExpiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  private invalid() {
    return new UnauthorizedException({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: 'Your session has expired. Please sign in again.',
    });
  }
}
