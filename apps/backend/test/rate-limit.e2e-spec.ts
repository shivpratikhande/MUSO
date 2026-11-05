import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env['THROTTLE_IN_TESTS'] = '1';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env['THROTTLE_IN_TESTS'];
    await app.close();
  });

  it('blocks brute-force sign-in attempts with 429', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/v1/auth/sign-in')
        .send({ email: 'nobody@test.muso', password: 'wrong-password' });

    for (let i = 0; i < 10; i++) await attempt().expect(401);
    const res = await attempt().expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
