import { Injectable } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';

/**
 * On-demand derivatives used by monetisation (no dependency on posts, avoids DI cycles):
 *  - preview: tiny, heavily blurred image shown on locked content
 *  - full: full-resolution, metadata-stripped JPEG for buyers' downloads
 */
@Injectable()
export class MediaDerivatives {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async makePreviewFile(sourcePath: string, outPath: string): Promise<void> {
    await sharp(sourcePath)
      .resize({ width: 48, withoutEnlargement: true })
      .blur(4)
      .resize({ width: 480 })
      .blur(12)
      .webp({ quality: 50 })
      .toFile(outPath);
  }

  /** Ensures the post's media has a blurred preview (created from its thumbnail). */
  async ensurePreview(postId: string): Promise<void> {
    const media = await this.prisma.postMedia.findFirst({ where: { postId, position: 0 } });
    if (!media || media.previewKey || !media.thumbKey) return;
    const dir = await mkdtemp(join(tmpdir(), 'muso-preview-'));
    try {
      const thumb = join(dir, 'thumb');
      const preview = join(dir, 'preview.webp');
      await this.storage.downloadPrivate(media.thumbKey, thumb);
      await this.makePreviewFile(thumb, preview);
      const key = `derived/${postId}/preview.webp`;
      await this.storage.uploadPrivate(key, preview, 'image/webp');
      await this.prisma.postMedia.update({ where: { id: media.id }, data: { previewKey: key } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Ensures a full-resolution, metadata-free JPEG exists for a photo post. Returns its key. */
  async ensureFull(postId: string): Promise<string | null> {
    const media = await this.prisma.postMedia.findFirst({ where: { postId, position: 0 } });
    if (!media || media.type !== 'PHOTO') return null;
    if (media.fullKey) return media.fullKey;
    const dir = await mkdtemp(join(tmpdir(), 'muso-full-'));
    try {
      const original = join(dir, 'original');
      const full = join(dir, 'full.jpg');
      await this.storage.downloadPrivate(media.originalKey, original);
      await sharp(original).rotate().jpeg({ quality: 92, mozjpeg: true }).toFile(full); // no withMetadata → EXIF/GPS dropped
      const key = `derived/${postId}/full.jpg`;
      await this.storage.uploadPrivate(key, full, 'image/jpeg');
      await this.prisma.postMedia.update({ where: { id: media.id }, data: { fullKey: key } });
      return key;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
