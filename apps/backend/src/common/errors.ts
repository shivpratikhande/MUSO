import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ERROR_CODES } from '@muso/shared';

/** Envelope-coded HTTP errors with user-facing messages. */
export const notFound = (what = 'That') =>
  new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: `${what} could not be found` });

export const forbidden = (message = 'You do not have permission to do this') =>
  new ForbiddenException({ code: ERROR_CODES.FORBIDDEN, message });

export const conflict = (message: string) =>
  new ConflictException({ code: ERROR_CODES.CONFLICT, message });

export const badRequest = (message: string, details?: unknown) =>
  new BadRequestException({ code: ERROR_CODES.VALIDATION_FAILED, message, details });

/** Prisma unique-constraint violation. */
export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
