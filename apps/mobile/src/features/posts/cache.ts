import type { Paginated, PostDto } from '@muso/shared';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { postKeys } from './keys';

type Cached = PostDto | PostDto[] | Paginated<PostDto> | InfiniteData<Paginated<PostDto>>;

function patch(data: Cached | undefined, post: PostDto): Cached | undefined {
  if (!data) return data;
  if (Array.isArray(data)) return data.map((p) => (p.id === post.id ? post : p));
  if ('pages' in data)
    return {
      ...data,
      pages: data.pages.map((pg) => ({
        ...pg,
        items: pg.items.map((p) => (p.id === post.id ? post : p)),
      })),
    };
  if ('items' in data)
    return { ...data, items: data.items.map((p) => (p.id === post.id ? post : p)) };
  return data.id === post.id ? post : data;
}

function remove(data: Cached | undefined, id: string): Cached | undefined {
  if (!data) return data;
  if (Array.isArray(data)) return data.filter((p) => p.id !== id);
  if ('pages' in data)
    return {
      ...data,
      pages: data.pages.map((pg) => ({ ...pg, items: pg.items.filter((p) => p.id !== id) })),
    };
  if ('items' in data) return { ...data, items: data.items.filter((p) => p.id !== id) };
  return data;
}

/** Replace a post everywhere it's cached (feeds, grids, detail). */
export const patchPostEverywhere = (qc: QueryClient, post: PostDto) =>
  qc.setQueriesData<Cached>({ queryKey: postKeys.all }, (d) => patch(d, post));

/** Drop a post from every cached list (after delete / block / report). */
export const removePostEverywhere = (qc: QueryClient, id: string) =>
  qc.setQueriesData<Cached>({ queryKey: postKeys.all }, (d) => remove(d, id));
