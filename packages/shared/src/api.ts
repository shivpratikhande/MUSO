import { z } from 'zod';

/**
 * Consistent REST response envelope.
 *   success: { data: T }
 *   failure: { error: { code, message, details? } }
 */
export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiFailure {
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Cursor pagination used by every feed and discovery endpoint. */
export const CursorQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CursorQuery = z.infer<typeof CursorQuerySchema>;

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export function isApiFailure<T>(res: ApiResponse<T>): res is ApiFailure {
  return typeof res === 'object' && res !== null && 'error' in res;
}
