import {
  PREDICTION_TEMPLATES,
  PREDICTION_TEMPLATE_INFO,
  type PredictionTemplateDto,
} from '@muso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Chip, FormError, Screen, SwitchRow, TextField } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const LOCKS = [
  { label: 'When the event starts', ms: null },
  { label: 'In 30 min', ms: 30 * 60_000 },
  { label: 'In 1 hour', ms: 60 * 60_000 },
  { label: 'In 3 hours', ms: 3 * 60 * 60_000 },
] as const;

export default function NewPredictionScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const hints = useQuery({
    queryKey: ['predictions', 'suggestions', eventId],
    queryFn: () => api.predictions.suggestions(eventId),
  });
  const [template, setTemplate] = useState<PredictionTemplateDto>('MATCH_WINNER');
  const [question, setQuestion] = useState(PREDICTION_TEMPLATE_INFO.MATCH_WINNER.question);
  const [options, setOptions] = useState<string[]>(['', '']);
  const [creators, setCreators] = useState<string[]>([]);
  const [lock, setLock] = useState<number | null>(null);
  const [minStake, setMinStake] = useState('1');
  const [maxStake, setMaxStake] = useState('20');
  const [share, setShare] = useState(10);
  const [humanOnly, setHumanOnly] = useState(true);
  const bestClip = template === 'BEST_CLIP';

  const chooseTemplate = (tpl: PredictionTemplateDto) => {
    setTemplate(tpl);
    setQuestion(PREDICTION_TEMPLATE_INFO[tpl].question);
    // Battles and setlists start from the event's lineup.
    if (
      (tpl === 'BATTLE' || tpl === 'MATCH_WINNER') &&
      hints.data?.lineup.length &&
      options.every((o) => !o)
    )
      setOptions(hints.data.lineup.slice(0, 16));
  };

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid =
    question.trim().length >= 5 && (bestClip ? creators.length >= 2 : filled.length >= 2);

  const create = useMutation({
    mutationFn: () =>
      api.predictions.create(eventId, {
        template,
        question: question.trim(),
        ...(bestClip ? { creatorIds: creators, creatorSharePct: share } : { options: filled }),
        ...(lock ? { locksAt: new Date(Date.now() + lock).toISOString() } : {}),
        minStakeUsdc: Number(minStake),
        maxStakeUsdc: Number(maxStake),
        humanOnly,
      }),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['predictions'] });
      router.replace({ pathname: '/predictions/[id]', params: { id: p.id } });
    },
  });

  return (
    <Screen keyboard edges={['bottom']}>
      <Stack.Screen options={{ title: 'New prediction' }} />
      <AppText tone="muted">
        A free-to-join prediction game for your crowd, played with test USDC on Arc. Stakes sit in
        the PredictionPools contract; winners split the pool.
      </AppText>

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Type
        </AppText>
        <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
          {PREDICTION_TEMPLATES.map((tpl) => (
            <Chip
              key={tpl}
              label={PREDICTION_TEMPLATE_INFO[tpl].label}
              selected={template === tpl}
              onPress={() => chooseTemplate(tpl)}
            />
          ))}
        </View>
        {bestClip ? (
          <AppText variant="caption" tone="muted">
            Settles automatically: the creator whose clips get the most verified watch time wins,
            counted until an hour after the event ends.
          </AppText>
        ) : (
          <AppText variant="caption" tone="muted">
            You declare the result after picks close.
          </AppText>
        )}
      </View>

      <TextField label="Question" value={question} onChangeText={setQuestion} />

      {bestClip ? (
        <View style={{ gap: t.space.sm }}>
          <AppText variant="label" tone="muted">
            Creators (pick at least 2)
          </AppText>
          {hints.data?.creators.length ? (
            <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
              {hints.data.creators.map((c) => (
                <Chip
                  key={c.id}
                  label={`${c.displayName ?? c.username} · ${c.posts}`}
                  selected={creators.includes(c.id)}
                  onPress={() =>
                    setCreators((cur) =>
                      cur.includes(c.id)
                        ? cur.filter((x) => x !== c.id)
                        : [...cur, c.id].slice(0, 16),
                    )
                  }
                />
              ))}
            </View>
          ) : (
            <AppText variant="caption">
              No creators have posted at this event yet. Come back once clips are coming in.
            </AppText>
          )}
          <AppText variant="label" tone="muted">
            Winning creator’s share of the pool
          </AppText>
          <View style={{ flexDirection: 'row', gap: t.space.sm }}>
            {[0, 5, 10, 20].map((v) => (
              <Chip key={v} label={`${v}%`} selected={share === v} onPress={() => setShare(v)} />
            ))}
          </View>
        </View>
      ) : (
        <View style={{ gap: t.space.sm }}>
          <AppText variant="label" tone="muted">
            Options
          </AppText>
          {options.map((o, i) => (
            <TextField
              key={i}
              label={`Option ${i + 1}`}
              value={o}
              onChangeText={(v) => setOptions((cur) => cur.map((x, j) => (j === i ? v : x)))}
            />
          ))}
          <View style={{ flexDirection: 'row', gap: t.space.sm }}>
            {options.length < 16 ? (
              <Button
                size="sm"
                variant="secondary"
                label="Add option"
                onPress={() => setOptions((cur) => [...cur, ''])}
              />
            ) : null}
            {options.length > 2 ? (
              <Button
                size="sm"
                variant="ghost"
                label="Remove last"
                onPress={() => setOptions((cur) => cur.slice(0, -1))}
              />
            ) : null}
          </View>
        </View>
      )}

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Picks close
        </AppText>
        <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
          {LOCKS.map((l) => (
            <Chip
              key={l.label}
              label={l.label}
              selected={lock === l.ms}
              onPress={() => setLock(l.ms)}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: t.space.md }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Min stake (USDC)"
            keyboardType="decimal-pad"
            value={minStake}
            onChangeText={setMinStake}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Max stake (USDC)"
            keyboardType="decimal-pad"
            value={maxStake}
            onChangeText={setMaxStake}
          />
        </View>
      </View>
      <SwitchRow
        label="Verified humans only"
        hint="One person, one pick (World ID). Turn off to let any MUSO account play."
        value={humanOnly}
        onChange={setHumanOnly}
      />
      <FormError message={create.isError ? errorMessage(create.error) : null} />
      <Button
        label="Create prediction"
        disabled={!valid}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Screen>
  );
}
