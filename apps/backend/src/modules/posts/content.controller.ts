import {
  Body,
  Controller,
  Delete,
  Patch,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CreateCommentSchema,
  CreatePostSchema,
  CursorQuerySchema,
  FeedQuerySchema,
  PostListQuerySchema,
  PresignPostMediaSchema,
  PricingSchema,
  type CommentDto,
  type CreateCommentInput,
  type CursorQuery,
  type FeedQuery,
  type Paginated,
  type PostDto,
  type PostListQuery,
  type PresignPostMediaInput,
  type PresignedPostMedia,
  type PublicProfile,
} from '@muso/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CommentsService } from '../comments/comments.service.js';
import { FeedService } from '../feed/feed.service.js';
import { SocialService } from '../social/social.service.js';
import { PostsService } from './posts.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const CommentListSchema = CursorQuerySchema.extend({ parentId: z.uuid().optional() });

@ApiTags('posts')
@ApiBearerAuth()
@Controller()
export class ContentController {
  constructor(
    private readonly posts: PostsService,
    private readonly feed: FeedService,
    private readonly comments: CommentsService,
    private readonly social: SocialService,
  ) {}

  // ─────────── Feed ───────────

  @Get('feed')
  getFeed(
    @CurrentUser() u: RequestUser,
    @Query(new ZodValidationPipe(FeedQuerySchema)) q: FeedQuery,
  ): Promise<Paginated<PostDto>> {
    return this.feed.feed(q, u);
  }

  // ─────────── Posts ───────────

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('posts/uploads/presign')
  presign(
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(PresignPostMediaSchema)) body: PresignPostMediaInput,
  ): Promise<PresignedPostMedia> {
    return this.posts.presign(u, body);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('posts')
  create(
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(CreatePostSchema)) body: z.output<typeof CreatePostSchema>,
  ): Promise<PostDto> {
    return this.posts.create(u, body);
  }

  @Get('posts/mine')
  mine(@CurrentUser() u: RequestUser): Promise<PostDto[]> {
    return this.posts.listOwn(u);
  }

  @Get('posts/saved')
  saved(
    @CurrentUser() u: RequestUser,
    @Query(new ZodValidationPipe(CursorQuerySchema)) q: CursorQuery,
  ): Promise<Paginated<PostDto>> {
    return this.posts.listSaved(u, q.cursor, q.limit);
  }

  @Get('posts/:id')
  get(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PostDto> {
    return this.posts.get(id, u);
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<void> {
    await this.posts.delete(id, u);
  }

  @Patch('posts/:id/pricing')
  pricing(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(PricingSchema)) body: z.output<typeof PricingSchema>,
  ): Promise<PostDto> {
    return this.posts.updatePricing(id, body, u);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('posts/:id/download')
  download(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<{ url: string }> {
    return this.posts.downloadUrl(id, u);
  }

  @Put('posts/:id/like')
  like(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PostDto> {
    return this.posts.like(id, u, true);
  }

  @Delete('posts/:id/like')
  unlike(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PostDto> {
    return this.posts.like(id, u, false);
  }

  @Put('posts/:id/save')
  save(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PostDto> {
    return this.posts.save(id, u, true);
  }

  @Delete('posts/:id/save')
  unsave(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PostDto> {
    return this.posts.save(id, u, false);
  }

  // ─────────── Comments ───────────

  @Get('posts/:id/comments')
  listComments(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Query(new ZodValidationPipe(CommentListSchema)) q: z.infer<typeof CommentListSchema>,
  ): Promise<Paginated<CommentDto>> {
    return this.comments.list(id, u, q.parentId, q.cursor, q.limit);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('posts/:id/comments')
  comment(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(CreateCommentSchema)) body: CreateCommentInput,
  ): Promise<CommentDto> {
    return this.comments.create(id, body, u);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteComment(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<void> {
    await this.comments.delete(id, u);
  }

  // ─────────── Post lists by context ───────────

  @Get('events/:id/posts')
  eventPosts(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Query(new ZodValidationPipe(PostListQuerySchema)) q: PostListQuery,
  ): Promise<Paginated<PostDto>> {
    return this.posts.list(
      { eventId: id, ...(q.type ? { type: q.type } : {}) },
      u,
      q.cursor,
      q.limit,
    );
  }

  @Get('artists/:id/posts')
  artistPosts(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Query(new ZodValidationPipe(PostListQuerySchema)) q: PostListQuery,
  ): Promise<Paginated<PostDto>> {
    return this.posts.list(
      { artists: { some: { artistId: id } }, ...(q.type ? { type: q.type } : {}) },
      u,
      q.cursor,
      q.limit,
    );
  }

  @Get('hashtags/:tag/posts')
  hashtagPosts(
    @Param('tag') tag: string,
    @CurrentUser() u: RequestUser,
    @Query(new ZodValidationPipe(CursorQuerySchema)) q: CursorQuery,
  ): Promise<Paginated<PostDto>> {
    return this.posts.list(
      { hashtags: { has: tag.toLowerCase().replace(/^#/, '').slice(0, 30) } },
      u,
      q.cursor,
      q.limit,
    );
  }

  // ─────────── People ───────────

  @Get('users/:handle')
  profile(@Param('handle') handle: string, @CurrentUser() u: RequestUser): Promise<PublicProfile> {
    return this.social.profile(handle, u);
  }

  @Get('users/:id/posts')
  async userPosts(
    @Param('id', uuid) id: string,
    @CurrentUser() u: RequestUser,
    @Query(new ZodValidationPipe(PostListQuerySchema)) q: PostListQuery,
  ): Promise<Paginated<PostDto>> {
    await this.social.profile(id, u); // 404 if they blocked the viewer
    return this.posts.list(
      { authorId: id, ...(q.type ? { type: q.type } : {}) },
      u,
      q.cursor,
      q.limit,
    );
  }

  @Put('users/:id/follow')
  follow(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PublicProfile> {
    return this.social.follow(id, u);
  }

  @Delete('users/:id/follow')
  unfollow(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PublicProfile> {
    return this.social.unfollow(id, u);
  }

  @Put('users/:id/block')
  block(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PublicProfile> {
    return this.social.block(id, u);
  }

  @Delete('users/:id/block')
  unblock(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<PublicProfile> {
    return this.social.unblock(id, u);
  }
}
