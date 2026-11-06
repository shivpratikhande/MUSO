import {
  MIN_PRICE_MINOR,
  TIP_PRESETS_MINOR,
  feeFor,
  formatMoney,
  type PaymentDto,
} from '@muso/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  ErrorState,
  FormError,
  LoadingState,
  Pill,
  Screen,
  TextField,
} from '@/components/ui';
import { newIdempotencyKey, runCheckout } from '@/features/money/checkout';
import { patchPostEverywhere } from '@/features/posts/cache';
import { postKeys } from '@/features/posts/keys';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const toMinor = (v: string) => Math.round(Number(v.replace(/[^\d.]/g, '')) * 100) || 0;

/** Unlock or tip. Amounts shown are exactly what the server will charge. */
export default function CheckoutScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { postId, kind } = useLocalSearchParams<{ postId: string; kind: 'UNLOCK' | 'TIP' }>();
  const post = useQuery({
    queryKey: postKeys.detail(postId),
    queryFn: () => api.posts.get(postId),
  });
  const cfg = useQuery({
    queryKey: ['payments', 'config'],
    queryFn: () => api.payments.config(),
    staleTime: Infinity,
  });
  const [tip, setTip] = useState<number>(TIP_PRESETS_MINOR[1]);
  const [customTip, setCustomTip] = useState('');
  const [pwyw, setPwyw] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PaymentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stable for this screen: retrying never creates a second payment.
  const [idempotencyKey] = useState(newIdempotencyKey);

  if (post.isPending || cfg.isPending)
    return (
      <Screen edges={['bottom']}>
        <LoadingState />
      </Screen>
    );
  if (cfg.isError)
    return (
      <Screen edges={['bottom']}>
        <ErrorState message={errorMessage(cfg.error)} onRetry={() => void cfg.refetch()} />
      </Screen>
    );
  if (post.isError)
    return (
      <Screen edges={['bottom']}>
        <ErrorState message={errorMessage(post.error)} onRetry={() => void post.refetch()} />
      </Screen>
    );
  const p = post.data;
  const m = p.monetization;

  const isTip = kind === 'TIP';
  const pwywMin = Math.max(m.minimumMinor ?? MIN_PRICE_MINOR, MIN_PRICE_MINOR);
  const amount = isTip
    ? customTip
      ? toMinor(customTip)
      : tip
    : m.mode === 'PAY_TO_UNLOCK'
      ? (m.priceMinor ?? 0)
      : pwyw
        ? toMinor(pwyw)
        : (m.suggestedMinor ?? 0);
  const feeBps = isTip ? cfg.data.feeBpsTips : cfg.data.feeBpsSales;
  const fee = feeFor(amount, feeBps);
  const tooLow = isTip ? amount < 1000 : m.mode === 'PAY_WHAT_YOU_WANT' && amount < pwywMin;
  const creator = p.author.displayName ?? p.author.username ?? 'the creator';

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const payment = await runCheckout(
        isTip
          ? { kind: 'TIP', postId, amountMinor: amount, message: message.trim() || undefined }
          : {
              kind: 'UNLOCK',
              postId,
              ...(m.mode === 'PAY_WHAT_YOU_WANT' ? { amountMinor: amount } : {}),
            },
        idempotencyKey,
      );
      setResult(payment);
      if (payment.status === 'SUCCEEDED') {
        const fresh = await api.posts.get(postId);
        patchPostEverywhere(qc, fresh);
        void qc.invalidateQueries({ queryKey: ['payments'] });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (result && result.status !== 'PENDING') {
    const ok = result.status === 'SUCCEEDED';
    return (
      <Screen edges={['bottom']}>
        <AppText variant="display">
          {ok
            ? isTip
              ? 'Tip sent. 🙌'
              : 'Unlocked.'
            : result.status === 'CANCELLED'
              ? 'Cancelled.'
              : 'Payment didn’t go through.'}
        </AppText>
        <AppText tone="muted">
          {ok
            ? isTip
              ? `${formatMoney(result.amountMinor)} to ${creator}. They receive ${formatMoney(result.creatorReceivesMinor)} after fees.`
              : 'It’s yours to keep — even if the price changes later. Find it any time in Profile → Library.'
            : (result.failureReason ?? 'No money was taken.')}
        </AppText>
        {ok ? (
          <Button label={isTip ? 'Done' : 'View it'} onPress={() => router.back()} />
        ) : (
          <>
            <Button
              label="Try again"
              onPress={() => {
                setResult(null);
                void pay();
              }}
            />
            <Button label="Close" variant="ghost" onPress={() => router.back()} />
          </>
        )}
      </Screen>
    );
  }

  return (
    <Screen keyboard edges={['bottom']}>
      <View style={{ flexDirection: 'row', gap: t.space.md, alignItems: 'center' }}>
        {p.media.thumbUrl ? (
          <Image
            source={{ uri: p.media.thumbUrl }}
            style={{ width: 72, height: 72, borderRadius: t.radius.md }}
            contentFit="cover"
          />
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">
            {isTip ? `Tip ${creator}` : `Unlock this ${p.type === 'VIDEO' ? 'video' : 'photo'}`}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={2}>
            {p.caption || `By ${creator}`}
          </AppText>
        </View>
      </View>

      {cfg.data.testMode ? (
        <Card>
          <Pill label="Test payment · no real money" tone="accent" />
          <AppText variant="caption" tone="muted">
            Payments run in sandbox mode during development. You’ll approve or decline on a test
            checkout page.
          </AppText>
        </Card>
      ) : null}

      {isTip ? (
        <View style={{ gap: t.space.sm }}>
          <AppText variant="label" tone="muted">
            Amount
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
            {TIP_PRESETS_MINOR.map((v) => (
              <Chip
                key={v}
                label={formatMoney(v)}
                selected={!customTip && tip === v}
                onPress={() => {
                  setCustomTip('');
                  setTip(v);
                }}
              />
            ))}
          </View>
          <TextField
            label="Custom (₹)"
            keyboardType="decimal-pad"
            placeholder="10 – 10,000"
            value={customTip}
            onChangeText={setCustomTip}
          />
          <TextField
            label="Message (optional)"
            maxLength={140}
            value={message}
            onChangeText={setMessage}
            placeholder="Say thanks"
          />
        </View>
      ) : m.mode === 'PAY_WHAT_YOU_WANT' ? (
        <View style={{ gap: t.space.sm }}>
          <TextField
            label={`Your amount (₹) · suggested ${formatMoney(m.suggestedMinor ?? 0)}`}
            keyboardType="decimal-pad"
            placeholder={String((m.suggestedMinor ?? 0) / 100)}
            value={pwyw}
            onChangeText={setPwyw}
            hint={`Minimum ${formatMoney(pwywMin)}`}
            error={tooLow ? `At least ${formatMoney(pwywMin)}` : undefined}
          />
        </View>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="bodyStrong">You pay</AppText>
          <AppText variant="bodyStrong">{formatMoney(amount)}</AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" tone="muted">
            {creator} receives
          </AppText>
          <AppText variant="caption" tone="muted">
            {formatMoney(Math.max(0, amount - fee))}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" tone="muted">
            MUSO fee ({feeBps / 100}%)
          </AppText>
          <AppText variant="caption" tone="muted">
            {formatMoney(fee)}
          </AppText>
        </View>
      </Card>

      {!isTip ? (
        <AppText variant="caption" tone="muted">
          Personal-use licence: you can view{p.type === 'PHOTO' ? ' and download' : ''} this for
          yourself. It doesn’t transfer copyright, and it doesn’t give rights to the artist’s
          performance or music.
        </AppText>
      ) : null}

      <FormError message={error} />
      <Button
        label={busy ? 'Waiting for payment…' : `Pay ${formatMoney(amount)}`}
        loading={busy}
        disabled={tooLow || amount <= 0}
        onPress={() => void pay()}
      />
    </Screen>
  );
}
