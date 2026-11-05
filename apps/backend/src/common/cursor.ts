import { badRequest } from './errors.js';

/** Opaque keyset-pagination cursor: (sort timestamp, id). */
export interface Cursor {
  t: string;
  id: string;
}

export const encodeCursor = (c: Cursor): string =>
  Buffer.from(JSON.stringify(c)).toString('base64url');

export function decodeCursor(raw: string | undefined): Cursor | undefined {
  if (!raw) return undefined;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (typeof c.t !== 'string' || typeof c.id !== 'string' || Number.isNaN(Date.parse(c.t)))
      throw new Error();
    return c;
  } catch {
    throw badRequest('Invalid cursor');
  }
}
