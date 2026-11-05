import { Injectable } from '@nestjs/common';
import type { Health } from '@muso/shared';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';

const VERSION = process.env['npm_package_version'] ?? '0.1.0';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<Health> {
    const [db, redis] = await Promise.all([this.prisma.ping(), this.redis.ping()]);
    return {
      status: db && redis ? 'ok' : 'degraded',
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      services: {
        database: db ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      },
    };
  }
}
