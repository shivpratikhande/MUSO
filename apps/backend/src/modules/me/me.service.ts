import { Injectable } from '@nestjs/common';
import { Prisma } from '@muso/database';
import {
  SELF_ASSIGNABLE_ROLES,
  type ArtistProfileInput,
  type CreatorProfileInput,
  type MyProfile,
  type OrganizerProfileInput,
  type ProfileLink,
  type UpdateMeInput,
  type UserRole,
} from '@muso/shared';
import { badRequest, conflict, forbidden, isUniqueViolation } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';

const profileInclude = {
  roles: { select: { role: true } },
  artistProfile: { include: { genres: { include: { genre: true } } } },
  creatorProfile: true,
  organizerProfile: true,
  interests: { include: { genre: true } },
} as const satisfies Prisma.UserInclude;

type FullUser = Prisma.UserGetPayload<{ include: typeof profileInclude }>;

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(userId: string): Promise<MyProfile> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      include: profileInclude,
    });
    return this.toDto(user);
  }

  async update(userId: string, input: UpdateMeInput): Promise<MyProfile> {
    if (input.avatarKey) await this.storage.assertOwnedUpload(input.avatarKey, userId, 'AVATAR');
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...input,
          bio: input.bio === '' ? null : input.bio,
          city: input.city === '' ? null : input.city,
          links: input.links as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('That username is taken');
      throw err;
    }
    return this.get(userId);
  }

  /** Replaces the user's self-assignable roles. ADMIN (if held) is never touched. */
  async setRoles(userId: string, roles: readonly UserRole[]): Promise<MyProfile> {
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({
        where: { userId, role: { in: [...SELF_ASSIGNABLE_ROLES], notIn: [...roles] } },
      }),
      this.prisma.userRole.createMany({
        data: roles.map((role) => ({ userId, role })),
        skipDuplicates: true,
      }),
    ]);
    return this.get(userId);
  }

  async upsertArtistProfile(userId: string, input: ArtistProfileInput): Promise<MyProfile> {
    await this.requireRole(userId, 'ARTIST');
    if (input.coverKey)
      await this.storage.assertOwnedUpload(input.coverKey, userId, 'ARTIST_COVER');
    const genreIds = [...new Set(input.genreIds)];
    const found = await this.prisma.genre.count({ where: { id: { in: genreIds } } });
    if (found !== genreIds.length) throw badRequest('One or more genres are invalid');

    const data = {
      stageName: input.stageName,
      contentUsagePolicy: input.contentUsagePolicy ?? 'PERSONAL_SHARING_ONLY',
      ...(input.coverKey !== undefined ? { coverKey: input.coverKey } : {}),
    };
    await this.prisma.$transaction(async (tx) => {
      const artist = await tx.artistProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      await tx.artistGenre.deleteMany({ where: { artistId: artist.id } });
      await tx.artistGenre.createMany({
        data: genreIds.map((genreId) => ({ artistId: artist.id, genreId })),
      });
    });
    return this.get(userId);
  }

  async upsertCreatorProfile(userId: string, input: CreatorProfileInput): Promise<MyProfile> {
    await this.requireRole(userId, 'CREATOR');
    const data = { focus: [...new Set(input.focus)], portfolioUrl: input.portfolioUrl ?? null };
    await this.prisma.creatorProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.get(userId);
  }

  async upsertOrganizerProfile(userId: string, input: OrganizerProfileInput): Promise<MyProfile> {
    await this.requireRole(userId, 'ORGANIZER');
    const data = {
      organizationName: input.organizationName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone ?? null,
      website: input.website ?? null,
    };
    await this.prisma.organizerProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.get(userId);
  }

  /** Replaces the fan's genre interests. */
  async setInterests(userId: string, genreIds: string[]): Promise<MyProfile> {
    const ids = [...new Set(genreIds)];
    const found = await this.prisma.genre.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw badRequest('One or more genres are invalid');
    await this.prisma.$transaction([
      this.prisma.userInterest.deleteMany({ where: { userId } }),
      this.prisma.userInterest.createMany({ data: ids.map((genreId) => ({ userId, genreId })) }),
    ]);
    return this.get(userId);
  }

  /** Marks onboarding done once every chosen role has its profile filled in. */
  async completeOnboarding(userId: string): Promise<MyProfile> {
    const me = await this.get(userId);
    const missing: string[] = [];
    if (!me.username) missing.push('a username');
    if (!me.displayName) missing.push('your name');
    if (me.roles.includes('ARTIST') && !me.artistProfile) missing.push('your artist profile');
    if (me.roles.includes('CREATOR') && !me.creatorProfile) missing.push('your creator profile');
    if (me.roles.includes('ORGANIZER') && !me.organizerProfile)
      missing.push('your organizer details');
    if (missing.length) throw badRequest(`Please add ${missing.join(', ')} first`, { missing });

    if (!me.onboarded) {
      await this.prisma.user.update({ where: { id: userId }, data: { onboardedAt: new Date() } });
    }
    return this.get(userId);
  }

  private async requireRole(userId: string, role: UserRole): Promise<void> {
    const has = await this.prisma.userRole.findUnique({ where: { userId_role: { userId, role } } });
    if (!has) throw forbidden(`Add the ${role.toLowerCase()} role first`);
  }

  private toDto(u: FullUser): MyProfile {
    const a = u.artistProfile;
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      avatarKey: u.avatarKey,
      avatarUrl: this.storage.publicUrl(u.avatarKey),
      bio: u.bio,
      city: u.city,
      country: u.country,
      links: (u.links as unknown as ProfileLink[]) ?? [],
      showLocation: u.showLocation,
      showEarnings: u.showEarnings,
      roles: u.roles.map((r) => r.role),
      onboarded: u.onboardedAt !== null,
      artistProfile: a
        ? {
            id: a.id,
            stageName: a.stageName,
            coverUrl: this.storage.publicUrl(a.coverKey),
            contentUsagePolicy: a.contentUsagePolicy,
            genres: a.genres.map(({ genre }) => ({
              id: genre.id,
              slug: genre.slug,
              name: genre.name,
            })),
          }
        : null,
      creatorProfile: u.creatorProfile
        ? { focus: u.creatorProfile.focus, portfolioUrl: u.creatorProfile.portfolioUrl }
        : null,
      organizerProfile: u.organizerProfile
        ? {
            organizationName: u.organizerProfile.organizationName,
            contactEmail: u.organizerProfile.contactEmail,
            contactPhone: u.organizerProfile.contactPhone,
            website: u.organizerProfile.website,
          }
        : null,
      interests: u.interests.map(({ genre }) => ({
        id: genre.id,
        slug: genre.slug,
        name: genre.name,
      })),
    };
  }
}
