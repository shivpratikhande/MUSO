import { z } from 'zod';
import { SELF_ASSIGNABLE_ROLES, type UserRole } from '../enums.js';
import {
  CountryCodeSchema,
  HttpUrlSchema,
  StorageKeySchema,
  UuidSchema,
  optionalText,
} from './common.js';

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/, '3–30 characters: letters, numbers, _ or .')
  .refine(
    (v) => !/^[_.]|[_.]$/.test(v) && !v.includes('..'),
    'Can’t start/end with _ or . or repeat dots',
  );

export const ProfileLinkSchema = z.object({
  label: z.string().trim().min(1).max(30),
  url: HttpUrlSchema,
});
export type ProfileLink = z.infer<typeof ProfileLinkSchema>;

export const UpdateMeSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    username: UsernameSchema,
    bio: z.string().trim().max(300),
    city: z.string().trim().max(80),
    country: CountryCodeSchema.nullable(),
    links: z.array(ProfileLinkSchema).max(6),
    avatarKey: StorageKeySchema.nullable(),
    showLocation: z.boolean(),
    showEarnings: z.boolean(),
  })
  .partial();
export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;

export const SelfRoleSchema = z.enum(SELF_ASSIGNABLE_ROLES);
export const SetRolesSchema = z.object({
  roles: z
    .array(SelfRoleSchema)
    .min(1, 'Pick at least one')
    .refine((r) => new Set(r).size === r.length, 'Duplicate roles'),
});
export type SetRolesInput = z.infer<typeof SetRolesSchema>;

export const CONTENT_USAGE_POLICIES = [
  'PERSONAL_SHARING_ONLY',
  'FAN_MONETIZATION_ALLOWED',
  'NO_RECORDINGS',
] as const;
export const ContentUsagePolicySchema = z.enum(CONTENT_USAGE_POLICIES);
export type ContentUsagePolicy = z.infer<typeof ContentUsagePolicySchema>;

export const ArtistProfileInputSchema = z.object({
  stageName: z.string().trim().min(1).max(60),
  genreIds: z.array(UuidSchema).max(5, 'Pick up to 5 genres'),
  coverKey: StorageKeySchema.nullable().optional(),
  contentUsagePolicy: ContentUsagePolicySchema.default('PERSONAL_SHARING_ONLY'),
});
export type ArtistProfileInput = z.input<typeof ArtistProfileInputSchema>;

export const CREATOR_FOCUSES = ['PHOTOGRAPHY', 'VIDEOGRAPHY'] as const;
export const CreatorProfileInputSchema = z.object({
  focus: z.array(z.enum(CREATOR_FOCUSES)).min(1, 'Pick at least one'),
  portfolioUrl: HttpUrlSchema.nullable().optional(),
});
export type CreatorProfileInput = z.infer<typeof CreatorProfileInputSchema>;

export const OrganizerProfileInputSchema = z.object({
  organizationName: z.string().trim().min(1).max(100),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email()),
  contactPhone: optionalText(30),
  website: HttpUrlSchema.nullable().optional(),
});
export type OrganizerProfileInput = z.infer<typeof OrganizerProfileInputSchema>;

// ───────────── Response shapes ─────────────

export interface Genre {
  id: string;
  slug: string;
  name: string;
}

export interface ArtistProfileDto {
  id: string;
  stageName: string;
  coverUrl: string | null;
  genres: Genre[];
  contentUsagePolicy: ContentUsagePolicy;
}

export interface CreatorProfileDto {
  focus: (typeof CREATOR_FOCUSES)[number][];
  portfolioUrl: string | null;
}

export interface OrganizerProfileDto {
  organizationName: string;
  contactEmail: string;
  contactPhone: string | null;
  website: string | null;
}

/** The signed-in user's full, private profile. */
export interface MyProfile {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarKey: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  links: ProfileLink[];
  showLocation: boolean;
  showEarnings: boolean;
  roles: UserRole[];
  onboarded: boolean;
  artistProfile: ArtistProfileDto | null;
  creatorProfile: CreatorProfileDto | null;
  organizerProfile: OrganizerProfileDto | null;
}

export interface ArtistSummary {
  id: string;
  stageName: string;
  avatarUrl: string | null;
  city: string | null;
  genres: Genre[];
}

export interface ArtistDetail extends ArtistSummary {
  userId: string;
  username: string | null;
  bio: string | null;
  coverUrl: string | null;
  country: string | null;
  links: ProfileLink[];
  contentUsagePolicy: ContentUsagePolicy;
  upcomingEvents: import('./events.js').EventSummary[];
  pastEvents: import('./events.js').EventSummary[];
}
