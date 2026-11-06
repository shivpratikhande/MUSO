import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Button, Card } from '@/components/ui';
import { api } from '@/services/api';
import { useTheme } from '@/theme';

const minutes = (s: number) => (s < 60 ? `${s}s` : `${Math.round(s / 60)} min`);
const short = (k: string) => `${k.slice(0, 8)}…${k.slice(-6)}`;

/**
 * "Public proof on Arkiv": the pool's final attention report, read live from Arkiv (MUSO's
 * public, read-only record), not from MUSO's database. Anyone can run the same query.
 */
export function ArkivProofCard({ poolId }: { poolId: string }) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  const q = useQuery({
    queryKey: ['pools', poolId, 'arkiv'],
    queryFn: () => api.arkiv.proof(poolId),
    refetchInterval: (query) => (query.state.data?.report ? false : 30_000),
  });
  const p = q.data;
  if (!p?.enabled) return null;

  return (
    <Card>
      <AppText variant="label" tone="muted">
        Public proof on Arkiv
      </AppText>
      {!p.report ? (
        <AppText variant="caption">
          {q.isPending
            ? 'Reading from Arkiv…'
            : 'Publishing this pool’s attention report to Arkiv…'}
        </AppText>
      ) : (
        <>
          <AppText variant="caption">
            Read live from Arkiv, a public database. MUSO wrote this report once and can’t change
            it.
          </AppText>
          <View style={{ flexDirection: 'row', gap: t.space.lg, flexWrap: 'wrap' }}>
            <Stat
              label={p.report.humanOnly ? 'Verified humans' : 'Viewers'}
              value={String(p.report.verifiedViewers)}
            />
            <Stat label="Watch time" value={minutes(p.report.watchSeconds)} />
            <Stat label="Clips paid" value={String(p.report.clips)} />
            <Stat
              label="Paid out"
              value={`${p.report.paid} ${p.report.currency === 'USD' ? 'USDC' : p.report.currency}`}
            />
          </View>
          {p.shares.slice(0, 5).map((s) => (
            <Pressable
              key={s.key}
              onPress={() => void Linking.openURL(s.url)}
              accessibilityRole="link"
            >
              <AppText variant="caption" tone="muted">
                #{s.rank} · {minutes(s.watchSeconds)} from {s.viewers} viewers → {s.share} · entity{' '}
                {short(s.key)} ↗
              </AppText>
            </Pressable>
          ))}
          {p.receipts.length ? (
            <AppText variant="caption" tone="muted">
              {p.receipts.length} payout receipt{p.receipts.length > 1 ? 's' : ''} link to USDC
              transactions on Arc.
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="secondary"
              label="Open on Arkiv"
              onPress={() => void Linking.openURL(p.report!.url)}
            />
            {p.query ? (
              <Button
                size="sm"
                variant="ghost"
                label={copied ? 'Query copied' : 'Copy query'}
                onPress={() => void Clipboard.setStringAsync(p.query!).then(() => setCopied(true))}
              />
            ) : null}
          </View>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}
