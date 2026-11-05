import { describe, expect, it } from 'vitest';
import {
  CreatePostSchema,
  PresignPostMediaSchema,
  parseHashtags,
  parseMentions,
} from '../index.js';

const id = '0190a6f0-0000-7000-8000-000000000001';

describe('post schemas', () => {
  it('requires the rights confirmation', () => {
    const base = { clientRequestId: id, mediaKey: 'originals/x/y.jpg', type: 'PHOTO' };
    expect(CreatePostSchema.safeParse(base).success).toBe(false);
    expect(CreatePostSchema.safeParse({ ...base, rightsConfirmed: false }).success).toBe(false);
    expect(CreatePostSchema.parse({ ...base, rightsConfirmed: true })).toMatchObject({
      monetizationMode: 'FREE',
      artistIds: [],
    });
  });

  it('rejects paid modes until Milestone 4', () => {
    const r = CreatePostSchema.safeParse({
      clientRequestId: id,
      mediaKey: 'k',
      type: 'PHOTO',
      rightsConfirmed: true,
      monetizationMode: 'PAY_TO_UNLOCK',
    });
    expect(r.success).toBe(false);
  });

  it('enforces per-type upload limits', () => {
    expect(
      PresignPostMediaSchema.safeParse({ type: 'PHOTO', contentType: 'video/mp4', sizeBytes: 10 })
        .success,
    ).toBe(false);
    expect(
      PresignPostMediaSchema.safeParse({
        type: 'PHOTO',
        contentType: 'image/jpeg',
        sizeBytes: 30 * 1024 * 1024,
      }).success,
    ).toBe(false);
    expect(
      PresignPostMediaSchema.safeParse({
        type: 'VIDEO',
        contentType: 'video/quicktime',
        sizeBytes: 200 * 1024 * 1024,
      }).success,
    ).toBe(true);
  });
});

describe('text parsing', () => {
  it('extracts unique lowercase hashtags', () => {
    expect(parseHashtags('Best night #LiveMusic #livemusic at #Mumbai2026! not#this')).toEqual([
      'livemusic',
      'mumbai2026',
    ]);
  });

  it('extracts mentions but not emails', () => {
    expect(parseMentions('Shot by @Shiv.v with @nila.waves — mail me a@b.com')).toEqual([
      'shiv.v',
      'nila.waves',
    ]);
  });
});
