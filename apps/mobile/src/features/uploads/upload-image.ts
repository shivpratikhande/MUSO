import type { UploadPurpose } from '@muso/shared';
import { MAX_IMAGE_BYTES } from '@muso/shared';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/services/api';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

/** Opens the photo library. Returns null if the user cancels or denies access. */
export async function pickImage(aspect: [number, number]): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Allow photo access in Settings to choose an image.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    // Re-encodes to JPEG (also converts HEIC) and keeps uploads small.
    quality: 0.8,
  });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

/**
 * Uploads a local image straight to object storage using a short-lived presigned URL.
 * Returns the storage key to save on the profile/event.
 */
export async function uploadImage(
  uri: string,
  purpose: UploadPurpose,
): Promise<{ key: string; publicUrl: string }> {
  const blob = await (await fetch(uri)).blob();
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('Images must be 10 MB or smaller.');
  const contentType = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const presigned = await api.uploads.presign({ purpose, contentType, sizeBytes: blob.size });
  const put = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: presigned.headers,
    body: blob,
  });
  if (!put.ok) throw new Error('Upload failed. Check your connection and try again.');
  return { key: presigned.key, publicUrl: presigned.publicUrl };
}
