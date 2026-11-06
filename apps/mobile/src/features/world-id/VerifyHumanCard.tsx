import type { WorldIdContext } from '@muso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { proofOfHuman, useIDKitRequest } from '@worldcoin/idkit/expo';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, FormError } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const SIMULATOR = 'https://simulator.worldcoin.org';

/**
 * "Verify you're human" with World ID (Proof of Human). The server signs the request and
 * verifies the proof; one World ID can verify only one MUSO account. Verified humans can earn
 * from human-only reward pools (all USDC pools on Arc).
 */
export function VerifyHumanCard({ reason }: { reason?: string }) {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['human'], queryFn: () => api.human.status() });
  const [ctx, setCtx] = useState<WorldIdContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: () => api.human.context(),
    onSuccess: (c) => setCtx(c),
    onError: (e) => setError(errorMessage(e)),
  });

  if (!q.data?.enabled) return null;
  const done = () => {
    setCtx(null);
    void qc.invalidateQueries({ queryKey: ['human'] });
    void qc.invalidateQueries({ queryKey: ['pools'] });
  };

  return (
    <Card>
      <AppText variant="label" tone="muted">
        Verified human · World ID
      </AppText>
      {q.data.verified ? (
        <AppText variant="bodyStrong">You’re verified as a unique human ✓</AppText>
      ) : (
        <>
          <AppText variant="caption">
            {reason ??
              'Some reward pools pay verified humans only, so one person can’t farm rewards with many accounts.'}{' '}
            World ID proves you’re a unique person without sharing who you are.
          </AppText>
          <FormError message={error} />
          {ctx ? (
            <HumanFlow
              ctx={ctx}
              onDone={done}
              onError={(m) => {
                setError(m);
                setCtx(null);
              }}
            />
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <Button
                size="sm"
                label="Verify with World ID"
                loading={start.isPending}
                onPress={() => {
                  setError(null);
                  start.mutate();
                }}
              />
            </View>
          )}
        </>
      )}
      {!q.data.verified && ctx?.environment === 'staging' ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: t.space.xs }}>
          Test mode: open the World ID Simulator ({SIMULATOR}) and paste the copied link.
        </AppText>
      ) : null}
    </Card>
  );
}

function HumanFlow({
  ctx,
  onDone,
  onError,
}: {
  ctx: WorldIdContext;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [returnTo] = useState(() => Linking.createURL('human/return'));
  const flow = useIDKitRequest({
    app_id: ctx.app_id as `app_${string}`,
    action: ctx.action,
    rp_context: ctx.rp_context,
    preset: proofOfHuman({ signal: ctx.signal }),
    allow_legacy_proofs: false,
    environment: ctx.environment,
    return_to: returnTo,
  });
  const [copied, setCopied] = useState(false);
  const verify = useMutation({
    mutationFn: (result: unknown) => api.human.verify(result),
    onSuccess: onDone,
    onError: (e) => onError(errorMessage(e)),
  });

  // Start once; open World App as soon as the request link exists (production).
  const { open } = flow;
  useEffect(() => {
    open();
  }, [open]);
  const opened = useRef(false);
  useEffect(() => {
    if (!flow.connectorURI || opened.current) return;
    opened.current = true;
    if (ctx.environment === 'staging') {
      void Clipboard.setStringAsync(flow.connectorURI).then(() => setCopied(true));
      void Linking.openURL(SIMULATOR);
    } else {
      Linking.openURL(flow.connectorURI).catch(() =>
        onError('Could not open World App. Is it installed?'),
      );
    }
  }, [flow.connectorURI, ctx.environment, onError]);
  // Forward the proof exactly as IDKit returned it; the server verifies it with World.
  const sent = useRef(false);
  useEffect(() => {
    if (!flow.result || sent.current) return;
    sent.current = true;
    verify.mutate(flow.result);
  }, [flow.result, verify]);
  useEffect(() => {
    if (flow.isError)
      onError(
        flow.errorCode === 'cancelled' || flow.errorCode === 'user_rejected'
          ? 'Verification cancelled. Nothing was shared.'
          : `World ID couldn’t verify you (${flow.errorCode ?? 'error'}). Try again.`,
      );
  }, [flow.isError, flow.errorCode, onError]);

  return (
    <View style={{ gap: 6 }}>
      <AppText variant="caption">
        {verify.isPending
          ? 'Checking your proof with World…'
          : flow.isAwaitingUserConfirmation
            ? 'Approve the request in World App…'
            : copied
              ? 'Link copied. Paste it in the World ID Simulator, then come back.'
              : 'Opening World App…'}
      </AppText>
      {flow.connectorURI && !flow.result ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            size="sm"
            variant="secondary"
            label={ctx.environment === 'staging' ? 'Copy link again' : 'Open World App'}
            onPress={() =>
              ctx.environment === 'staging'
                ? void Clipboard.setStringAsync(flow.connectorURI!).then(() => setCopied(true))
                : void Linking.openURL(flow.connectorURI!)
            }
          />
        </View>
      ) : null}
    </View>
  );
}
