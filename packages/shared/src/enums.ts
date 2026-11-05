import { z } from 'zod';

/**
 * Domain enums shared by the mobile app and the API.
 * Keep these in sync with the Prisma enums in packages/database/prisma/schema.prisma.
 */

export const USER_ROLES = ['ARTIST', 'CREATOR', 'SUPPORTER', 'ORGANIZER', 'ADMIN'] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** Roles a user may pick for themselves during onboarding (ADMIN is never self-assigned). */
export const SELF_ASSIGNABLE_ROLES = [
  'ARTIST',
  'CREATOR',
  'SUPPORTER',
  'ORGANIZER',
] as const satisfies readonly UserRole[];

export const EVENT_STATUSES = ['UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED'] as const;
export const EventStatusSchema = z.enum(EVENT_STATUSES);
export type EventStatus = z.infer<typeof EventStatusSchema>;

/** How a piece of creator content earns. */
export const MONETIZATION_MODES = ['FREE', 'PAY_TO_UNLOCK', 'PAY_WHAT_YOU_WANT'] as const;
export const MonetizationModeSchema = z.enum(MONETIZATION_MODES);
export type MonetizationMode = z.infer<typeof MonetizationModeSchema>;

/** Earnings are never withdrawable until AVAILABLE. */
export const EARNING_STATUSES = [
  'ESTIMATED',
  'PENDING',
  'CONFIRMED',
  'AVAILABLE',
  'PAID',
  'REVERSED',
] as const;
export const EarningStatusSchema = z.enum(EARNING_STATUSES);
export type EarningStatus = z.infer<typeof EarningStatusSchema>;
