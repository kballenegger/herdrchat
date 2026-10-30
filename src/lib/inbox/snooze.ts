import type { InboxStatus } from './inbox';

/**
 * Snoozing a chat: hide it until a time, as T3 Code offers it. The presets
 * resolve against `now` in local time, so "Tomorrow" is tomorrow at 9 where
 * the phone is.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The hour a "this evening" snooze wakes at, and a next-day one. */
export const EVENING_HOUR = 18;
export const MORNING_HOUR = 9;

export type SnoozePresetId = 'hour' | 'three-hours' | 'today' | 'tomorrow' | 'monday';

export interface SnoozePreset {
  id: SnoozePresetId;
  /** "In 1 hour", "This evening", "Next week". */
  label: string;
  /** When it wakes, epoch ms. */
  at: number;
  /** The wake time as a person reads it: "6:00 PM", or "Mon 9:00 AM" when the label names no day. */
  whenLabel: string;
}

/** How a time and a weekday are written; the device's own by default. */
export interface SnoozeFormat {
  time: (date: Date) => string;
  weekday: (date: Date) => string;
}

export const DEVICE_FORMAT: SnoozeFormat = {
  time: (date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  weekday: (date) => date.toLocaleDateString(undefined, { weekday: 'short' }),
};

/**
 * `days` calendar days after `base`, at `hour`:`minute` local time. By the
 * calendar rather than by adding 24 hours: across a DST change a day is 23 or
 * 25 hours long, and "tomorrow at 9" would land at 8 or 10.
 */
export function localAt(base: number, days: number, hour: number, minute = 0): number {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

/** Whole calendar days from `from` to `to`, local time. */
function daysBetween(from: number, to: number): number {
  const start = (value: number) => {
    const date = new Date(value);
    return localAt(date.getTime(), 0, 0);
  };
  return Math.round((start(to) - start(from)) / DAY_MS);
}

/**
 * The snooze menu at `now`: soonest first, one per wake minute (on a Sunday
 * "Monday" is tomorrow, and only "Tomorrow" is offered), and a today option
 * whose time has passed left out.
 */
export function snoozePresets(now: number, format: SnoozeFormat = DEVICE_FORMAT): SnoozePreset[] {
  const today = new Date(now).getDay();
  const mondayAhead = (1 - today + 7) % 7 || 7;
  const candidates: { id: SnoozePresetId; label: string; at: number; namesDay: boolean }[] = [
    { id: 'hour', label: 'In 1 hour', at: now + HOUR_MS, namesDay: false },
    { id: 'three-hours', label: 'In 3 hours', at: now + 3 * HOUR_MS, namesDay: false },
    { id: 'today', label: todayLabel(EVENING_HOUR), at: localAt(now, 0, EVENING_HOUR), namesDay: true },
    { id: 'tomorrow', label: 'Tomorrow', at: localAt(now, 1, MORNING_HOUR), namesDay: true },
    {
      id: 'monday',
      label: mondayAhead === 1 ? 'Tomorrow' : mondayAhead === 7 ? 'Next week' : 'Monday',
      at: localAt(now, mondayAhead, MORNING_HOUR),
      // "Next week" says when, not which day.
      namesDay: mondayAhead !== 7,
    },
  ];
  const seen = new Set<number>();
  return candidates
    .filter((preset) => preset.at > now)
    .sort((a, b) => Math.floor(a.at / MINUTE_MS) - Math.floor(b.at / MINUTE_MS))
    .filter((preset) => {
      const minute = Math.floor(preset.at / MINUTE_MS);
      if (seen.has(minute)) return false;
      seen.add(minute);
      return true;
    })
    .map(({ id, label, at, namesDay }) => ({ id, label, at, whenLabel: whenLabel(at, now, namesDay, format) }));
}

/** "This morning", "This afternoon" or "This evening", by the hour it wakes. */
export function todayLabel(hour: number): string {
  return hour < 12 ? 'This morning' : hour < 17 ? 'This afternoon' : 'This evening';
}

/** The wake time, after its weekday when it is not today and the label does not say the day. */
export function whenLabel(at: number, now: number, labelNamesDay: boolean, format: SnoozeFormat = DEVICE_FORMAT): string {
  const date = new Date(at);
  const time = format.time(date);
  return labelNamesDay || daysBetween(now, at) === 0 ? time : `${format.weekday(date)} ${time}`;
}

/**
 * How long until a snoozed chat wakes, as its row says it: `12m` under an
 * hour, `3h` under a day, then `2d`, each rounded up, and `now` once due.
 * Compared after rounding, so a snooze of an hour reads `1h` and not `60m`.
 */
export function wakeLabel(snoozedUntil: number, now: number): string {
  const remaining = snoozedUntil - now;
  if (remaining <= 0) return 'now';
  const minutes = Math.ceil(remaining / MINUTE_MS);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(remaining / HOUR_MS);
  if (hours < 24) return `${hours}h`;
  return `${Math.ceil(remaining / DAY_MS)}d`;
}

/** Not while it asks: a chat that is asking would wake the moment it was snoozed. */
export function canSnooze(status: InboxStatus): boolean {
  return status !== 'blocked';
}

/** A day the custom snooze can pick, as its chip says it. */
export interface SnoozeDay {
  /** Calendar days from today. */
  offset: number;
  label: string;
}

/** Today, Tomorrow, then the next five days by weekday. */
export function snoozeDays(now: number, format: SnoozeFormat = DEVICE_FORMAT): SnoozeDay[] {
  return Array.from({ length: 7 }, (_, offset) => ({
    offset,
    label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : format.weekday(new Date(localAt(now, offset, 12))),
  }));
}

/**
 * A time of day as typed, in minutes after midnight, or null: `18:30`,
 * `6:30 pm`, `6pm`, `0930`, `9`. A bare hour is that hour on the clock.
 */
export function parseTime(text: string): number | null {
  const match = /^\s*(\d{1,2})(?:[:.h]?(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i.exec(text);
  if (match === null) return null;
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59) return null;
  if (meridiem !== undefined) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/** A custom snooze's wake time, or null when it is not in the future. */
export function customSnoozeAt(now: number, dayOffset: number, minutes: number): number | null {
  const at = localAt(now, dayOffset, Math.floor(minutes / 60), minutes % 60);
  return at > now ? at : null;
}
