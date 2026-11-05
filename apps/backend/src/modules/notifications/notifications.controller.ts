import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CursorQuerySchema,
  type CursorQuery,
  type NotificationDto,
  type Paginated,
} from '@muso/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

const MarkReadSchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(CursorQuerySchema)) q: CursorQuery,
  ): Promise<Paginated<NotificationDto>> {
    return this.notifications.list(user.id, q.cursor, q.limit);
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: RequestUser): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  /** Marks the given notifications (or all) as read. */
  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(MarkReadSchema)) body: z.infer<typeof MarkReadSchema>,
  ): Promise<void> {
    await this.notifications.markRead(user.id, body.ids);
  }
}
