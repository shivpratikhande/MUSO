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
  // Money rows reference users without cascades (financial records are never cascaded away),
  // so test cleanup removes them explicitly. Ledger entries are append-only and stay.
  await prisma.earning.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.contentEntitlement.deleteMany({
    where: {
      OR: [
        { userId: { in: ids } },
        { payment: { OR: [{ payerId: { in: ids } }, { payeeId: { in: ids } }] } },
      ],
    },
  });
  await prisma.paymentIntent.deleteMany({
    where: { OR: [{ payerId: { in: ids } }, { payeeId: { in: ids } }] },
  });
  await prisma.arcPayout.deleteMany({
    where: { OR: [{ creatorId: { in: ids } }, { pool: { creatorId: { in: ids } } }] },
  });
  await prisma.rewardPool.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.predictionPick.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { market: { creatorId: { in: ids } } }] },
  });
  await prisma.predictionMarket.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.post.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.event.deleteMany({ where: { organizerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  // Passwordless agent buyers created by x402 tests.
  const agents = await prisma.user.findMany({
    where: { email: { endsWith: '@agents.muso.invalid' } },
    select: { id: true },
  });
  const agentIds = agents.map((a) => a.id);
  await prisma.contentEntitlement.deleteMany({ where: { userId: { in: agentIds } } });
  await prisma.earning.deleteMany({ where: { payment: { payerId: { in: agentIds } } } });
  await prisma.paymentIntent.deleteMany({ where: { payerId: { in: agentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: agentIds } } });
}

/** Presigns and uploads an original capture to the private bucket. Returns the storage key. */
export async function uploadOriginal(
  app: INestApplication,
  user: TestUser,
  type: 'PHOTO' | 'VIDEO',
  body: Buffer,
  contentType: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/posts/uploads/presign')
    .set(user.auth)
    .send({ type, contentType, sizeBytes: body.length })
    .expect(201);
  const { uploadUrl, headers, key } = res.body.data;
  const put = await fetch(uploadUrl, { method: 'PUT', headers, body: new Uint8Array(body) });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);
  return key;
}

/** Polls a post until it leaves PROCESSING. */
export async function waitForPost(
  app: INestApplication,
  user: TestUser,
  id: string,
  timeoutMs = 45_000,
) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app.getHttpServer())
      .get(`/v1/posts/${id}`)
      .set(user.auth)
      .expect(200);
    if (res.body.data.status !== 'PROCESSING') return res.body.data;
    if (Date.now() > until) throw new Error(`post ${id} still processing`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
