import { Module } from '@nestjs/common';
import { CommentsService } from '../comments/comments.service.js';
import { FeedService } from '../feed/feed.service.js';
import { MediaDerivatives } from '../media/media-derivatives.service.js';
import { MediaProcessor } from '../media/media-processor.service.js';
import { MediaQueue } from '../media/media.queue.js';
import { MediaWorker } from '../media/media.worker.js';
import { SocialService } from '../social/social.service.js';
import { ContentController } from './content.controller.js';
import { PostMapper } from './post-mapper.service.js';
import { PostsService } from './posts.service.js';

/** Posts, media processing, feed, comments and follows/blocks. */
@Module({
  controllers: [ContentController],
  providers: [
    PostsService,
    PostMapper,
    MediaQueue,
    MediaProcessor,
    MediaWorker,
    MediaDerivatives,
    FeedService,
    CommentsService,
    SocialService,
  ],
  exports: [PostsService, PostMapper, MediaDerivatives],
})
export class ContentModule {}
