import { PRICE_PRESETS_MINOR, formatMoney, type PricingInput } from '@muso/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Chip, SwitchRow, TextField } from '@/components/ui';
import { useTheme } from '@/theme';

const toMinor = (rupees: string) => Math.round(Number(rupees.replace(/[^\d.]/g, '')) * 100) || 0;
const toRupees = (minor?: number | null) => (minor ? String(minor / 100) : '');

/** Free / pay to unlock / pay what you want, plus tips. Values are minor units (paise). */
export function PricingPicker({
  value,
  onChange,
  disabled,
}: {
  value: PricingInput;
  onChange: (p: PricingInput) => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  const [custom, setCustom] = useState(
    value.mode === 'PAY_TO_UNLOCK' && !PRICE_PRESETS_MINOR.includes(value.priceMinor as never)
      ? toRupees(value.priceMinor)
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
          onPress={() => onChange({ mode: 'PAY_TO_UNLOCK', priceMinor: 4900, tipsEnabled: tips })}
        />
        <Chip
          label="Pay what you want"
          selected={value.mode === 'PAY_WHAT_YOU_WANT'}
          disabled={disabled}
          onPress={() =>
            onChange({
              mode: 'PAY_WHAT_YOU_WANT',
              suggestedMinor: 4900,
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
            {PRICE_PRESETS_MINOR.map((p) => (
              <Chip
                key={p}
                label={formatMoney(p)}
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
            label="Custom price (₹)"
            keyboardType="decimal-pad"
            placeholder="e.g. 149"
            value={custom}
            editable={!disabled}
            onChangeText={(v) => {
              setCustom(v);
              onChange({ ...value, priceMinor: toMinor(v) });
            }}
            hint="Between ₹10 and ₹5,000. People who buy keep access even if you change the price later."
          />
        </View>
      ) : null}

      {value.mode === 'PAY_WHAT_YOU_WANT' ? (
        <View style={{ gap: t.space.sm }}>
          <View style={{ flexDirection: 'row', gap: t.space.md }}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Suggested (₹)"
                keyboardType="decimal-pad"
                value={toRupees(value.suggestedMinor)}
                editable={!disabled}
                onChangeText={(v) => onChange({ ...value, suggestedMinor: toMinor(v) })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="Minimum (₹, optional)"
                keyboardType="decimal-pad"
                value={toRupees(value.minimumMinor)}
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
        hint="Fans can send ₹10–₹10,000 to say thanks."
        value={tips}
        onChange={(tipsEnabled) => onChange({ ...value, tipsEnabled })}
      />
    </View>
  );
}
