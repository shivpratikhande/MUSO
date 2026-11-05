import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  TINY_PNG,
  cleanupTestUsers,
  createTestApp,
  makeUser,
  uniq,
  uploadImage,
} from './helpers.js';

describe('Profiles, roles, onboarding & uploads (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  it('GET /me returns the private profile', async () => {
    const u = await makeUser(app, prisma);
    const res = await http().get('/v1/me').set(u.auth).expect(200);
    expect(res.body.data).toMatchObject({
      email: u.email,
      roles: ['SUPPORTER'],
      onboarded: false,
      links: [],
    });
  });

  it('enforces unique, valid usernames', async () => {
    const a = await makeUser(app, prisma);
    const b = await makeUser(app, prisma);
    const name = uniq('user_');
    await http().patch('/v1/me').set(a.auth).send({ username: name }).expect(200);
    const dup = await http()
      .patch('/v1/me')
      .set(b.auth)
      .send({ username: name.toUpperCase() })
      .expect(409);
    expect(dup.body.error.message).toMatch(/taken/);
    await http().patch('/v1/me').set(b.auth).send({ username: 'no spaces!' }).expect(400);
  });

  it('sets roles but never grants or removes ADMIN', async () => {
    const u = await makeUser(app, prisma, { roles: ['ADMIN'] });
    await http()
      .put('/v1/me/roles')
      .set(u.auth)
      .send({ roles: ['ADMIN'] })
      .expect(400);
    const res = await http()
      .put('/v1/me/roles')
      .set(u.auth)
      .send({ roles: ['ARTIST', 'CREATOR'] })
      .expect(200);
    expect(res.body.data.roles.sort()).toEqual(['ADMIN', 'ARTIST', 'CREATOR']);
  });

  it('requires the matching role before saving a role profile', async () => {
    const u = await makeUser(app, prisma);
    await http()
      .put('/v1/me/artist-profile')
      .set(u.auth)
      .send({ stageName: 'X', genreIds: [] })
      .expect(403);
    await http()
      .put('/v1/me/organizer-profile')
      .set(u.auth)
      .send({ organizationName: 'X', contactEmail: 'x@y.co' })
      .expect(403);
  });

  it('saves an artist profile with genres and rejects unknown genres', async () => {
    const u = await makeUser(app, prisma, { roles: ['ARTIST'] });
    const genres = await http().get('/v1/genres').expect(200);
    const ids = genres.body.data.slice(0, 2).map((g: { id: string }) => g.id);
    expect(ids.length).toBe(2);
    const res = await http()
      .put('/v1/me/artist-profile')
      .set(u.auth)
      .send({ stageName: 'The Testers', genreIds: ids })
      .expect(200);
    expect(res.body.data.artistProfile.genres).toHaveLength(2);
    await http()
      .put('/v1/me/artist-profile')
      .set(u.auth)
      .send({ stageName: 'X', genreIds: ['0190a6f0-0000-7000-8000-000000000001'] })
      .expect(400);
  });

  it('completes onboarding only when every chosen role has a profile', async () => {
    const u = await makeUser(app, prisma);
    await http()
      .put('/v1/me/roles')
      .set(u.auth)
      .send({ roles: ['ORGANIZER'] })
      .expect(200);
    await http()
      .patch('/v1/me')
      .set(u.auth)
      .send({ username: uniq('org_') })
      .expect(200);
    const blocked = await http().post('/v1/me/onboarding/complete').set(u.auth).expect(400);
    expect(blocked.body.error.details.missing).toContain('your organizer details');

    await http()
      .put('/v1/me/organizer-profile')
      .set(u.auth)
      .send({ organizationName: 'Night Owls', contactEmail: 'Hello@NightOwls.in' })
      .expect(200);
    const done = await http().post('/v1/me/onboarding/complete').set(u.auth).expect(200);
    expect(done.body.data.onboarded).toBe(true);
    expect(done.body.data.organizerProfile.contactEmail).toBe('hello@nightowls.in');
    const me = await http().get('/v1/auth/me').set(u.auth).expect(200);
    expect(me.body.data.onboarded).toBe(true);
  });

  describe('uploads', () => {
    it('uploads an avatar to storage and serves it publicly', async () => {
      const u = await makeUser(app, prisma);
      const key = await uploadImage(app, u, 'AVATAR');
      expect(key).toMatch(new RegExp(`^avatars/${u.id}/`));
      const res = await http().patch('/v1/me').set(u.auth).send({ avatarKey: key }).expect(200);
      const img = await fetch(res.body.data.avatarUrl);
      expect(img.status).toBe(200);
      expect(Buffer.from(await img.arrayBuffer())).toEqual(TINY_PNG);
    });

    it("rejects attaching someone else's upload", async () => {
      const owner = await makeUser(app, prisma);
      const thief = await makeUser(app, prisma);
      const key = await uploadImage(app, owner, 'AVATAR');
      await http().patch('/v1/me').set(thief.auth).send({ avatarKey: key }).expect(400);
    });

    it('rejects a key that was presigned but never uploaded', async () => {
      const u = await makeUser(app, prisma);
      const res = await http()
        .post('/v1/uploads/presign')
        .set(u.auth)
        .send({ purpose: 'AVATAR', contentType: 'image/png', sizeBytes: 100 })
        .expect(201);
      await http().patch('/v1/me').set(u.auth).send({ avatarKey: res.body.data.key }).expect(400);
    });

    it('rejects an upload larger than the signed size', async () => {
      const u = await makeUser(app, prisma);
      const res = await http()
        .post('/v1/uploads/presign')
        .set(u.auth)
        .send({ purpose: 'AVATAR', contentType: 'image/png', sizeBytes: 10 })
        .expect(201);
      const put = await fetch(res.body.data.uploadUrl, {
        method: 'PUT',
        headers: res.body.data.headers,
        body: Buffer.alloc(5000),
      });
      expect(put.ok).toBe(false);
    });

    it('rejects disallowed file types and oversized files', async () => {
      const u = await makeUser(app, prisma);
      await http()
        .post('/v1/uploads/presign')
        .set(u.auth)
        .send({ purpose: 'AVATAR', contentType: 'application/pdf', sizeBytes: 100 })
        .expect(400);
      await http()
        .post('/v1/uploads/presign')
        .set(u.auth)
        .send({ purpose: 'AVATAR', contentType: 'image/png', sizeBytes: 50 * 1024 * 1024 })
        .expect(400);
    });
  });
});
