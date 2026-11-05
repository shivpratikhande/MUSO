import type { FeedTab } from '@muso/shared';

/** Every post-bearing query lives under ['posts', …] so one cache patch updates them all. */
export const postKeys = {
  all: ['posts'] as const,
  feed: (tab: FeedTab) => ['posts', 'feed', tab] as const,
  detail: (id: string) => ['posts', 'detail', id] as const,
  event: (id: string) => ['posts', 'event', id] as const,
  artist: (id: string) => ['posts', 'artist', id] as const,
  user: (id: string) => ['posts', 'user', id] as const,
  hashtag: (tag: string) => ['posts', 'hashtag', tag] as const,
  mine: ['posts', 'mine'] as const,
  saved: ['posts', 'saved'] as const,
  comments: (postId: string, parentId?: string) => ['comments', postId, parentId ?? 'top'] as const,
};
