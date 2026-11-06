import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAX_VIDEO_SECONDS } from '@muso/shared';
import { UnrecoverableError } from 'bullmq';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp, { type OutputInfo } from 'sharp';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PostsService } from '../posts/posts.service.js';
import { MediaDerivatives } from './media-derivatives.service.js';

const run = promisify(execFile);

const DISPLAY_PHOTO_PX = 1440;
const THUMB_PX = 540;
const VIDEO_LONG_EDGE = 1280;

interface Derived {
  displayKey: string;
  thumbKey: string;
  width: number;
  height: number;
  durationMs: number | null;
}

/**
 * Generates safe, optimised derivatives for a post's media.
 *  - Photos: auto-rotated, metadata (incl. GPS) stripped, display + thumbnail WebP.
 *  - Videos: probed, length-checked, transcoded to H.264/AAC MP4 with faststart (streams on
 *    every phone), metadata stripped, poster frame + WebP thumbnail.
 * The original stays in the private bucket and is never served.
 */
@Injectable()
export class MediaProcessor {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly posts: PostsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
    private readonly derivatives: MediaDerivatives,
  ) {}

  async process(postId: string, finalAttempt: boolean): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { media: true },
    });
    if (!post || post.deletedAt || post.status !== 'PROCESSING') return;
    const media = post.media[0];
    if (!media) return this.fail(postId, post.authorId, 'No media attached');

    const dir = await mkdtemp(join(tmpdir(), 'muso-media-'));
    try {
      const original = join(dir, 'original');
      await this.storage.downloadPrivate(media.originalKey, original);
      const derived =
        media.type === 'PHOTO'
          ? await this.photo(postId, original, dir)
          : await this.video(postId, original, dir);
      await this.prisma.postMedia.update({ where: { id: media.id }, data: derived });
      // The blurred preview must exist before publishing, so locked posts never show nothing.
      await this.derivatives.ensurePreview(postId);
      await this.prisma.post.update({
        where: { id: postId },
        data: { status: 'PUBLISHED', publishedAt: new Date(), failureReason: null },
      });
      await this.posts.onPublished(postId);
      this.logger.log(`Published post ${postId}`);
    } catch (err) {
      if (err instanceof UnrecoverableError || finalAttempt) {
        const reason =
          err instanceof UnrecoverableError
            ? err.message
            : 'We couldn’t process this file. Please try another.';
        await this.fail(postId, post.authorId, reason);
      }
      throw err;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async fail(postId: string, authorId: string, reason: string): Promise<void> {
    await this.prisma.post.update({
      where: { id: postId },
      data: { status: 'FAILED', failureReason: reason },
    });
    await this.notifications.notify({ userId: authorId, type: 'POST_FAILED', postId });
  }

  private async photo(postId: string, input: string, dir: string): Promise<Derived> {
    const displayPath = join(dir, 'display.webp');
    const thumbPath = join(dir, 'thumb.webp');
    let info: OutputInfo;
    try {
      // sharp drops EXIF/GPS by default (no .withMetadata()).
      info = await sharp(input, { failOn: 'error' })
        .rotate()
        .resize({
          width: DISPLAY_PHOTO_PX,
          height: DISPLAY_PHOTO_PX,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toFile(displayPath);
      await sharp(displayPath)
        .resize({ width: THUMB_PX, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toFile(thumbPath);
    } catch {
      throw new UnrecoverableError('That image couldn’t be read. Try a JPEG or PNG.');
    }
    const base = `derived/${postId}`;
    await this.storage.uploadPrivate(`${base}/display.webp`, displayPath, 'image/webp');
    await this.storage.uploadPrivate(`${base}/thumb.webp`, thumbPath, 'image/webp');
    return {
      displayKey: `${base}/display.webp`,
      thumbKey: `${base}/thumb.webp`,
      width: info.width,
      height: info.height,
      durationMs: null,
    };
  }

  private async video(postId: string, input: string, dir: string): Promise<Derived> {
    const ffprobe = this.config.get('FFPROBE_PATH', { infer: true });
    const ffmpeg = this.config.get('FFMPEG_PATH', { infer: true });

    let duration: number;
    try {
      const { stdout } = await run(
        ffprobe,
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input],
        { timeout: 30_000 },
      );
      const meta = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: { codec_type: string }[];
      };
      if (!meta.streams?.some((s) => s.codec_type === 'video')) throw new Error('no video stream');
      duration = Number(meta.format?.duration ?? 0);
    } catch {
      throw new UnrecoverableError(
        'That video couldn’t be read. Try recording again or pick another clip.',
      );
    }
    if (!duration || duration > MAX_VIDEO_SECONDS + 1) {
      throw new UnrecoverableError(
        `Videos can be at most ${MAX_VIDEO_SECONDS / 60} minutes. Trim it and try again.`,
      );
    }

    const out = join(dir, 'display.mp4');
    const poster = join(dir, 'poster.jpg');
    const thumb = join(dir, 'thumb.webp');
    // Scale so the long edge is ≤ 1280 (keeps portrait phone video portrait), even dimensions for H.264.
    const scale = `scale='if(gt(iw,ih),min(${VIDEO_LONG_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${VIDEO_LONG_EDGE},ih))'`;
    try {
      await run(
        ffmpeg,
        [
          '-y',
          '-i',
          input,
          '-map_metadata',
          '-1',
          '-vf',
          scale,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '26',
          '-pix_fmt',
          'yuv420p',
          '-profile:v',
          'high',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-ac',
          '2',
          '-movflags',
          '+faststart',
          out,
        ],
        { timeout: 10 * 60_000 },
      );
      await run(
        ffmpeg,
        [
          '-y',
          '-ss',
          String(Math.min(1, duration / 2)),
          '-i',
          out,
          '-frames:v',
          '1',
          '-q:v',
          '3',
          poster,
        ],
        { timeout: 60_000 },
      );
    } catch (err) {
      this.logger.warn(`ffmpeg failed for ${postId}: ${(err as Error).message.slice(0, 300)}`);
      throw new UnrecoverableError('That video couldn’t be processed. Please try another clip.');
    }
    const posterMeta = await sharp(poster).metadata();
    await sharp(poster)
      .resize({ width: THUMB_PX * 2, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(thumb);

    const base = `derived/${postId}`;
    await this.storage.uploadPrivate(`${base}/display.mp4`, out, 'video/mp4');
    await this.storage.uploadPrivate(`${base}/thumb.webp`, thumb, 'image/webp');
    return {
      displayKey: `${base}/display.mp4`,
      thumbKey: `${base}/thumb.webp`,
      width: posterMeta.width ?? 0,
      height: posterMeta.height ?? 0,
      durationMs: Math.round(duration * 1000),
    };
  }
}
