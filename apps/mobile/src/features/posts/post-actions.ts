import type { PostDto } from '@muso/shared';
import { REPORT_REASONS } from '@muso/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActionSheetIOS, Alert, Platform, Share } from 'react-native';
import { api, errorMessage } from '@/services/api';
import { patchPostEverywhere, removePostEverywhere } from './cache';

const REASON_LABEL: Record<(typeof REPORT_REASONS)[number], string> = {
  SPAM: 'Spam',
  HARASSMENT: 'Harassment or bullying',
  NUDITY: 'Nudity or sexual content',
  VIOLENCE: 'Violence',
  COPYRIGHT: 'Copyright / my content',
  PRIVACY: 'Privacy: filmed without consent',
  OTHER: 'Something else',
};

function choose(
  title: string,
  options: string[],
  destructiveIndex?: number,
): Promise<number | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...options, 'Cancel'],
          cancelButtonIndex: options.length,
          destructiveButtonIndex: destructiveIndex,
        },
        (i) => resolve(i === options.length ? null : i),
      );
    } else {
      Alert.alert(title, undefined, [
        ...options.map((o, i) => ({
          text: o,
          onPress: () => resolve(i),
          style: i === destructiveIndex ? ('destructive' as const) : ('default' as const),
        })),
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });
}

/** Like / save with optimistic updates that roll back on failure. */
export function usePostToggles(post: PostDto) {
  const qc = useQueryClient();
  const optimistic = (next: PostDto) => patchPostEverywhere(qc, next);

  const like = useMutation({
    mutationFn: (on: boolean) => api.posts.like(post.id, on),
    onMutate: (on) =>
      optimistic({
        ...post,
        likeCount: post.likeCount + (on ? 1 : -1),
        viewer: { ...post.viewer, liked: on },
      }),
    onSuccess: (p) => patchPostEverywhere(qc, p),
    onError: (err) => {
      patchPostEverywhere(qc, post);
      Alert.alert('Couldn’t update like', errorMessage(err));
    },
  });
  const save = useMutation({
    mutationFn: (on: boolean) => api.posts.save(post.id, on),
    onMutate: (on) =>
      optimistic({
        ...post,
        saveCount: post.saveCount + (on ? 1 : -1),
        viewer: { ...post.viewer, saved: on },
      }),
    onSuccess: (p) => patchPostEverywhere(qc, p),
    onError: (err) => {
      patchPostEverywhere(qc, post);
      Alert.alert('Couldn’t update save', errorMessage(err));
    },
  });
  return {
    toggleLike: () => like.mutate(!post.viewer.liked),
    toggleSave: () => save.mutate(!post.viewer.saved),
  };
}

export async function sharePost(post: PostDto) {
  const who = post.author.displayName ?? post.author.username ?? 'someone';
  const where = post.event ? ` at ${post.event.title}` : '';
  await Share.share({
    message: `A moment captured by ${who}${where} on MUSO: muso://posts/${post.id}`,
  });
}

/** "…" menu: report, block author, or delete own post. */
export function usePostMenu(post: PostDto, onRemoved?: () => void) {
  const qc = useQueryClient();
  return async () => {
    const options: string[] = [];
    const actions: (() => Promise<void>)[] = [];
    if (post.viewer.canDelete) {
      options.push('Delete post');
      actions.push(async () => {
        await api.posts.remove(post.id);
        removePostEverywhere(qc, post.id);
        onRemoved?.();
      });
    }
    if (!post.viewer.isAuthor) {
      options.push('Report post');
      actions.push(async () => {
        const reasons = Object.keys(REASON_LABEL) as (keyof typeof REASON_LABEL)[];
        const i = await choose(
          'Why are you reporting this?',
          reasons.map((r) => REASON_LABEL[r]),
        );
        if (i === null) return;
        await api.reports.create({ targetType: 'POST', targetId: post.id, reason: reasons[i]! });
        Alert.alert('Thanks for letting us know', 'Our team will review this post.');
      });
      options.push(`Block ${post.author.displayName ?? 'user'}`);
      actions.push(async () => {
        await api.users.block(post.author.id, true);
        await qc.invalidateQueries({ queryKey: ['posts'] });
        onRemoved?.();
      });
    }
    const destructive = post.viewer.canDelete ? 0 : options.length - 1;
    const i = await choose('Post options', options, destructive);
    if (i === null) return;
    try {
      await actions[i]!();
    } catch (err) {
      Alert.alert('Something went wrong', errorMessage(err));
    }
  };
}

export const openAuthor = (post: PostDto) =>
  router.push({ pathname: '/users/[id]', params: { id: post.author.id } });
