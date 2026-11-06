import type { PredictionDto, PredictionStatusDto } from '@muso/shared';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Card, Pill } from '@/components/ui';
import { useTheme } from '@/theme';

/** USDC base units (string) → "12.5 USDC". */
export const usdc = (micro: string | number) => {
  const v = Number(micro) / 1e6;
  return `${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} USDC`;
};

export const STATUS: Record<
  PredictionStatusDto,
  { label: string; tone: 'accent' | 'neutral' | 'accent2' }
> = {
  PENDING: { label: 'Setting up', tone: 'neutral' },
  OPEN: { label: '● Open', tone: 'accent' },
  LOCKED: { label: 'Picks closed', tone: 'neutral' },
  SETTLED: { label: 'Result in', tone: 'accent2' },
  REFUNDING: { label: 'Refunded', tone: 'neutral' },
};

/** Share of the pool on each option, as a bar. */
export function OptionBar({ share, highlight }: { share: number; highlight?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        height: 6,
        borderRadius: t.radius.pill,
        backgroundColor: t.c.surfaceMuted,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.round(share * 100)}%`,
          height: '100%',
          backgroundColor: highlight ? t.c.accent2 : t.c.accent,
        }}
      />
    </View>
  );
}

/** Compact prediction summary for the event screen. */
export function PredictionCard({ p }: { p: PredictionDto }) {
  const t = useTheme();
  const total = Number(p.totalMicro);
  const s = STATUS[p.status];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/predictions/[id]', params: { id: p.id } })}
    >
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space.sm }}>
          <AppText variant="heading" style={{ flex: 1 }}>
            {p.question}
          </AppText>
          <Pill label={s.label} tone={s.tone} />
        </View>
        {p.options.slice(0, 4).map((o) => (
          <View key={o.index} style={{ gap: t.space.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant={p.winningOption === o.index ? 'bodyStrong' : 'body'}>
                {p.winningOption === o.index ? '🏆 ' : ''}
                {o.label}
                {p.myPick?.option === o.index ? '  · your pick' : ''}
              </AppText>
              <AppText variant="caption" tone="muted">
                {o.watchSeconds !== null
                  ? `${o.watchSeconds}s watched`
                  : o.multiplier
                    ? `${o.multiplier}×`
                    : '—'}
              </AppText>
            </View>
            <OptionBar
              share={total ? Number(o.totalMicro) / total : 0}
              highlight={p.myPick?.option === o.index}
            />
          </View>
        ))}
        <AppText variant="caption" tone="muted">
          {usdc(p.totalMicro)} in the pool · {p.pickers} {p.pickers === 1 ? 'pick' : 'picks'}
          {p.humanOnly ? ' · verified humans' : ''} · test USDC on Arc
        </AppText>
      </Card>
    </Pressable>
  );
}
