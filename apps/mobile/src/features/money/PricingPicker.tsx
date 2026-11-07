import { currencyUnit, formatMoney, moneyRules, type PricingInput } from '@muso/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Chip, SwitchRow, TextField } from '@/components/ui';
import { api } from '@/services/api';
import { useTheme } from '@/theme';

const toMinor = (major: string) => Math.round(Number(major.replace(/[^\d.]/g, '')) * 100) || 0;
const toMajor = (minor?: number | null) => (minor ? String(minor / 100) : '');

/**
 * Free / pay to unlock / pay what you want, plus tips. Values are minor units of `currency`
 * (paise for INR, cents for USD = USDC on Arc). Defaults to the platform's currency for new posts.
 */
export function PricingPicker({
  value,
  onChange,
  disabled,
  currency: fixed,
}: {
  value: PricingInput;
  onChange: (p: PricingInput) => void;
  disabled?: boolean;
  currency?: string;
}) {
  const t = useTheme();
  const cfg = useQuery({
    queryKey: ['payments', 'config'],
    queryFn: () => api.payments.config(),
    staleTime: Infinity,
    enabled: !fixed,
  });
  const currency = fixed ?? cfg.data?.currency ?? 'INR';
  const rules = moneyRules(currency);
  const unit = currencyUnit(currency);
  const usdc = currency === 'USD';
  const [custom, setCustom] = useState(
    value.mode === 'PAY_TO_UNLOCK' && !rules.pricePresets.includes(value.priceMinor as never)
      ? toMajor(value.priceMinor)
      : '',
  );
  const tips = value.tipsEnabled ?? true;

  return (
    <View style={{ gap: t.space.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
        <Chip
          label="Free"
          selected={value.mode === 'FREE'}
          disabled={disabled}
          onPress={() => onChange({ mode: 'FREE', tipsEnabled: tips })}
        />
        <Chip
          label="Pay to unlock"
          selected={value.mode === 'PAY_TO_UNLOCK'}
          disabled={disabled}
          onPress={() =>
            onChange({ mode: 'PAY_TO_UNLOCK', priceMinor: rules.defaultPrice, tipsEnabled: tips })
          }
        />
        <Chip
          label="Pay what you want"
          selected={value.mode === 'PAY_WHAT_YOU_WANT'}
          disabled={disabled}
          onPress={() =>
            onChange({
              mode: 'PAY_WHAT_YOU_WANT',
              suggestedMinor: rules.defaultPrice,
              minimumMinor: null,
              gated: true,
              tipsEnabled: tips,
            })
          }
        />
      </View>

      {value.mode === 'FREE' ? (
        <AppText variant="caption" tone="muted">
          Anyone can see it. Fans can still tip you if tips are on.
        </AppText>
      ) : null}

      {value.mode === 'PAY_TO_UNLOCK' ? (
        <View style={{ gap: t.space.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
            {rules.pricePresets.map((p) => (
              <Chip
                key={p}
                label={formatMoney(p, currency)}
                selected={value.priceMinor === p && !custom}
                disabled={disabled}
                onPress={() => {
                  setCustom('');
                  onChange({ ...value, priceMinor: p });
                }}
              />
            ))}
          </View>
          <TextField
            label={`Custom price (${unit})`}
            keyboardType="decimal-pad"
            placeholder={usdc ? 'e.g. 1.5' : 'e.g. 149'}
            value={custom}
            editable={!disabled}
            onChangeText={(v) => {
              setCustom(v);
              onChange({ ...value, priceMinor: toMinor(v) });
            }}
            hint={`Between ${formatMoney(rules.minPrice, currency)} and ${formatMoney(rules.maxPrice, currency)}. ${usdc ? 'Fans pay in USDC on Arc, straight to your wallet. ' : ''}People who buy keep access even if you change the price later.`}
          />
        </View>
      ) : null}

      {value.mode === 'PAY_WHAT_YOU_WANT' ? (
        <View style={{ gap: t.space.sm }}>
          <View style={{ flexDirection: 'row', gap: t.space.md }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={`Suggested (${unit})`}
                keyboardType="decimal-pad"
                value={toMajor(value.suggestedMinor)}
                editable={!disabled}
                onChangeText={(v) => onChange({ ...value, suggestedMinor: toMinor(v) })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label={`Minimum (${unit}, optional)`}
                keyboardType="decimal-pad"
                value={toMajor(value.minimumMinor)}
                editable={!disabled}
                onChangeText={(v) =>
                  onChange({ ...value, minimumMinor: v.trim() ? toMinor(v) : null })
                }
              />
            </View>
          </View>
          <SwitchRow
            label="Contribute to view"
            hint={
              value.gated
                ? 'People pay at least the minimum to see it.'
                : 'Everyone can see it; contributions are optional.'
            }
            value={value.gated ?? true}
            onChange={(gated) => onChange({ ...value, gated })}
          />
        </View>
      ) : null}

      <SwitchRow
        label="Accept tips"
        hint={`Fans can send ${formatMoney(rules.minTip, currency)}–${formatMoney(rules.maxTip, currency)} to say thanks${usdc ? ', in USDC straight to your wallet' : ''}.`}
        value={tips}
        onChange={(tipsEnabled) => onChange({ ...value, tipsEnabled })}
      />
    </View>
  );
}
