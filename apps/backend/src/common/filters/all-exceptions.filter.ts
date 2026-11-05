import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ERROR_CODES, type ApiFailure, type ErrorCode } from '@muso/shared';
import type { Response } from 'express';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
};

/** Converts every thrown error into the `{ error: { code, message, details? } }` envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const body = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const payload: ApiFailure = {
        error: {
          code:
            (body['code'] as ErrorCode | undefined) ??
            STATUS_TO_CODE[status] ??
            ERROR_CODES.INTERNAL,
          message:
            typeof body['message'] === 'string'
              ? body['message']
              : typeof raw === 'string'
                ? raw
                : exception.message,
          ...(body['details'] !== undefined ? { details: body['details'] } : {}),
        },
      };
      res.status(status).json(payload);
      return;
    }

    // Unknown errors: log full detail server-side, never leak internals to clients.
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const payload: ApiFailure = {
      error: { code: ERROR_CODES.INTERNAL, message: 'Something went wrong' },
    };
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
  }
}
