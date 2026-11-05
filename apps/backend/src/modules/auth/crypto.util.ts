import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** 256-bit opaque refresh token, URL-safe. */
export const generateRefreshToken = (): string => randomBytes(32).toString('base64url');

/** Uniformly random 6-digit numeric code. */
export const generateOtpCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export const safeEqualHex = (a: string, b: string): boolean => {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};
