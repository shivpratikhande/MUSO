import type { EventStatus, RecordingPolicy } from '@muso/shared';

const day = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** "Sat 6 Dec · 7:00 PM – 11:00 PM" or across days "Sat 6 Dec 7:00 PM – Sun 7 Dec 6:00 AM". */
export function formatEventWhen(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  return s.toDateString() === e.toDateString()
    ? `${day(s)} · ${time(s)} – ${time(e)}`
    : `${day(s)} ${time(s)} – ${day(e)} ${time(e)}`;
}

export const formatTime = (iso: string) => time(new Date(iso));

export const STATUS_LABEL: Record<EventStatus, string> = {
  UPCOMING: 'Upcoming',
  LIVE: 'Live now',
  COMPLETED: 'Ended',
  CANCELLED: 'Cancelled',
};

export const RECORDING_COPY: Record<RecordingPolicy, { title: string; body: string }> = {
  ALLOWED: { title: 'Photos & video welcome', body: 'Capture the moment and share it on MUSO.' },
  PHOTOS_ONLY: { title: 'Photos only', body: 'Please don’t record video at this event.' },
  NOT_ALLOWED: {
    title: 'No recording',
    body: 'The organizer has asked guests not to photograph or film.',
  },
};

export const eventKeys = {
  all: ['events'] as const,
  list: (when: string, q: string) => ['events', 'list', when, q] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
  mine: ['events', 'mine'] as const,
  following: ['events', 'following'] as const,
  pending: ['events', 'pending'] as const,
};
