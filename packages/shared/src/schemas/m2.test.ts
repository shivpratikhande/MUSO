import { describe, expect, it } from 'vitest';
import {
  CreateEventSchema,
  SetLineupSchema,
  SetRolesSchema,
  UpdateMeSchema,
  UsernameSchema,
  eventStatus,
} from '../index.js';

const event = {
  title: 'Night Market Live',
  description: 'Open-air set',
  venueName: 'Jio Garden',
  city: 'Mumbai',
  country: 'in',
  startsAt: '2026-12-01T18:00:00+05:30',
  endsAt: '2026-12-01T23:00:00+05:30',
};

describe('profile schemas', () => {
  it('normalises usernames and rejects bad ones', () => {
    expect(UsernameSchema.parse('  Shiv.Beats ')).toBe('shiv.beats');
    for (const bad of ['ab', '.lead', 'trail_', 'two..dots', 'has space', 'émoji']) {
      expect(UsernameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('never lets users self-assign ADMIN', () => {
    expect(SetRolesSchema.safeParse({ roles: ['ADMIN'] }).success).toBe(false);
    expect(SetRolesSchema.safeParse({ roles: [] }).success).toBe(false);
    expect(SetRolesSchema.safeParse({ roles: ['ARTIST', 'ARTIST'] }).success).toBe(false);
    expect(SetRolesSchema.safeParse({ roles: ['ARTIST', 'CREATOR'] }).success).toBe(true);
  });

  it('only accepts http(s) profile links', () => {
    expect(
      UpdateMeSchema.safeParse({ links: [{ label: 'x', url: 'javascript:alert(1)' }] }).success,
    ).toBe(false);
    expect(
      UpdateMeSchema.safeParse({ links: [{ label: 'IG', url: 'https://instagram.com/a' }] })
        .success,
    ).toBe(true);
  });
});

describe('event schemas', () => {
  it('accepts a valid event and uppercases the country', () => {
    const r = CreateEventSchema.parse(event);
    expect(r.country).toBe('IN');
    expect(r.recordingPolicy).toBe('ALLOWED');
  });

  it('rejects an end before the start', () => {
    const r = CreateEventSchema.safeParse({ ...event, endsAt: '2026-12-01T17:00:00+05:30' });
    expect(r.success).toBe(false);
  });

  it('rejects events longer than 14 days', () => {
    expect(
      CreateEventSchema.safeParse({ ...event, endsAt: '2026-12-30T23:00:00+05:30' }).success,
    ).toBe(false);
  });

  it('rejects duplicate artists in a lineup', () => {
    const id = '0190a6f0-0000-7000-8000-000000000001';
    expect(SetLineupSchema.safeParse({ artistIds: [id, id] }).success).toBe(false);
  });

  it('derives lifecycle status from times', () => {
    const e = { startsAt: '2026-01-01T10:00:00Z', endsAt: '2026-01-01T12:00:00Z' };
    expect(eventStatus(e, new Date('2026-01-01T09:00:00Z'))).toBe('UPCOMING');
    expect(eventStatus(e, new Date('2026-01-01T11:00:00Z'))).toBe('LIVE');
    expect(eventStatus(e, new Date('2026-01-01T12:00:00Z'))).toBe('COMPLETED');
    expect(
      eventStatus({ ...e, cancelledAt: '2025-12-31T00:00:00Z' }, new Date('2026-01-01T11:00:00Z')),
    ).toBe('CANCELLED');
  });
});
