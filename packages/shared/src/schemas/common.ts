import { z } from 'zod';

export const UuidSchema = z.uuid();

/** ISO-3166 alpha-2, normalised to uppercase. */
export const CountryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Use a 2-letter country code, e.g. IN');

export const HttpUrlSchema = z
  .url({ protocol: /^https?$/, message: 'Enter a valid http(s) link' })
  .max(500);

/** Storage key issued by POST /uploads (never a full URL). */
export const StorageKeySchema = z
  .string()
  .max(300)
  .regex(/^[a-z0-9/_.-]+$/i, 'Invalid file reference');

/** Trimmed text; empty string becomes undefined so optional fields can be cleared. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? undefined : v))
    .optional();
