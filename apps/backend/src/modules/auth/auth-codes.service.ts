import { BadRequestException, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@muso/shared';
import type { AuthCodePurpose } from '@muso/database';
import { PrismaService } from '../../database/prisma.service.js';
import { generateOtpCode, safeEqualHex, sha256 } from './crypto.util.js';

const CODE_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

/** One-time 6-digit codes for email verification and password reset. */
@Injectable()
export class AuthCodesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a fresh code, invalidating any earlier unused codes for the same purpose. */
  async create(userId: string, purpose: AuthCodePurpose): Promise<string> {
    const code = generateOtpCode();
    await this.prisma.$transaction([
      this.prisma.authCode.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.authCode.create({
        data: {
          userId,
          purpose,
          codeHash: this.hash(userId, code),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      }),
    ]);
    return code;
  }

  /** Consumes the code if valid; throws a generic error otherwise. */
  async consume(userId: string, purpose: AuthCodePurpose, code: string): Promise<void> {
    const record = await this.prisma.authCode.findFirst({
      where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.attempts >= MAX_ATTEMPTS) throw this.invalidError();

    if (!safeEqualHex(record.codeHash, this.hash(userId, code))) {
      await this.prisma.authCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw this.invalidError();
    }

    const claimed = await this.prisma.authCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw this.invalidError();
  }

  private hash(userId: string, code: string): string {
    return sha256(`${userId}:${code}`);
  }

  invalidError() {
    return new BadRequestException({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'That code is invalid or has expired',
    });
  }
}
