import { z } from 'zod';
import { CursorQuerySchema } from '../api.js';
import type { UserRole } from '../enums.js';
import { UuidSchema } from './common.js';
import { PricingSchema, type PostMonetization } from './money.js';
import type { EventStatus } from './events.js';

export const MEDIA_TYPES = ['PHOTO', 'VIDEO'] as const;
export const MediaTypeSchema = z.enum(MEDIA_TYPES);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const VIDEO_CONTENT_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 180;
export const MAX_CAPTION = 2200;
export const MAX_TAGGED_ARTISTS = 5;

export const PresignPostMediaSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PHOTO'),
    contentType: z.enum(PHOTO_CONTENT_TYPES, 'Photos must be JPEG, PNG or WebP'),
    sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES, 'Photos must be 25 MB or smaller'),
  }),
  z.object({
    type: z.literal('VIDEO'),
    contentType: z.enum(VIDEO_CONTENT_TYPES, 'Videos must be MP4 or MOV'),
    sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES, 'Videos must be 300 MB or smaller'),
  }),
]);
export type PresignPostMediaInput = z.infer<typeof PresignPostMediaSchema>;

export const CreatePostSchema = z.object({
  /** Client-generated UUID. Retrying with the same id returns the same post. */
  clientRequestId: UuidSchema,
  mediaKey: z.string().min(1).max(300),
  type: MediaTypeSchema,
  caption: z.string().trim().max(MAX_CAPTION).default(''),
  eventId: UuidSchema.nullable().optional(),
  artistIds: z
    .array(UuidSchema)
    .max(MAX_TAGGED_ARTISTS, `Tag up to ${MAX_TAGGED_ARTISTS} artists`)
    .refine((a) => new Set(a).size === a.length, 'Each artist can only be tagged once')
    .default([]),
  rightsConfirmed: z.literal(true, 'Confirm you captured this and have the right to share it'),
  pricing: PricingSchema.default({ mode: 'FREE', tipsEnabled: true }),
});
export type CreatePostInput = z.input<typeof CreatePostSchema>;

export const FEED_TABS = [
  'for_you',
  'trending',
  'live',
  'around',
  'artists',
  'photos',
  'videos',
] as const;
export const FeedTabSchema = z.enum(FEED_TABS);
export type FeedTab = z.infer<typeof FeedTabSchema>;
export const FeedQuerySchema = CursorQuerySchema.extend({ tab: FeedTabSchema.default('for_you') });
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const PostListQuerySchema = CursorQuerySchema.extend({ type: MediaTypeSchema.optional() });
export type PostListQuery = z.infer<typeof PostListQuerySchema>;

export const CreateCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write something').max(1000, 'Keep it under 1000 characters'),
  parentId: UuidSchema.nullable().optional(),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'NUDITY',
  'VIOLENCE',
  'COPYRIGHT',
  'PRIVACY',
  'OTHER',
] as const;
export const ReportSchema = z.object({
  targetType: z.enum(['POST', 'COMMENT', 'USER']),
  targetId: UuidSchema,
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});
export type ReportInput = z.infer<typeof ReportSchema>;

export const ResolveReportSchema = z.object({ action: z.enum(['HIDE', 'DISMISS']) });
export type ResolveReportInput = z.infer<typeof ResolveReportSchema>;

export const SetInterestsSchema = z.object({
  genreIds: z.array(UuidSchema).max(10, 'Pick up to 10'),
});
export type SetInterestsInput = z.infer<typeof SetInterestsSchema>;

// ───────────── Text helpers (shared so app previews match the server) ─────────────

/** Unique lowercase #hashtags (letters, numbers, underscore; max 30 chars, 20 tags). */
export function parseHashtags(text: string): string[] {
  const tags = [...text.matchAll(/(?:^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]{1,30})/gu)].map((m) =>
    m[1]!.toLowerCase(),
  );
  return [...new Set(tags)].slice(0, 20);
}

/** Unique lowercase @usernames that match the username rules. */
export function parseMentions(text: string): string[] {
  const names = [...text.matchAll(/(?:^|[^a-z0-9_.@])@([a-z0-9_.]{3,30})/gi)].map((m) =>
    m[1]!.toLowerCase().replace(/\.+$/, ''),
  );
  return [...new Set(names)].slice(0, 20);
}

// ───────────── Response shapes ─────────────

export interface UserSummary {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Set when the user has an artist page. */
  artistId: string | null;
}

export interface PostMediaDto {
  type: MediaType;
  /** Short-lived signed URL to the processed display version (null while processing). */
  url: string | null;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export type PostStatus = 'PROCESSING' | 'PUBLISHED' | 'FAILED';

export interface PostDto {
  id: string;
  type: MediaType;
  status: PostStatus;
  failureReason: string | null;
  hidden: boolean;
  caption: string;
  hashtags: string[];
  author: UserSummary;
  event: { id: string; title: string; status: EventStatus } | null;
  artists: { id: string; stageName: string }[];
  media: PostMediaDto;
  /** Posted by one of the tagged artists themselves. */
  isOfficial: boolean;
  monetization: PostMonetization;
  /** False when the viewer must pay to see the full media (media.url is then null). */
  unlocked: boolean;
  /** Viewer has an entitlement from a past purchase. */
  purchased: boolean;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  publishedAt: string | null;
  createdAt: string;
  viewer: {
    liked: boolean;
    saved: boolean;
    isAuthor: boolean;
    followingAuthor: boolean;
    canDelete: boolean;
  };
}

export interface PresignedPostMedia {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface CommentDto {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  author: UserSummary;
  replyCount: number;
  createdAt: string;
  canDelete: boolean;
}

export interface PublicProfile extends UserSummary {
  bio: string | null;
  city: string | null;
  roles: UserRole[];
  followerCount: number;
  followingCount: number;
  postCount: number;
  viewer: { isMe: boolean; following: boolean; blocked: boolean };
}

export type NotificationType =
  | 'NEW_FOLLOWER'
  | 'POST_LIKED'
  | 'POST_COMMENTED'
  | 'COMMENT_REPLIED'
  | 'MENTIONED'
  | 'TAGGED_IN_POST'
  | 'POST_PUBLISHED'
  | 'POST_FAILED'
  | 'CONTENT_PURCHASED'
  | 'TIP_RECEIVED'
  | 'REWARD_EARNED';

export interface NotificationDto {
  id: string;
  type: NotificationType;
  actor: UserSummary | null;
  post: { id: string; thumbUrl: string | null } | null;
  comment: { id: string; body: string } | null;
  read: boolean;
  createdAt: string;
}

export interface ReportDto {
  id: string;
  targetType: 'POST' | 'COMMENT' | 'USER';
  targetId: string;
  reason: (typeof REPORT_REASONS)[number];
  details: string | null;
  status: 'OPEN' | 'ACTIONED' | 'DISMISSED';
  reporter: UserSummary;
  createdAt: string;
}
