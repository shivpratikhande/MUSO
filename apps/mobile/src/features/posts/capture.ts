import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from '@muso/shared';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import type { Draft } from './draft-store';

export type CaptureSource = 'camera-photo' | 'camera-video' | 'library';

/** Opens the camera or library and returns a validated draft (null if cancelled). */
export async function pickCapture(
  source: CaptureSource,
  eventId: string | null = null,
): Promise<Draft | null> {
  const isCamera = source !== 'library';
  const perm = isCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted)
    throw new Error(
      isCamera
        ? 'Allow camera access in Settings to capture.'
        : 'Allow photo access in Settings to choose.',
    );

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes:
      source === 'camera-photo'
        ? ['images']
        : source === 'camera-video'
          ? ['videos']
          : ['images', 'videos'],
    // iOS shows its native trim UI for videos when editing is allowed.
    allowsEditing: source !== 'camera-photo',
    videoMaxDuration: MAX_VIDEO_SECONDS,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    quality: 0.85, // re-encodes photos to JPEG (also converts HEIC)
    exif: false,
  };
  const res = isCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];

  const isVideo = a.type === 'video';
  const ext = a.uri.split('.').pop()?.toLowerCase();
  const mimeType = isVideo
    ? a.mimeType === 'video/mp4' || ext === 'mp4'
      ? 'video/mp4'
      : 'video/quicktime'
    : a.mimeType === 'image/png'
      ? 'image/png'
      : a.mimeType === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';
  const size = a.fileSize ?? (await (await fetch(a.uri)).blob()).size;

  if (isVideo && (a.duration ?? 0) > MAX_VIDEO_SECONDS * 1000 + 500)
    throw new Error('Videos can be at most 3 minutes. Trim it and try again.');
  if (size > (isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES))
    throw new Error(
      isVideo ? 'Videos must be 300 MB or smaller.' : 'Photos must be 25 MB or smaller.',
    );

  return {
    uri: a.uri,
    type: isVideo ? 'VIDEO' : 'PHOTO',
    mimeType,
    sizeBytes: size,
    width: a.width,
    height: a.height,
    durationMs: isVideo ? Math.round(a.duration ?? 0) : null,
    clientRequestId: Crypto.randomUUID(),
    eventId,
  };
}
