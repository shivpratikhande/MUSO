import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, ErrorState, FormError, LoadingState, Screen } from '@/components/ui';
import { PricingPicker } from '@/features/money/PricingPicker';
import { patchPostEverywhere } from '@/features/posts/cache';
import { postKeys } from '@/features/posts/keys';
import { api, errorMessage } from '@/services/api';
import type { PostDto, PricingInput } from '@muso/shared';

function toInput(p: PostDto): PricingInput {
  const m = p.monetization;
  if (m.mode === 'PAY_TO_UNLOCK')
    return { mode: 'PAY_TO_UNLOCK', priceMinor: m.priceMinor ?? 4900, tipsEnabled: m.tipsEnabled };
  if (m.mode === 'PAY_WHAT_YOU_WANT')
    return {
      mode: 'PAY_WHAT_YOU_WANT',
      suggestedMinor: m.suggestedMinor ?? 4900,
      minimumMinor: m.minimumMinor,
      gated: m.gated,
      tipsEnabled: m.tipsEnabled,
    };
  return { mode: 'FREE', tipsEnabled: m.tipsEnabled };
}

function Editor({ post }: { post: PostDto }) {
  const qc = useQueryClient();
  const [pricing, setPricing] = useState<PricingInput>(() => toInput(post));
  const save = useMutation({
    mutationFn: () => api.payments.setPricing(post.id, pricing),
    onSuccess: (p) => {
      patchPostEverywhere(qc, p);
      router.back();
    },
  });
  return (
    <>
      <AppText tone="muted">
        Changes apply to new buyers. Everyone who already unlocked it keeps access.
      </AppText>
      <PricingPicker
        value={pricing}
        onChange={setPricing}
        disabled={save.isPending}
        currency={post.monetization.currency}
      />
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <Button label="Save price" loading={save.isPending} onPress={() => save.mutate()} />
    </>
  );
}

export default function PricingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = useQuery({ queryKey: postKeys.detail(id), queryFn: () => api.posts.get(id) });
  return (
    <Screen keyboard edges={['bottom']}>
      {post.isPending ? (
        <LoadingState />
      ) : post.isError ? (
        <ErrorState message={errorMessage(post.error)} onRetry={() => void post.refetch()} />
      ) : (
        <Editor post={post.data} />
      )}
    </Screen>
  );
}
