import { currencyUnit, feeFor, formatMoney, moneyRules, type PaymentDto } from '@muso/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ExpoLinking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
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
import { openWalletPage } from '@/features/arc/walletPage';
import { newIdempotencyKey, runCheckout } from '@/features/money/checkout';
import { patchPostEverywhere } from '@/features/posts/cache';
import { postKeys } from '@/features/posts/keys';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const toMinor = (v: string) => Math.round(Number(v.replace(/[^\d.]/g, '')) * 100) || 0;

/**
 * Unlock or tip. Amounts shown are exactly what the server will charge. USDC posts are paid
 * wallet to wallet on Arc through MUSO's wallet page; the server confirms the transfer on-chain.
 */
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
  const [tip, setTip] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [pwyw, setPwyw] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PaymentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stable for this screen: retrying never creates a second payment.
  const [idempotencyKey] = useState(newIdempotencyKey);
  /** USDC payment waiting for the fan's wallet (MetaMask etc.). */
  const [awaiting, setAwaiting] = useState<PaymentDto | null>(null);
  const checking = useRef(false);

  const finish = async (payment: PaymentDto) => {
    setAwaiting(null);
    setResult(payment);
    if (payment.status === 'SUCCEEDED') {
      const fresh = await api.posts.get(postId);
      patchPostEverywhere(qc, fresh);
      void qc.invalidateQueries({ queryKey: ['payments'] });
    }
  };

  const check = async (id: string) => {
    if (checking.current) return;
    checking.current = true;
    try {
      const p = await api.arc.payCheck(id);
      if (p.status !== 'PENDING') await finish(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      checking.current = false;
    }
  };

  // While the wallet is open: check Arc when the fan comes back, and every few seconds.
  useEffect(() => {
    if (!awaiting) return;
    const id = awaiting.id;
    const timer = setInterval(() => void check(id), 5_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check(id);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting?.id]);

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
  const cur = m.currency;
  const rules = moneyRules(cur);
  const unit = currencyUnit(cur);
  const usdc = cur === 'USD' && cfg.data.usdcOnArc;
  const money = (v: number) => formatMoney(v, cur);
  const pwywMin = Math.max(m.minimumMinor ?? rules.minPrice, rules.minPrice);
  const amount = isTip
    ? customTip
      ? toMinor(customTip)
      : (tip ?? rules.tipPresets[1] ?? rules.minTip)
    : m.mode === 'PAY_TO_UNLOCK'
      ? (m.priceMinor ?? 0)
      : pwyw
        ? toMinor(pwyw)
        : (m.suggestedMinor ?? 0);
  const feeBps = usdc ? cfg.data.feeBpsUsdc : isTip ? cfg.data.feeBpsTips : cfg.data.feeBpsSales;
  const fee = feeFor(amount, feeBps);
  const tooLow = isTip
    ? amount < rules.minTip || amount > rules.maxTip
    : m.mode === 'PAY_WHAT_YOU_WANT' && amount < pwywMin;
  const creator = p.author.displayName ?? p.author.username ?? 'the creator';

  const openWallet = (payment: PaymentDto) =>
    openWalletPage((returnUrl) => api.arc.payLink(payment.id, returnUrl));

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const req = isTip
        ? ({
            kind: 'TIP',
            postId,
            amountMinor: amount,
            message: message.trim() || undefined,
          } as const)
        : ({
            kind: 'UNLOCK',
            postId,
            ...(m.mode === 'PAY_WHAT_YOU_WANT' ? { amountMinor: amount } : {}),
          } as const);
      if (usdc) {
        const payment = await api.payments.checkout({
          ...req,
          idempotencyKey,
          returnUrl: ExpoLinking.createURL('payments/return'),
        });
        if (payment.status !== 'PENDING') return void (await finish(payment));
        setAwaiting(payment);
        if (!(await openWallet(payment))) setAwaiting(null);
        return;
      }
      await finish(await runCheckout(req, idempotencyKey));
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
              ? result.txUrl
                ? `${formatMoney(result.amountMinor, result.currency)} went straight to ${creator}’s wallet on Arc.`
                : `${formatMoney(result.amountMinor, result.currency)} to ${creator}. They receive ${formatMoney(result.creatorReceivesMinor, result.currency)} after fees.`
              : 'It’s yours to keep — even if the price changes later. Find it any time in Profile → Library.'
            : (result.failureReason ?? 'No money was taken.')}
        </AppText>
        {ok && result.txUrl ? (
          <Button
            label="View payment on Arc ↗"
            variant="ghost"
            onPress={() => void Linking.openURL(result.txUrl!)}
          />
        ) : null}
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

  if (awaiting) {
    return (
      <Screen edges={['bottom']}>
        <AppText variant="display">Finish in your wallet.</AppText>
        <AppText tone="muted">
          Approve the {formatMoney(awaiting.amountMinor, awaiting.currency)} payment in your wallet
          app, then come back here. MUSO checks Arc automatically and{' '}
          {isTip ? 'tells you when the tip lands' : 'unlocks it as soon as the payment is there'}.
        </AppText>
        <Card>
          <Pill label="Arc Testnet · test USDC" tone="accent" />
          <AppText variant="caption" tone="muted">
            The USDC goes straight from your wallet to {creator}. MUSO never holds it.
          </AppText>
        </Card>
        <FormError message={error} />
        <Button label="I’ve paid: check now" onPress={() => void check(awaiting.id)} />
        <Button
          label="Open my wallet again"
          variant="ghost"
          onPress={() => void openWallet(awaiting)}
        />
        <Button label="Cancel" variant="ghost" onPress={() => setAwaiting(null)} />
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

      {usdc ? (
        <Card>
          <Pill label="USDC on Arc · testnet" tone="accent" />
          <AppText variant="caption" tone="muted">
            You pay from your own wallet (MetaMask or Coinbase Wallet). The USDC goes straight to{' '}
            {creator}, and MUSO checks the payment on-chain.
          </AppText>
        </Card>
      ) : cfg.data.testMode ? (
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
            {rules.tipPresets.map((v) => (
              <Chip
                key={v}
                label={money(v)}
                selected={!customTip && amount === v}
                onPress={() => {
                  setCustomTip('');
                  setTip(v);
                }}
              />
            ))}
          </View>
          <TextField
            label={`Custom (${unit})`}
            keyboardType="decimal-pad"
            placeholder={`${rules.minTip / 100} – ${(rules.maxTip / 100).toLocaleString()}`}
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
            label={`Your amount (${unit}) · suggested ${money(m.suggestedMinor ?? 0)}`}
            keyboardType="decimal-pad"
            placeholder={String((m.suggestedMinor ?? 0) / 100)}
            value={pwyw}
            onChangeText={setPwyw}
            hint={`Minimum ${money(pwywMin)}`}
            error={tooLow ? `At least ${money(pwywMin)}` : undefined}
          />
        </View>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="bodyStrong">You pay</AppText>
          <AppText variant="bodyStrong">{money(amount)}</AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" tone="muted">
            {creator} receives
          </AppText>
          <AppText variant="caption" tone="muted">
            {money(Math.max(0, amount - fee))}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" tone="muted">
            MUSO fee ({feeBps / 100}%)
          </AppText>
          <AppText variant="caption" tone="muted">
            {money(fee)}
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
        label={
          busy ? 'Waiting for payment…' : `Pay ${money(amount)}${usdc ? ' from my wallet' : ''}`
        }
        loading={busy}
        disabled={tooLow || amount <= 0}
        onPress={() => void pay()}
      />
    </Screen>
  );
}
