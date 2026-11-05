import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES, type PresignedUpload, type UploadPurpose } from '@muso/shared';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';

const PRESIGN_TTL_SECONDS = 300;

const FOLDER: Record<UploadPurpose, string> = {
  AVATAR: 'avatars',
  ARTIST_COVER: 'artist-covers',
  EVENT_COVER: 'event-covers',
};

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/**
 * S3-compatible object storage.
 *
 * Keys are always `<folder>/<ownerUserId>/<uuid>.<ext>`, so ownership can be checked from the
 * key alone and users can never attach someone else's upload. Clients upload directly with a
 * short-lived presigned PUT whose content type and length are part of the signature.
 *
 * Only the public bucket exists so far (avatars, covers, event posters). Private originals for
 * fan-captured media arrive with uploads in Milestone 3.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  /** Talks to storage from the server. */
  private readonly s3: S3Client;
  /** Signs URLs against the host the phone can reach (signing is offline; no network). */
  private readonly signer: S3Client;
  private readonly bucket: string;
  readonly privateBucket: string;
  private readonly publicBase: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    const common = {
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
    };
    const publicEndpoint = config.get('S3_PUBLIC_ENDPOINT', { infer: true });
    this.s3 = new S3Client({
      ...common,
      endpoint: config.get('S3_ENDPOINT', { infer: true }) ?? publicEndpoint,
    });
    this.signer = new S3Client({ ...common, endpoint: publicEndpoint });
    this.bucket = config.get('S3_BUCKET_PUBLIC', { infer: true });
    this.privateBucket = config.get('S3_BUCKET_PRIVATE', { infer: true });
    this.publicBase = `${publicEndpoint.replace(/\/+$/, '')}/${this.bucket}`;
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.get('S3_AUTO_CREATE_BUCKETS', { infer: true })) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.privateBucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.privateBucket }));
        this.logger.log(`Created private bucket "${this.privateBucket}"`);
      } catch (err) {
        this.logger.warn(
          `Could not create bucket "${this.privateBucket}": ${(err as Error).message}`,
        );
      }
    }
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        await this.s3.send(
          new PutBucketPolicyCommand({
            Bucket: this.bucket,
            Policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: { AWS: ['*'] },
                  Action: ['s3:GetObject'],
                  Resource: [`arn:aws:s3:::${this.bucket}/*`],
                },
              ],
            }),
          }),
        );
        this.logger.log(`Created public bucket "${this.bucket}"`);
      } catch (err) {
        this.logger.warn(`Could not create bucket "${this.bucket}": ${(err as Error).message}`);
      }
    }
  }

  publicUrl(key: string | null | undefined): string | null {
    return key ? `${this.publicBase}/${key}` : null;
  }

  async presignUpload(
    userId: string,
    purpose: UploadPurpose,
    contentType: string,
    sizeBytes: number,
  ): Promise<PresignedUpload> {
    const key = `${FOLDER[purpose]}/${userId}/${randomUUID()}.${EXT[contentType] ?? 'bin'}`;
    const uploadUrl = await getSignedUrl(
      this.signer,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
      {
        expiresIn: PRESIGN_TTL_SECONDS,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return {
      key,
      uploadUrl,
      headers: { 'Content-Type': contentType },
      publicUrl: this.publicUrl(key)!,
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Verifies a client-supplied key before it is saved on a record: correct folder, owned by the
   * caller, and the upload actually completed. Throws a 400 otherwise.
   */
  async assertOwnedUpload(key: string, userId: string, purpose: UploadPurpose): Promise<void> {
    const prefix = `${FOLDER[purpose]}/${userId}/`;
    if (!key.startsWith(prefix) || key.includes('..'))
      throw this.badFile('That image doesn’t belong to you');
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      throw this.badFile('That image hasn’t finished uploading. Please try again.');
    }
  }

  // ─────────────── Private bucket (fan media) ───────────────

  /** Presigned PUT for an original capture. Key: originals/<userId>/<uuid>.<ext>. */
  async presignOriginalUpload(userId: string, contentType: string, sizeBytes: number, ext: string) {
    const key = `originals/${userId}/${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
      this.signer,
      new PutObjectCommand({
        Bucket: this.privateBucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
      {
        expiresIn: PRESIGN_TTL_SECONDS * 6,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return {
      key,
      uploadUrl,
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 6 * 1000).toISOString(),
    };
  }

  /**
   * Short-lived signed GET for a private object. The signing time is rounded down to the hour so
   * the URL stays identical for an hour (lets the app's image cache work), and is valid ≥ 1 hour.
   */
  async privateUrl(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    const hour = 3_600_000;
    const signingDate = new Date(Math.floor(Date.now() / hour) * hour);
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.privateBucket, Key: key }),
      {
        expiresIn: 7200,
        signingDate,
      },
    );
  }

  async headPrivate(
    key: string,
  ): Promise<{ size: number; contentType: string | undefined } | null> {
    try {
      const h = await this.s3.send(new HeadObjectCommand({ Bucket: this.privateBucket, Key: key }));
      return { size: h.ContentLength ?? 0, contentType: h.ContentType };
    } catch {
      return null;
    }
  }

  async downloadPrivate(key: string, toPath: string): Promise<void> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.privateBucket, Key: key }));
    await pipeline(res.Body as Readable, createWriteStream(toPath));
  }

  async uploadPrivate(key: string, fromPath: string, contentType: string): Promise<void> {
    const { size } = await stat(fromPath);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.privateBucket,
        Key: key,
        Body: createReadStream(fromPath),
        ContentType: contentType,
        ContentLength: size,
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
  }

  async deletePrivate(key: string): Promise<void> {
    await this.s3
      .send(new DeleteObjectCommand({ Bucket: this.privateBucket, Key: key }))
      .catch(() => undefined);
  }

  async ping(): Promise<boolean> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  private badFile(message: string) {
    return new BadRequestException({ code: ERROR_CODES.VALIDATION_FAILED, message });
  }
}
