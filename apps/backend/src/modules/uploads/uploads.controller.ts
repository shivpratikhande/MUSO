import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PresignUploadSchema, type PresignUploadInput, type PresignedUpload } from '@muso/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  /** Returns a short-lived URL the app PUTs the image to directly. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('presign')
  presign(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(PresignUploadSchema)) body: PresignUploadInput,
  ): Promise<PresignedUpload> {
    return this.storage.presignUpload(user.id, body.purpose, body.contentType, body.sizeBytes);
  }
}
