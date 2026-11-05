import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const dir = mkdtempSync(join(tmpdir(), 'muso-fixtures-'));

/** A 640×480 JPEG carrying camera + GPS EXIF, to prove the pipeline strips location data. */
export async function jpegWithGps(): Promise<Buffer> {
  return sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 217, g: 255, b: 85 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: 'MusoTestCam', Model: 'X1' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '19/1 4/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '72/1 52/1 0/1',
      },
    })
    .toBuffer();
}

/** Generated test video (colour bars + tone). */
export function video(seconds: number, name = `v${seconds}`): Buffer {
  const out = join(dir, `${name}.mp4`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc=size=320x240:rate=15:duration=${seconds}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${seconds}`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      out,
    ],
    { stdio: 'ignore' },
  );
  return readFileSync(out);
}
