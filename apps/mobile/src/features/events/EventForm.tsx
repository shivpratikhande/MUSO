import {
  RECORDING_POLICIES,
  type CreateEventInput,
  type EventDetail,
  type RecordingPolicy,
} from '@muso/shared';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Button, DateTimeField, FormError, ImageField, TextField } from '@/components/ui';
import { useTheme } from '@/theme';
import { RECORDING_COPY } from './format';

const HOUR = 3_600_000;

/** Rounds up to the next half hour. */
const nextSlot = (offsetHours: number) => {
  const d = new Date(Date.now() + offsetHours * HOUR);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
};

export interface EventFormProps {
  initial?: EventDetail;
  submitLabel: string;
  submitting: boolean;
  serverError?: string | null;
  onSubmit: (input: CreateEventInput) => void;
}

/** Create/edit form. Validation mirrors the shared schema; the server re-validates everything. */
export function EventForm({
  initial,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
}: EventFormProps) {
  const t = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [venueName, setVenueName] = useState(initial?.venueName ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [country, setCountry] = useState(initial?.country ?? 'IN');
  const [startsAt, setStartsAt] = useState(initial ? new Date(initial.startsAt) : nextSlot(24));
  const [endsAt, setEndsAt] = useState(initial ? new Date(initial.endsAt) : nextSlot(28));
  const [policy, setPolicy] = useState<RecordingPolicy>(initial?.recordingPolicy ?? 'ALLOWED');
  const [notes, setNotes] = useState(initial?.recordingNotes ?? '');
  const [cover, setCover] = useState<{ key?: string | null; url: string | null }>({
    url: initial?.coverUrl ?? null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 3) e.title = 'At least 3 characters';
    if (!description.trim()) e.description = 'Add a description';
    if (!venueName.trim()) e.venueName = 'Add a venue';
    if (!city.trim()) e.city = 'Add a city';
    if (!/^[A-Za-z]{2}$/.test(country.trim())) e.country = '2 letters';
    if (endsAt <= startsAt) e.endsAt = 'End must be after start';
    else if (endsAt.getTime() - startsAt.getTime() > 14 * 24 * HOUR) e.endsAt = 'Max 14 days';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      venueName: venueName.trim(),
      address: address.trim(),
      city: city.trim(),
      country: country.trim().toUpperCase(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      recordingPolicy: policy,
      recordingNotes: notes.trim(),
      ...(cover.key !== undefined ? { coverKey: cover.key } : {}),
    });
  };

  return (
    <View style={{ gap: t.space.lg }}>
      <ImageField
        label="Poster / cover"
        purpose="EVENT_COVER"
        url={cover.url}
        onUploaded={(key, url) => setCover({ key, url })}
      />
      <TextField label="Event name" value={title} onChangeText={setTitle} error={errors.title} />
      <TextField
        label="Description"
        multiline
        style={{ minHeight: 110, textAlignVertical: 'top' }}
        value={description}
        onChangeText={setDescription}
        error={errors.description}
      />
      <TextField
        label="Venue"
        value={venueName}
        onChangeText={setVenueName}
        error={errors.venueName}
      />
      <TextField label="Address (optional)" value={address} onChangeText={setAddress} />
      <View style={{ flexDirection: 'row', gap: t.space.md }}>
        <View style={{ flex: 2 }}>
          <TextField label="City" value={city} onChangeText={setCity} error={errors.city} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Country"
            autoCapitalize="characters"
            maxLength={2}
            value={country}
            onChangeText={setCountry}
            error={errors.country}
          />
        </View>
      </View>
      <DateTimeField
        label="Starts"
        value={startsAt}
        onChange={(d) => {
          setStartsAt(d);
          if (endsAt <= d) setEndsAt(new Date(d.getTime() + 4 * HOUR));
        }}
      />
      <DateTimeField
        label="Ends"
        value={endsAt}
        minimumDate={startsAt}
        onChange={setEndsAt}
        error={errors.endsAt}
      />

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Recording policy
        </AppText>
        {RECORDING_POLICIES.map((p) => {
          const on = policy === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => setPolicy(p)}
              style={{
                borderWidth: 1.5,
                borderColor: on ? t.c.text : t.c.border,
                borderRadius: t.radius.md,
                padding: t.space.md,
                gap: 2,
              }}
            >
              <AppText variant="bodyStrong">
                {on ? '● ' : '○ '}
                {RECORDING_COPY[p].title}
              </AppText>
              <AppText variant="caption" tone="muted">
                {RECORDING_COPY[p].body}
              </AppText>
            </Pressable>
          );
        })}
        <TextField
          label="Notes for guests (optional)"
          placeholder="e.g. No flash during the acoustic set"
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      <FormError message={serverError} />
      <Button label={submitLabel} loading={submitting} onPress={submit} />
    </View>
  );
}
