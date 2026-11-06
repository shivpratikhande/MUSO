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
      artistIds: [],
    });
  });

  it('defaults to free and validates paid pricing', () => {
    const base = { clientRequestId: id, mediaKey: 'k', type: 'PHOTO', rightsConfirmed: true };
    expect(CreatePostSchema.parse(base).pricing).toEqual({ mode: 'FREE', tipsEnabled: true });
    const parse = (pricing: unknown) => CreatePostSchema.safeParse({ ...base, pricing }).success;
    expect(parse({ mode: 'PAY_TO_UNLOCK', priceMinor: 500 })).toBe(false); // below ₹10
    expect(parse({ mode: 'PAY_TO_UNLOCK', priceMinor: 4900 })).toBe(true);
    expect(parse({ mode: 'PAY_WHAT_YOU_WANT', suggestedMinor: 2000, minimumMinor: 5000 })).toBe(
      false,
    );
    expect(parse({ mode: 'PAY_WHAT_YOU_WANT', suggestedMinor: 5000, minimumMinor: 2000 })).toBe(
      true,
    );
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
