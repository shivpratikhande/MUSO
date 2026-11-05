import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { MediaProcessor } from './media-processor.service.js';
import { MEDIA_QUEUE, bullConnection, queuePrefix } from './media.queue.js';

/** Runs media jobs in-process (2 at a time). Disable with MEDIA_WORKER_ENABLED=false. */
@Injectable()
export class MediaWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaWorker.name);
  private worker?: Worker;
  private connection?: Redis;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly processor: MediaProcessor,
  ) {}

  onModuleInit(): void {
    if (!this.config.get('MEDIA_WORKER_ENABLED', { infer: true })) return;
    this.connection = bullConnection(this.config.get('REDIS_URL', { infer: true }));
    this.worker = new Worker<{ postId: string }>(
      MEDIA_QUEUE,
      async (job) => {
        const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        await this.processor.process(job.data.postId, finalAttempt);
      },
      {
        connection: this.connection,
        prefix: queuePrefix(this.config.get('NODE_ENV', { infer: true })),
        concurrency: 2,
      },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`media job ${job?.id} failed: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
