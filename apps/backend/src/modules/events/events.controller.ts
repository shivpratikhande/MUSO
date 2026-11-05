import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateEventSchema,
  EventListQuerySchema,
  ReviewEventSchema,
  SetLineupSchema,
  SetScheduleSchema,
  UpdateEventSchema,
  type CreateEventInput,
  type EventDetail,
  type EventListQuery,
  type EventSummary,
  type Paginated,
  type ReviewEventInput,
  type SetLineupInput,
  type SetScheduleInput,
  type UpdateEventInput,
} from '@muso/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { EventsService } from './events.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(EventListQuerySchema)) q: EventListQuery,
  ): Promise<Paginated<EventSummary>> {
    return this.events.list(q);
  }

  @Roles('ORGANIZER')
  @Get('mine')
  mine(@CurrentUser() user: RequestUser): Promise<EventSummary[]> {
    return this.events.listMine(user.id);
  }

  @Get('following')
  following(@CurrentUser() user: RequestUser): Promise<EventSummary[]> {
    return this.events.listFollowing(user.id);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string, @CurrentUser() user: RequestUser): Promise<EventDetail> {
    return this.events.get(id, user);
  }

  @Roles('ORGANIZER')
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateEventSchema)) body: CreateEventInput,
  ): Promise<EventDetail> {
    return this.events.create(body, user);
  }

  @Patch(':id')
  update(
    @Param('id', uuid) id: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(UpdateEventSchema)) body: UpdateEventInput,
  ): Promise<EventDetail> {
    return this.events.update(id, body, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', uuid) id: string, @CurrentUser() user: RequestUser): Promise<EventDetail> {
    return this.events.cancel(id, user);
  }

  @Put(':id/lineup')
  lineup(
    @Param('id', uuid) id: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(SetLineupSchema)) body: SetLineupInput,
  ): Promise<EventDetail> {
    return this.events.setLineup(id, body, user);
  }

  @Put(':id/schedule')
  schedule(
    @Param('id', uuid) id: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(SetScheduleSchema)) body: SetScheduleInput,
  ): Promise<EventDetail> {
    return this.events.setSchedule(id, body, user);
  }

  @Put(':id/follow')
  follow(@Param('id', uuid) id: string, @CurrentUser() user: RequestUser): Promise<EventDetail> {
    return this.events.follow(id, user, true);
  }

  @Delete(':id/follow')
  unfollow(@Param('id', uuid) id: string, @CurrentUser() user: RequestUser): Promise<EventDetail> {
    return this.events.follow(id, user, false);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/events')
export class AdminEventsController {
  constructor(private readonly events: EventsService) {}

  @Get('pending')
  pending(): Promise<EventSummary[]> {
    return this.events.listPendingReview();
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  review(
    @Param('id', uuid) id: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(ReviewEventSchema)) body: ReviewEventInput,
  ): Promise<EventDetail> {
    return this.events.review(id, body, user);
  }
}
