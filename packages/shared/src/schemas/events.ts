import { z } from 'zod';
import { CursorQuerySchema } from '../api.js';
import { CountryCodeSchema, StorageKeySchema, UuidSchema, optionalText } from './common.js';

export const RECORDING_POLICIES = ['ALLOWED', 'PHOTOS_ONLY', 'NOT_ALLOWED'] as const;
export const RecordingPolicySchema = z.enum(RECORDING_POLICIES);
export type RecordingPolicy = z.infer<typeof RecordingPolicySchema>;

export const EVENT_REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type EventReviewStatus = (typeof EVENT_REVIEW_STATUSES)[number];

const isoDate = z.iso.datetime({ offset: true, message: 'Invalid date' });

const eventFields = {
  title: z.string().trim().min(3, 'At least 3 characters').max(100),
  description: z.string().trim().min(1, 'Add a description').max(5000),
  coverKey: StorageKeySchema.nullable().optional(),
  venueName: z.string().trim().min(1, 'Add a venue').max(120),
  address: optionalText(200),
  city: z.string().trim().min(1, 'Add a city').max(80),
  country: CountryCodeSchema,
  startsAt: isoDate,
  endsAt: isoDate,
  recordingPolicy: RecordingPolicySchema.default('ALLOWED'),
  recordingNotes: optionalText(500),
};

const MAX_DURATION_MS = 14 * 86_400_000;

export const CreateEventSchema = z
  .object(eventFields)
  .refine((e) => Date.parse(e.endsAt) > Date.parse(e.startsAt), {
    message: 'End must be after start',
    path: ['endsAt'],
  })
  .refine((e) => Date.parse(e.endsAt) - Date.parse(e.startsAt) <= MAX_DURATION_MS, {
    message: 'Events can last at most 14 days',
    path: ['endsAt'],
  });
export type CreateEventInput = z.input<typeof CreateEventSchema>;

/** Partial update. Time ordering is re-checked server-side against stored values. */
export const UpdateEventSchema = z.object(eventFields).partial();
export type UpdateEventInput = z.input<typeof UpdateEventSchema>;

export const SetLineupSchema = z.object({
  /** Billing order: index 0 is the headliner. */
  artistIds: z
    .array(UuidSchema)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'An artist can only appear once'),
});
export type SetLineupInput = z.infer<typeof SetLineupSchema>;

export const ScheduleItemInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  stage: optionalText(60),
  startsAt: isoDate,
  endsAt: isoDate.nullable().optional(),
  artistId: UuidSchema.nullable().optional(),
});
export const SetScheduleSchema = z.object({ items: z.array(ScheduleItemInputSchema).max(100) });
export type SetScheduleInput = z.input<typeof SetScheduleSchema>;

export const EVENT_WHEN = ['upcoming', 'live', 'past'] as const;
export const EventListQuerySchema = CursorQuerySchema.extend({
  when: z.enum(EVENT_WHEN).default('upcoming'),
  city: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().min(1).max(80).optional(),
});
export type EventListQuery = z.infer<typeof EventListQuerySchema>;

export const ReviewEventSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: optionalText(500),
});
export type ReviewEventInput = z.infer<typeof ReviewEventSchema>;

// ───────────── Response shapes ─────────────

export type EventStatus = 'UPCOMING' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

export interface EventSummary {
  id: string;
  title: string;
  coverUrl: string | null;
  venueName: string;
  city: string;
  country: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  reviewStatus: EventReviewStatus;
  headliners: { id: string; stageName: string }[];
  followerCount: number;
}

export interface EventDetail extends EventSummary {
  description: string;
  address: string | null;
  recordingPolicy: RecordingPolicy;
  recordingNotes: string | null;
  reviewNote: string | null;
  cancelledAt: string | null;
  organizer: {
    id: string;
    displayName: string | null;
    organizationName: string | null;
    avatarUrl: string | null;
  };
  lineup: { id: string; stageName: string; avatarUrl: string | null; position: number }[];
  schedule: {
    id: string;
    title: string;
    stage: string | null;
    startsAt: string;
    endsAt: string | null;
    artist: { id: string; stageName: string } | null;
  }[];
  viewer: { isFollowing: boolean; canEdit: boolean; canReview: boolean };
}

/** Derive lifecycle state. Shared so the app and API always agree. */
export function eventStatus(
  e: { startsAt: string | Date; endsAt: string | Date; cancelledAt?: string | Date | null },
  now = new Date(),
): EventStatus {
  if (e.cancelledAt) return 'CANCELLED';
  const t = now.getTime();
  if (t < new Date(e.startsAt).getTime()) return 'UPCOMING';
  if (t < new Date(e.endsAt).getTime()) return 'LIVE';
  return 'COMPLETED';
}
