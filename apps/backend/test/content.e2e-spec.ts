import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  cleanupTestUsers,
  createTestApp,
  makeArtist,
  makeOrganizer,
  makeUser,
  uniq,
  uploadOriginal,
  waitForPost,
  type TestUser,
} from './helpers.js';
import { jpegWithGps, video } from './media-fixtures.js';

const HOUR = 3_600_000;

describe('Content: capture, processing, social (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let photo: Buffer;
  const http = () => request(app.getHttpServer());

  /** Upload + create + wait. Returns the published (or failed) post DTO. */
  const publish = async (
    user: TestUser,
    opts: {
      type?: 'PHOTO' | 'VIDEO';
      body?: Buffer;
      caption?: string;
      eventId?: string;
      artistIds?: string[];
    } = {},
  ) => {
    const type = opts.type ?? 'PHOTO';
    const key = await uploadOriginal(
      app,
      user,
      type,
      opts.body ?? photo,
      type === 'PHOTO' ? 'image/jpeg' : 'video/mp4',
    );
    const res = await http()
      .post('/v1/posts')
      .set(user.auth)
      .send({
        clientRequestId: randomUUID(),
        mediaKey: key,
        type,
        caption: opts.caption ?? '',
        eventId: opts.eventId,
        artistIds: opts.artistIds ?? [],
        rightsConfirmed: true,
      })
      .expect(201);
    return waitForPost(app, user, res.body.data.id);
  };

  const makeEvent = async (over: Record<string, unknown> = {}) => {
    const org = await makeOrganizer(app, prisma);
    const e = await prisma.event.create({
      data: {
        organizerId: org.id,
        title: 'Test Night',
        description: 'x',
        venueName: 'Hall',
        city: uniq('City'),
        country: 'IN',
        startsAt: new Date(Date.now() - HOUR),
        endsAt: new Date(Date.now() + 3 * HOUR),
        reviewStatus: 'APPROVED',
        ...over,
      },
    });
    return e;
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    photo = await jpegWithGps();
  });
  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  describe('uploading & processing', () => {
    it('requires a verified email to upload', async () => {
      const u = await makeUser(app, prisma, { verified: false });
      await http()
        .post('/v1/posts/uploads/presign')
        .set(u.auth)
        .send({ type: 'PHOTO', contentType: 'image/jpeg', sizeBytes: 100 })
        .expect(403);
    });

    it('processes a photo: strips GPS/EXIF, makes display + thumbnail, keeps the original private', async () => {
      const u = await makeUser(app, prisma);
      const post = await publish(u, { caption: 'What a night #LiveMusic #mumbai' });
      expect(post).toMatchObject({
        status: 'PUBLISHED',
        type: 'PHOTO',
        hashtags: ['livemusic', 'mumbai'],
        isOfficial: false,
      });
      expect(post.media.width).toBe(640);

      const display = Buffer.from(await (await fetch(post.media.url)).arrayBuffer());
      const meta = await sharp(display).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect((await fetch(post.media.thumbUrl)).status).toBe(200);

      // The private bucket is not publicly readable.
      const row = await prisma.postMedia.findFirstOrThrow({ where: { postId: post.id } });
      const unsigned = await fetch(`http://localhost:9000/muso-private/${row.originalKey}`);
      expect(unsigned.status).toBe(403);
    });

    it('transcodes video to mp4 with duration and poster', async () => {
      const u = await makeUser(app, prisma);
      const post = await publish(u, { type: 'VIDEO', body: video(3) });
      expect(post.status).toBe('PUBLISHED');
      expect(post.media.durationMs).toBeGreaterThan(2500);
      const res = await fetch(post.media.url);
      expect(res.headers.get('content-type')).toBe('video/mp4');
      expect((await fetch(post.media.thumbUrl)).status).toBe(200);
    });

    it('fails videos over 3 minutes with a clear reason and notifies the author', async () => {
      const u = await makeUser(app, prisma);
      const post = await publish(u, { type: 'VIDEO', body: video(185, 'long') });
      expect(post.status).toBe('FAILED');
      expect(post.failureReason).toMatch(/at most 3 minutes/);
      const n = await http().get('/v1/notifications').set(u.auth).expect(200);
      expect(n.body.data.items[0]).toMatchObject({ type: 'POST_FAILED' });
    });

    it('is idempotent per clientRequestId and refuses to reuse a file', async () => {
      const u = await makeUser(app, prisma);
      const key = await uploadOriginal(app, u, 'PHOTO', photo, 'image/jpeg');
      const body = {
        clientRequestId: randomUUID(),
        mediaKey: key,
        type: 'PHOTO',
        rightsConfirmed: true,
      };
      const a = await http().post('/v1/posts').set(u.auth).send(body).expect(201);
      const b = await http().post('/v1/posts').set(u.auth).send(body).expect(201);
      expect(b.body.data.id).toBe(a.body.data.id);
      await http()
        .post('/v1/posts')
        .set(u.auth)
        .send({ ...body, clientRequestId: randomUUID() })
        .expect(409);
    });

    it("rejects someone else's file, missing files, wrong types and missing rights confirmation", async () => {
      const owner = await makeUser(app, prisma);
      const thief = await makeUser(app, prisma);
      const key = await uploadOriginal(app, owner, 'PHOTO', photo, 'image/jpeg');
      const base = { clientRequestId: randomUUID(), type: 'PHOTO', rightsConfirmed: true };
      await http()
        .post('/v1/posts')
        .set(thief.auth)
        .send({ ...base, mediaKey: key })
        .expect(400);
      await http()
        .post('/v1/posts')
        .set(owner.auth)
        .send({ ...base, mediaKey: `originals/${owner.id}/nope.jpg` })
        .expect(400);
      await http()
        .post('/v1/posts')
        .set(owner.auth)
        .send({ ...base, mediaKey: key, type: 'VIDEO' })
        .expect(400);
      await http()
        .post('/v1/posts')
        .set(owner.auth)
        .send({ ...base, mediaKey: key, rightsConfirmed: false })
        .expect(400);
    });

    it('hides processing posts from everyone but the author', async () => {
      const u = await makeUser(app, prisma);
      const other = await makeUser(app, prisma);
      const key = await uploadOriginal(app, u, 'VIDEO', video(2, 'hidden'), 'video/mp4');
      const res = await http()
        .post('/v1/posts')
        .set(u.auth)
        .send({
          clientRequestId: randomUUID(),
          mediaKey: key,
          type: 'VIDEO',
          rightsConfirmed: true,
        })
        .expect(201);
      // Immediately after creation it's still processing.
      await http().get(`/v1/posts/${res.body.data.id}`).set(other.auth).expect(404);
      await waitForPost(app, u, res.body.data.id);
      await http().get(`/v1/posts/${res.body.data.id}`).set(other.auth).expect(200);
    });
  });

  describe('events, artists & consent', () => {
    it('posts to a live event and shows up in its feed and the Live tab', async () => {
      const u = await makeUser(app, prisma);
      const e = await makeEvent();
      const post = await publish(u, { eventId: e.id });
      expect(post.event).toMatchObject({ id: e.id, status: 'LIVE' });
      const list = await http().get(`/v1/events/${e.id}/posts`).set(u.auth).expect(200);
      expect(list.body.data.items.map((p: { id: string }) => p.id)).toContain(post.id);
      const live = await http()
        .get('/v1/feed')
        .query({ tab: 'live', limit: 50 })
        .set(u.auth)
        .expect(200);
      expect(live.body.data.items.map((p: { id: string }) => p.id)).toContain(post.id);
    });

    it('enforces event timing and recording policies', async () => {
      const u = await makeUser(app, prisma);
      const key = await uploadOriginal(app, u, 'PHOTO', photo, 'image/jpeg');
      const vkey = await uploadOriginal(app, u, 'VIDEO', video(2, 'policy'), 'video/mp4');
      const post = (eventId: string, mediaKey = key, type = 'PHOTO') =>
        http()
          .post('/v1/posts')
          .set(u.auth)
          .send({ clientRequestId: randomUUID(), mediaKey, type, eventId, rightsConfirmed: true });

      const upcoming = await makeEvent({
        startsAt: new Date(Date.now() + HOUR),
        endsAt: new Date(Date.now() + 3 * HOUR),
      });
      await post(upcoming.id).expect(400);
      const noRec = await makeEvent({ recordingPolicy: 'NOT_ALLOWED' });
      await post(noRec.id).expect(403);
      const photosOnly = await makeEvent({ recordingPolicy: 'PHOTOS_ONLY' });
      await post(photosOnly.id, vkey, 'VIDEO').expect(403);
      const pending = await makeEvent({ reviewStatus: 'PENDING' });
      await post(pending.id).expect(404);
    });

    it("respects an artist's no-recordings wish and only marks artists' own posts official", async () => {
      const fan = await makeUser(app, prisma);
      const shy = await makeArtist(app, prisma);
      await prisma.artistProfile.update({
        where: { id: shy.artistId },
        data: { contentUsagePolicy: 'NO_RECORDINGS' },
      });
      const key = await uploadOriginal(app, fan, 'PHOTO', photo, 'image/jpeg');
      const res = await http()
        .post('/v1/posts')
        .set(fan.auth)
        .send({
          clientRequestId: randomUUID(),
          mediaKey: key,
          type: 'PHOTO',
          artistIds: [shy.artistId],
          rightsConfirmed: true,
        })
        .expect(403);
      expect(res.body.error.message).toMatch(/asked fans not to post/);

      // The artist themselves can still post and is marked official.
      const own = await publish(shy, { artistIds: [shy.artistId] });
      expect(own.isOfficial).toBe(true);

      const open = await makeArtist(app, prisma);
      const fanPost = await publish(fan, { artistIds: [open.artistId] });
      expect(fanPost.isOfficial).toBe(false);
      const tagged = await http()
        .get(`/v1/artists/${open.artistId}/posts`)
        .set(fan.auth)
        .expect(200);
      expect(tagged.body.data.items.map((p: { id: string }) => p.id)).toContain(fanPost.id);
    });

    it('notifies tagged artists and mentioned users on publish', async () => {
      const fan = await makeUser(app, prisma);
      const artist = await makeArtist(app, prisma);
      const friend = await makeUser(app, prisma);
      const handle = uniq('friend_');
      await prisma.user.update({ where: { id: friend.id }, data: { username: handle } });
      await publish(fan, { artistIds: [artist.artistId], caption: `with @${handle}!` });
      const a = await http().get('/v1/notifications').set(artist.auth).expect(200);
      expect(a.body.data.items.map((n: { type: string }) => n.type)).toContain('TAGGED_IN_POST');
      const f = await http().get('/v1/notifications').set(friend.auth).expect(200);
      expect(f.body.data.items.map((n: { type: string }) => n.type)).toContain('MENTIONED');
    });
  });

  describe('likes, saves & comments', () => {
    it('likes idempotently, keeps counts consistent and notifies once', async () => {
      const author = await makeUser(app, prisma);
      const fan = await makeUser(app, prisma);
      const post = await publish(author);
      await http().put(`/v1/posts/${post.id}/like`).set(fan.auth).expect(200);
      const twice = await http().put(`/v1/posts/${post.id}/like`).set(fan.auth).expect(200);
      expect(twice.body.data).toMatchObject({ likeCount: 1, viewer: { liked: true } });
      const off = await http().delete(`/v1/posts/${post.id}/like`).set(fan.auth).expect(200);
      expect(off.body.data).toMatchObject({ likeCount: 0, viewer: { liked: false } });
      await http().delete(`/v1/posts/${post.id}/like`).set(fan.auth).expect(200);

      const n = await http().get('/v1/notifications').set(author.auth).expect(200);
      expect(
        n.body.data.items.filter((x: { type: string }) => x.type === 'POST_LIKED'),
      ).toHaveLength(1);
    });

    it('saves posts and lists them', async () => {
      const author = await makeUser(app, prisma);
      const fan = await makeUser(app, prisma);
      const post = await publish(author);
      const s = await http().put(`/v1/posts/${post.id}/save`).set(fan.auth).expect(200);
      expect(s.body.data).toMatchObject({ saveCount: 1, viewer: { saved: true } });
      const list = await http().get('/v1/posts/saved').set(fan.auth).expect(200);
      expect(list.body.data.items.map((p: { id: string }) => p.id)).toEqual([post.id]);
    });

    it('supports one level of replies, counts, notifications and cascading deletes', async () => {
      const author = await makeUser(app, prisma);
      const a = await makeUser(app, prisma);
      const b = await makeUser(app, prisma);
      const post = await publish(author);

      const top = await http()
        .post(`/v1/posts/${post.id}/comments`)
        .set(a.auth)
        .send({ body: 'Incredible shot' })
        .expect(201);
      const reply = await http()
        .post(`/v1/posts/${post.id}/comments`)
        .set(b.auth)
        .send({ body: 'Agreed!', parentId: top.body.data.id })
        .expect(201);
      await http()
        .post(`/v1/posts/${post.id}/comments`)
        .set(a.auth)
        .send({ body: 'nested', parentId: reply.body.data.id })
        .expect(400);
      await http()
        .post(`/v1/posts/${post.id}/comments`)
        .set(a.auth)
        .send({ body: '   ' })
        .expect(400);

      const list = await http().get(`/v1/posts/${post.id}/comments`).set(author.auth).expect(200);
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.items[0]).toMatchObject({ replyCount: 1, canDelete: true });
      const replies = await http()
        .get(`/v1/posts/${post.id}/comments`)
        .query({ parentId: top.body.data.id })
        .set(a.auth)
        .expect(200);
      expect(replies.body.data.items[0].body).toBe('Agreed!');

      const na = await http().get('/v1/notifications').set(a.auth).expect(200);
      expect(na.body.data.items.map((n: { type: string }) => n.type)).toContain('COMMENT_REPLIED');

      await http().delete(`/v1/comments/${top.body.data.id}`).set(b.auth).expect(403);
      await http().delete(`/v1/comments/${top.body.data.id}`).set(author.auth).expect(204);
      const after = await http().get(`/v1/posts/${post.id}`).set(a.auth).expect(200);
      expect(after.body.data.commentCount).toBe(0);
    });

    it('deleted posts disappear', async () => {
      const author = await makeUser(app, prisma);
      const other = await makeUser(app, prisma);
      const post = await publish(author);
      await http().delete(`/v1/posts/${post.id}`).set(other.auth).expect(403);
      await http().delete(`/v1/posts/${post.id}`).set(author.auth).expect(204);
      await http().get(`/v1/posts/${post.id}`).set(other.auth).expect(404);
    });
  });

  describe('follows, blocks & feed', () => {
    it('follows users, notifies and shows their posts in For You', async () => {
      const creator = await makeUser(app, prisma);
      const fan = await makeUser(app, prisma);
      const stranger = await makeUser(app, prisma);
      // Give the fan a signal so For You is filtered rather than "everything".
      await http().put(`/v1/users/${fan.id}/follow`).set(fan.auth).expect(400); // not yourself
      const p = await http().put(`/v1/users/${creator.id}/follow`).set(fan.auth).expect(200);
      expect(p.body.data).toMatchObject({ followerCount: 1, viewer: { following: true } });
      await http().put(`/v1/users/${creator.id}/follow`).set(fan.auth).expect(200); // idempotent

      const followed = await publish(creator);
      const unrelated = await publish(stranger);
      const feed = await http()
        .get('/v1/feed')
        .query({ tab: 'for_you', limit: 50 })
        .set(fan.auth)
        .expect(200);
      const ids = feed.body.data.items.map((x: { id: string }) => x.id);
      expect(ids).toContain(followed.id);
      expect(ids).not.toContain(unrelated.id);
      expect(
        feed.body.data.items.find((x: { id: string }) => x.id === followed.id).viewer
          .followingAuthor,
      ).toBe(true);

      const n = await http().get('/v1/notifications').set(creator.auth).expect(200);
      expect(
        n.body.data.items.filter((x: { type: string }) => x.type === 'NEW_FOLLOWER'),
      ).toHaveLength(1);
    });

    it('blocking hides content both ways and removes follows', async () => {
      const a = await makeUser(app, prisma);
      const b = await makeUser(app, prisma);
      await http().put(`/v1/users/${a.id}/follow`).set(b.auth).expect(200);
      const post = await publish(a);

      const blocked = await http().put(`/v1/users/${b.id}/block`).set(a.auth).expect(200);
      expect(blocked.body.data.viewer).toMatchObject({ blocked: true, following: false });
      await http().get(`/v1/users/${a.id}`).set(b.auth).expect(404);
      await http().get(`/v1/posts/${post.id}`).set(b.auth).expect(404);
      await http().put(`/v1/users/${a.id}/follow`).set(b.auth).expect(403);
      const feed = await http()
        .get('/v1/feed')
        .query({ tab: 'photos', limit: 50 })
        .set(b.auth)
        .expect(200);
      expect(feed.body.data.items.map((x: { id: string }) => x.id)).not.toContain(post.id);

      await http().delete(`/v1/users/${b.id}/block`).set(a.auth).expect(200);
      await http().get(`/v1/posts/${post.id}`).set(b.auth).expect(200);
    });

    it('filters by type and ranks trending by engagement', async () => {
      const author = await makeUser(app, prisma);
      const fans = await Promise.all([1, 2, 3].map(() => makeUser(app, prisma)));
      const quiet = await publish(author);
      const hot = await publish(author);
      for (const f of fans) await http().put(`/v1/posts/${hot.id}/like`).set(f.auth).expect(200);

      const trending = await http()
        .get('/v1/feed')
        .query({ tab: 'trending', limit: 50 })
        .set(author.auth)
        .expect(200);
      const ids = trending.body.data.items.map((x: { id: string }) => x.id);
      expect(ids.indexOf(hot.id)).toBeLessThan(ids.indexOf(quiet.id));

      const videos = await http()
        .get('/v1/feed')
        .query({ tab: 'videos', limit: 50 })
        .set(author.auth)
        .expect(200);
      expect(videos.body.data.items.every((x: { type: string }) => x.type === 'VIDEO')).toBe(true);
    });

    it('lists posts by hashtag and user', async () => {
      const u = await makeUser(app, prisma);
      const tag = uniq('tag').toLowerCase();
      const post = await publish(u, { caption: `#${tag}` });
      const byTag = await http().get(`/v1/hashtags/${tag}/posts`).set(u.auth).expect(200);
      expect(byTag.body.data.items.map((x: { id: string }) => x.id)).toEqual([post.id]);
      const byUser = await http().get(`/v1/users/${u.id}/posts`).set(u.auth).expect(200);
      expect(byUser.body.data.items.map((x: { id: string }) => x.id)).toContain(post.id);
    });

    it('saves fan interests', async () => {
      const u = await makeUser(app, prisma);
      const genres = await http().get('/v1/genres').expect(200);
      const res = await http()
        .put('/v1/me/interests')
        .set(u.auth)
        .send({ genreIds: [genres.body.data[0].id] })
        .expect(200);
      expect(res.body.data.interests).toHaveLength(1);
    });
  });

  describe('reports & notifications', () => {
    it('auto-hides a post after 5 distinct reports and lets an admin restore it', async () => {
      const author = await makeUser(app, prisma);
      const admin = await makeUser(app, prisma, { roles: ['ADMIN'] });
      const post = await publish(author);
      const reporters = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser(app, prisma)));
      for (const r of reporters) {
        await http()
          .post('/v1/reports')
          .set(r.auth)
          .send({ targetType: 'POST', targetId: post.id, reason: 'SPAM' })
          .expect(200);
      }
      // Re-reporting is idempotent and doesn't double count.
      await http()
        .post('/v1/reports')
        .set(reporters[0]!.auth)
        .send({ targetType: 'POST', targetId: post.id, reason: 'SPAM' })
        .expect(200);
      await http().get(`/v1/posts/${post.id}`).set(reporters[0]!.auth).expect(404);

      await http().get('/v1/admin/reports').set(author.auth).expect(403);
      const open = await http().get('/v1/admin/reports').set(admin.auth).expect(200);
      const report = open.body.data.find((r: { targetId: string }) => r.targetId === post.id);
      await http()
        .post(`/v1/admin/reports/${report.id}/resolve`)
        .set(admin.auth)
        .send({ action: 'DISMISS' })
        .expect(204);
      await http().get(`/v1/posts/${post.id}`).set(reporters[0]!.auth).expect(200);
    });

    it('counts unread notifications and marks them read', async () => {
      const a = await makeUser(app, prisma);
      const b = await makeUser(app, prisma);
      await http().put(`/v1/users/${a.id}/follow`).set(b.auth).expect(200);
      const before = await http().get('/v1/notifications/unread-count').set(a.auth).expect(200);
      expect(before.body.data.count).toBe(1);
      await http().post('/v1/notifications/read').set(a.auth).send({}).expect(204);
      const after = await http().get('/v1/notifications/unread-count').set(a.auth).expect(200);
      expect(after.body.data.count).toBe(0);
    });
  });
});
