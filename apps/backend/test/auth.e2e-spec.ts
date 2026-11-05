import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';

const PASSWORD = 'correct-horse-battery';
let seq = 0;
const uniqueEmail = () => `user${Date.now()}_${seq++}@test.muso`;

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let mail: MailService;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  /** Pulls the most recent 6-digit code mailed to `email`. */
  const lastCode = (email: string) => {
    const msg = [...mail.outbox].reverse().find((m) => m.to === email);
    const code = msg?.text.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`no code mailed to ${email}`);
    return code;
  };

  const signUp = async (email = uniqueEmail()) => {
    const res = await http()
      .post('/v1/auth/sign-up')
      .send({ email, password: PASSWORD })
      .expect(201);
    return { email, ...res.body.data };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    mail = app.get(MailService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@test.muso' } } });
    await app.close();
  });

  describe('sign up', () => {
    it('creates an unverified SUPPORTER account and returns a session', async () => {
      const s = await signUp();
      expect(s.user).toMatchObject({
        emailVerified: false,
        roles: ['SUPPORTER'],
        onboarded: false,
      });
      expect(s.tokens.accessToken).toEqual(expect.any(String));
      expect(s.tokens.refreshToken).toEqual(expect.any(String));
    });

    it('normalises email case and rejects duplicates with 409', async () => {
      const email = uniqueEmail();
      await signUp(email);
      const res = await http()
        .post('/v1/auth/sign-up')
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('rejects invalid input with field details', async () => {
      const res = await http()
        .post('/v1/auth/sign-up')
        .send({ email: 'nope', password: 'x' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });

    it('never stores the plain password', async () => {
      const { email } = await signUp();
      const row = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    });
  });

  describe('sign in', () => {
    it('signs in with correct credentials', async () => {
      const { email } = await signUp();
      const res = await http()
        .post('/v1/auth/sign-in')
        .send({ email, password: PASSWORD })
        .expect(200);
      expect(res.body.data.user.email).toBe(email);
    });

    it('returns the same generic error for wrong password and unknown email', async () => {
      const { email } = await signUp();
      const wrong = await http()
        .post('/v1/auth/sign-in')
        .send({ email, password: 'wrong-password' })
        .expect(401);
      const unknown = await http()
        .post('/v1/auth/sign-in')
        .send({ email: uniqueEmail(), password: PASSWORD })
        .expect(401);
      expect(wrong.body.error).toEqual(unknown.body.error);
    });
  });

  describe('protected routes', () => {
    it('rejects requests without a token', async () => {
      const res = await http().get('/v1/auth/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a tampered token', async () => {
      const { tokens } = await signUp();
      await http()
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}x`)
        .expect(401);
    });

    it('returns the current user with a valid token', async () => {
      const { tokens, email } = await signUp();
      const res = await http()
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
      expect(res.body.data.email).toBe(email);
    });

    it('rejects tokens of soft-deleted users', async () => {
      const { tokens, email } = await signUp();
      await prisma.user.update({ where: { email }, data: { deletedAt: new Date() } });
      await http()
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);
    });
  });

  describe('refresh token rotation', () => {
    it('rotates the refresh token and the old one stops working', async () => {
      const { tokens } = await signUp();
      const r1 = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      expect(r1.body.data.tokens.refreshToken).not.toBe(tokens.refreshToken);
      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: r1.body.data.tokens.refreshToken })
        .expect(200);
    });

    it('revokes the whole session family when a rotated token is reused', async () => {
      const { tokens } = await signUp();
      const r1 = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      // Attacker replays the old token:
      await http().post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
      // The legitimate newer token is now dead too:
      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: r1.body.data.tokens.refreshToken })
        .expect(401);
    });

    it('only one of two concurrent refreshes with the same token succeeds', async () => {
      const { tokens } = await signUp();
      const results = await Promise.all([
        http().post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }),
        http().post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('sign-out revokes the refresh token', async () => {
      const { tokens } = await signUp();
      await http()
        .post('/v1/auth/sign-out')
        .send({ refreshToken: tokens.refreshToken })
        .expect(204);
      await http().post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
    });
  });

  describe('email verification', () => {
    it('verifies with the mailed code', async () => {
      const { email, tokens } = await signUp();
      const res = await http()
        .post('/v1/auth/verify-email')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ code: lastCode(email) })
        .expect(200);
      expect(res.body.data.emailVerified).toBe(true);
    });

    it('rejects a wrong code and locks out after 5 attempts', async () => {
      const { email, tokens } = await signUp();
      const real = lastCode(email);
      const wrong = real === '000000' ? '111111' : '000000';
      const auth = { Authorization: `Bearer ${tokens.accessToken}` };
      for (let i = 0; i < 5; i++) {
        await http().post('/v1/auth/verify-email').set(auth).send({ code: wrong }).expect(400);
      }
      // Even the correct code is refused once attempts are exhausted.
      await http().post('/v1/auth/verify-email').set(auth).send({ code: real }).expect(400);
    });
  });

  describe('password reset', () => {
    it('resets the password, signs out all devices, and allows sign-in with the new password', async () => {
      const { email, tokens } = await signUp();
      await http().post('/v1/auth/password/forgot').send({ email }).expect(204);
      const newPassword = 'a-brand-new-password';
      await http()
        .post('/v1/auth/password/reset')
        .send({ email, code: lastCode(email), newPassword })
        .expect(204);

      await http().post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
      await http().post('/v1/auth/sign-in').send({ email, password: PASSWORD }).expect(401);
      await http().post('/v1/auth/sign-in').send({ email, password: newPassword }).expect(200);
    });

    it('does not reveal whether an email is registered', async () => {
      await http().post('/v1/auth/password/forgot').send({ email: uniqueEmail() }).expect(204);
      const res = await http()
        .post('/v1/auth/password/reset')
        .send({ email: uniqueEmail(), code: '123456', newPassword: 'whatever-long-enough' })
        .expect(400);
      expect(res.body.error.message).toBe('That code is invalid or has expired');
    });
  });
});
