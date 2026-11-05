import { z } from 'zod';

export const UPLOAD_PURPOSES = ['AVATAR', 'ARTIST_COVER', 'EVENT_COVER'] as const;
export const UploadPurposeSchema = z.enum(UPLOAD_PURPOSES);
export type UploadPurpose = z.infer<typeof UploadPurposeSchema>;

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const PresignUploadSchema = z.object({
  purpose: UploadPurposeSchema,
  contentType: z.enum(IMAGE_CONTENT_TYPES, 'Use a JPEG, PNG, WebP or HEIC image'),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES, 'Images must be 10 MB or smaller'),
});
export type PresignUploadInput = z.infer<typeof PresignUploadSchema>;

export interface PresignedUpload {
  /** Reference to send back when saving a profile/event. */
  key: string;
  /** HTTP PUT target. Send exactly `headers` with the request. */
  uploadUrl: string;
  headers: Record<string, string>;
  /** Where the file can be viewed once uploaded. */
  publicUrl: string;
  expiresAt: string;
}
