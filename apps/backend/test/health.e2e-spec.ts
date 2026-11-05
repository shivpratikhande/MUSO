import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body.data.services.database).toBe('up');
    expect(res.body.data.services.redis).toBe('up');
    expect(res.body.data.status).toBe('ok');
  });

  it('returns 503 with a degraded status when the database is down', async () => {
    const prisma = app.get(PrismaService);
    const spy = vi.spyOn(prisma, 'ping').mockResolvedValueOnce(false);
    const res = await request(app.getHttpServer()).get('/v1/health').expect(503);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.services.database).toBe('down');
    spy.mockRestore();
  });

  it('unknown routes return the standard error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/v1/does-not-exist').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('sets security headers', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
