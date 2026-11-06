import { MIN_POOL_BUDGET_MINOR, formatMoney } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Chip, FormError, Screen, TextField } from '@/components/ui';
import { useMe } from '@/features/profile/use-me';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const CAPS = [1_000, 2_500, 5_000, 10_000];
const MIN_VIEWERS = [1, 3, 5, 10];

export default function NewPoolScreen() {
  const t = useTheme();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const me = useMe();
  const [title, setTitle] = useState('Best live videos');
  const [sponsor, setSponsor] = useState('');
  const [budget, setBudget] = useState('1000');
  const [cap, setCap] = useState(2_500);
  const [minViewers, setMinViewers] = useState(3);
  const [rules, setRules] = useState('');
  const budgetMinor = Math.round(Number(budget.replace(/[^\d.]/g, '')) * 100) || 0;
  const sponsorName =
    sponsor.trim() || me.data?.organizerProfile?.organizationName || me.data?.displayName || '';

  const create = useMutation({
    mutationFn: () =>
      api.rewards.create({
        eventId,
        title: title.trim(),
        sponsorName,
        budgetMinor,
        perVideoCapBps: cap,
        minQualifiedViewers: minViewers,
        rules: rules.trim(),
      }),
    onSuccess: (p) => router.replace({ pathname: '/pools/[id]', params: { id: p.id } }),
  });

  return (
    <Screen keyboard edges={['bottom']}>
      <AppText tone="muted">
        Fund real rewards for creators who capture this event. You’ll pay the budget into escrow
        next; it’s shared by qualified watch time after the window ends (7 days after the event).
      </AppText>
      <TextField label="Title" value={title} onChangeText={setTitle} />
      <TextField
        label="Funded by (shown publicly)"
        placeholder={sponsorName || 'Your organization or sponsor'}
        value={sponsor}
        onChangeText={setSponsor}
      />
      <TextField
        label="Budget (₹)"
        keyboardType="decimal-pad"
        value={budget}
        onChangeText={setBudget}
        error={
          budgetMinor && budgetMinor < MIN_POOL_BUDGET_MINOR
            ? `Minimum ${formatMoney(MIN_POOL_BUDGET_MINOR)}`
            : undefined
        }
      />
      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Max per video
        </AppText>
        <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
          {CAPS.map((c) => (
            <Chip key={c} label={`${c / 100}%`} selected={cap === c} onPress={() => setCap(c)} />
          ))}
        </View>
      </View>
      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Minimum distinct viewers per video
        </AppText>
        <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
          {MIN_VIEWERS.map((n) => (
            <Chip
              key={n}
              label={String(n)}
              selected={minViewers === n}
              onPress={() => setMinViewers(n)}
            />
          ))}
        </View>
      </View>
      <TextField
        label="Extra rules (optional)"
        multiline
        style={{ minHeight: 80, textAlignVertical: 'top' }}
        value={rules}
        onChangeText={setRules}
      />
      <FormError message={create.isError ? errorMessage(create.error) : null} />
      <Button
        label="Create pool"
        loading={create.isPending}
        disabled={budgetMinor < MIN_POOL_BUDGET_MINOR || !sponsorName}
        onPress={() => create.mutate()}
      />
    </Screen>
  );
}
