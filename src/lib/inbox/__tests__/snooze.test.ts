import {
  canSnooze,
  customSnoozeAt,
  localAt,
  parseTime,
  snoozeDays,
  snoozePresets,
  wakeLabel,
  type SnoozeFormat,
} from '../snooze';

// Fixed words, so the test does not depend on the machine's locale.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const format: SnoozeFormat = {
  time: (date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`,
  weekday: (date) => DAYS[date.getDay()] ?? '?',
};
/** A local time, whatever the machine's zone: 2026-10-28 is a Wednesday. */
const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const menu = (now: number) => snoozePresets(now, format).map((preset) => `${preset.label} · ${preset.whenLabel}`);

it('offers the presets soonest first on a weekday afternoon', () => {
  expect(menu(local(28, 14, 0))).toEqual([
    'In 1 hour · 15:00',
    'In 3 hours · 17:00',
    'This evening · 18:00',
    'Tomorrow · 9:00',
    'Monday · 9:00',
  ]);
});

it('leaves out this evening once it has passed, and names the day a late duration lands on', () => {
  expect(menu(local(28, 22, 30))).toEqual([
    'In 1 hour · 23:30',
    'In 3 hours · Thu 1:30',
    'Tomorrow · 9:00',
    'Monday · 9:00',
  ]);
});

it('calls Monday "Next week" on a Monday, with its day, and keeps one row per wake minute on a Sunday', () => {
  // 2026-10-26 is a Monday.
  expect(menu(local(26, 10))).toContain('Next week · Mon 9:00');
  // 2026-10-25 is a Sunday: Monday 9:00 is tomorrow, offered once.
  const sunday = snoozePresets(local(25, 10), format);
  expect(sunday.map((preset) => preset.label)).toEqual(['In 1 hour', 'In 3 hours', 'This evening', 'Tomorrow']);
  expect(sunday.at(-1)?.at).toBe(local(26, 9));
});

it('wakes at 9 local time the next day across a DST change', () => {
  // US clocks go back on 2026-11-01; Europe's went back on 2026-10-25.
  for (const day of [24, 31]) {
    const wake = new Date(localAt(local(day, 23, 30), 1, 9));
    expect(wake.getHours()).toBe(9);
    expect(wake.getDate()).toBe(new Date(2026, 9, day + 1).getDate());
  }
});

it('says how long until a snooze ends, rounded up', () => {
  const now = 1_000_000;
  expect(wakeLabel(now - 1, now)).toBe('now');
  expect(wakeLabel(now + 12 * 60_000 - 5_000, now)).toBe('12m');
  expect(wakeLabel(now + 30_000, now)).toBe('1m');
  // A snooze of an hour, a moment later, still reads an hour.
  expect(wakeLabel(now + 3_600_000 - 2_000, now)).toBe('1h');
  expect(wakeLabel(now + 2.5 * 3_600_000, now)).toBe('3h');
  expect(wakeLabel(now + 30 * 3_600_000, now)).toBe('2d');
});

it('cannot snooze a chat that is asking', () => {
  expect(canSnooze('blocked')).toBe(false);
  expect(canSnooze('working')).toBe(true);
  expect(canSnooze('idle')).toBe(true);
});

it('offers today, tomorrow and the next five days for a custom snooze', () => {
  expect(snoozeDays(local(28, 10), format).map((day) => day.label)).toEqual(['Today', 'Tomorrow', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue']);
});

it('reads a typed time', () => {
  expect(parseTime('18:30')).toBe(18 * 60 + 30);
  expect(parseTime('6:30 pm')).toBe(18 * 60 + 30);
  expect(parseTime('6PM')).toBe(18 * 60);
  expect(parseTime('12am')).toBe(0);
  expect(parseTime('12 p.m.')).toBe(12 * 60);
  expect(parseTime('0930')).toBe(9 * 60 + 30);
  expect(parseTime('9')).toBe(9 * 60);
  expect(parseTime('24:00')).toBeNull();
  expect(parseTime('13pm')).toBeNull();
  expect(parseTime('9:75')).toBeNull();
  expect(parseTime('soon')).toBeNull();
  expect(parseTime('')).toBeNull();
});

it('resolves a custom snooze, and refuses one in the past', () => {
  const now = local(28, 14);
  expect(customSnoozeAt(now, 0, 18 * 60)).toBe(local(28, 18));
  expect(customSnoozeAt(now, 2, 8 * 60 + 15)).toBe(local(30, 8, 15));
  expect(customSnoozeAt(now, 0, 9 * 60)).toBeNull();
});
