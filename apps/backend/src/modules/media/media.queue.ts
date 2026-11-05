import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';

export const MEDIA_QUEUE = 'media';

/** Queue names are namespaced per environment so dev and test workers never steal each other's jobs. */
export const queuePrefix = (env: string) => `muso:${env}`;

export function bullConnection(url: string): Redis {
  // BullMQ requires maxRetriesPerRequest: null on its connections.
  return new Redis(url, { maxRetriesPerRequest: null });
}

@Injectable()
export class MediaQueue implements OnModuleDestroy {
  private readonly queue: Queue;
  private readonly connection: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.connection = bullConnection(config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue(MEDIA_QUEUE, {
      connection: this.connection,
      prefix: queuePrefix(config.get('NODE_ENV', { infer: true })),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  /** jobId = postId, so enqueueing twice never processes twice. */
  async enqueue(postId: string): Promise<void> {
    await this.queue.add('process-post', { postId }, { jobId: postId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
