import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { UserRole } from '@muso/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';

export const TEST_DOMAIN = '@test.muso';
let seq = 0;
export const uniq = (p = 'x') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  auth: { Authorization: string };
}

/** Signs up a user and (by default) marks the email verified. Optionally grants roles directly. */
export async function makeUser(
  app: INestApplication,
  prisma: PrismaService,
  opts: { roles?: UserRole[]; verified?: boolean } = {},
): Promise<TestUser> {
  const email = `${uniq('u')}${TEST_DOMAIN}`;
  const res = await request(app.getHttpServer())
    .post('/v1/auth/sign-up')
    .send({ email, password: 'correct-horse-battery', displayName: 'Test User' })
    .expect(201);
  const id: string = res.body.data.user.id;
  if (opts.verified !== false)
    await prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  if (opts.roles?.length) {
    await prisma.userRole.createMany({
      data: opts.roles.map((role) => ({ userId: id, role })),
      skipDuplicates: true,
    });
  }
  const token: string = res.body.data.tokens.accessToken;
  return { id, email, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function makeOrganizer(
  app: INestApplication,
  prisma: PrismaService,
  extraRoles: UserRole[] = [],
) {
  const u = await makeUser(app, prisma, { roles: ['ORGANIZER', ...extraRoles] });
  await prisma.organizerProfile.create({
    data: { userId: u.id, organizationName: 'Test Promotions', contactEmail: u.email },
  });
  return u;
}

export async function makeArtist(
  app: INestApplication,
  prisma: PrismaService,
  stageName = uniq('Artist '),
) {
  const u = await makeUser(app, prisma, { roles: ['ARTIST'] });
  const artist = await prisma.artistProfile.create({ data: { userId: u.id, stageName } });
  return { ...u, artistId: artist.id, stageName };
}

/** 1×1 transparent PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Presigns and really uploads an image to storage. Returns the storage key. */
export async function uploadImage(
  app: INestApplication,
  user: TestUser,
  purpose: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/uploads/presign')
    .set(user.auth)
    .send({ purpose, contentType: 'image/png', sizeBytes: TINY_PNG.length })
    .expect(201);
  const { uploadUrl, headers, key } = res.body.data;
  const put = await fetch(uploadUrl, { method: 'PUT', headers, body: TINY_PNG });
  if (!put.ok) throw new Error(`upload failed: ${put.status} ${await put.text()}`);
  return key;
}

export async function cleanupTestUsers(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: TEST_DOMAIN } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.event.deleteMany({ where: { organizerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
