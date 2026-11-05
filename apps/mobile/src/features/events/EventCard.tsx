import type { EventSummary } from '@muso/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Pill } from '@/components/ui';
import { useTheme } from '@/theme';
import { STATUS_LABEL, formatEventWhen } from './format';

/** Editorial event card: large cover, status, title in serif, when & where, headliners. */
export function EventCard({ event, showReview }: { event: EventSummary; showReview?: boolean }) {
  const t = useTheme();
  const live = event.status === 'LIVE';
  const headline = event.headliners.map((h) => h.stageName).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${STATUS_LABEL[event.status]}, ${formatEventWhen(event.startsAt, event.endsAt)}, ${event.venueName}, ${event.city}`}
      onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.id } })}
      style={({ pressed }) => ({
        borderRadius: t.radius.lg,
        overflow: 'hidden',
        backgroundColor: t.c.surface,
        opacity: pressed ? 0.92 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View
        style={{
          aspectRatio: 16 / 9,
          backgroundColor: t.c.inverseBackground,
          justifyContent: 'flex-end',
        }}
      >
        {event.coverUrl ? (
          <Image
            source={{ uri: event.coverUrl }}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <AppText
            variant="display"
            tone="inverse"
            numberOfLines={2}
            style={{ padding: t.space.lg, opacity: 0.9 }}
          >
            {event.title}
          </AppText>
        )}
        <View
          style={{
            position: 'absolute',
            top: t.space.md,
            left: t.space.md,
            flexDirection: 'row',
            gap: t.space.xs,
          }}
        >
          <Pill
            label={STATUS_LABEL[event.status]}
            tone={live ? 'accent' : event.status === 'CANCELLED' ? 'danger' : 'neutral'}
          />
          {showReview && event.reviewStatus !== 'APPROVED' ? (
            <Pill
              label={event.reviewStatus === 'PENDING' ? 'In review' : 'Not approved'}
              tone={event.reviewStatus === 'REJECTED' ? 'danger' : 'neutral'}
            />
          ) : null}
        </View>
      </View>
      <View style={{ padding: t.space.lg, gap: t.space.xs }}>
        <AppText variant="title" numberOfLines={2}>
          {event.title}
        </AppText>
        {headline ? (
          <AppText variant="bodyStrong" numberOfLines={1}>
            {headline}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="muted">
          {formatEventWhen(event.startsAt, event.endsAt)}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {event.venueName} · {event.city}
        </AppText>
      </View>
    </Pressable>
  );
}
