import { WORKING_EXIT_GRACE_MS, createReturnTracker, type TrackerClock } from '../returnTracker';

/** A clock the test moves by hand, with its timers. */
function fakeClock(start = 1_000) {
  let now = start;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let next = 0;
  const clock: TrackerClock = {
    now: () => now,
    setTimeout: (run, ms) => {
      next += 1;
      timers.push({ at: now + ms, run, id: next });
      return next;
    },
    clearTimeout: (handle) => {
      timers = timers.filter((timer) => timer.id !== handle);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    const due = timers.filter((timer) => timer.at <= now);
    timers = timers.filter((timer) => timer.at > now);
    for (const timer of due) timer.run();
  };
  return { clock, advance, now: () => now, pending: () => timers.length };
}

it('records when a chat leaves working, and holds it as working for the grace', () => {
  const { clock, advance, now } = fakeClock();
  const tracker = createReturnTracker(clock);
  tracker.observe([{ key: 'a', status: 'idle' }]);
  tracker.observe([{ key: 'a', status: 'working' }]);
  expect(tracker.returnedAt('a')).toBeNull();
  expect(tracker.activeSince('a')).toBe(1_000);
  advance(5_000);
  tracker.observe([{ key: 'a', status: 'idle' }]);
  expect(tracker.returnedAt('a')).toBe(6_000);
  expect(tracker.isWorking('a', 'idle', now())).toBe(true);
  const listener = jest.fn();
  tracker.subscribe(listener);
  advance(WORKING_EXIT_GRACE_MS);
  // A timer told the list the grace is over.
  expect(listener).toHaveBeenCalled();
  expect(tracker.isWorking('a', 'idle', now())).toBe(false);
});

it('lets a run that carries on within the grace stay one stretch of work', () => {
  const { clock, advance, now } = fakeClock();
  const tracker = createReturnTracker(clock);
  tracker.observe([{ key: 'a', status: 'idle' }]);
  tracker.observe([{ key: 'a', status: 'working' }]);
  advance(1_000);
  tracker.observe([{ key: 'a', status: 'done' }]);
  advance(500);
  tracker.observe([{ key: 'a', status: 'working' }]);
  expect(tracker.activeSince('a')).toBe(1_000);
  expect(tracker.isWorking('a', 'working', now())).toBe(true);
});

it('does not hold a chat that stopped to ask, and records that as a return', () => {
  const { clock, advance, now } = fakeClock();
  const tracker = createReturnTracker(clock);
  tracker.observe([{ key: 'a', status: 'working' }]);
  advance(1_000);
  tracker.observe([{ key: 'a', status: 'blocked' }]);
  expect(tracker.isWorking('a', 'blocked', now())).toBe(false);
  expect(tracker.returnedAt('a')).toBe(2_000);
  expect(tracker.activeSince('a')).toBe(2_000);
});

it('counts a chat asking when first seen as back now, and one doing anything else as not back', () => {
  const { clock } = fakeClock();
  const tracker = createReturnTracker(clock);
  tracker.observe([{ key: 'ask', status: 'blocked' }, { key: 'idle', status: 'idle' }]);
  expect(tracker.returnedAt('ask')).toBe(1_000);
  expect(tracker.returnedAt('idle')).toBeNull();
  expect(tracker.activeSince('idle')).toBeNull();
});

// After a relaunch, or a remount on another host, the first poll sees a
// chat already working. When it started is unknown: the time the app looked
// is not when anything happened, and treating it so took a chat settled
// while it worked off the shelf on every launch.
it('records no start for a chat already working or asking when first seen, only one seen to change', () => {
  const { clock, advance } = fakeClock();
  const tracker = createReturnTracker(clock);
  tracker.observe([{ key: 'busy', status: 'working' }, { key: 'ask', status: 'blocked' }, { key: 'idle', status: 'idle' }]);
  expect(tracker.activeSince('busy')).toBeNull();
  expect(tracker.activeSince('ask')).toBeNull();
  advance(5_000);
  tracker.observe([{ key: 'busy', status: 'working' }, { key: 'ask', status: 'blocked' }, { key: 'idle', status: 'working' }]);
  expect(tracker.activeSince('busy')).toBeNull();
  expect(tracker.activeSince('idle')).toBe(6_000);
  tracker.reset();
  tracker.observe([{ key: 'idle', status: 'working' }]);
  expect(tracker.activeSince('idle')).toBeNull();
});

it('reads a chat that stopped before the next poll as still working, and an untracked one by its status', () => {
  const { clock, now } = fakeClock();
  const tracker = createReturnTracker(clock);
  tracker.observe([{ key: 'a', status: 'working' }]);
  expect(tracker.isWorking('a', 'idle', now())).toBe(true);
  expect(tracker.isWorking('new', 'idle', now())).toBe(false);
  expect(tracker.isWorking('new', 'working', now())).toBe(true);
});

it('forgets a row that is gone, and notifies only when something changed', () => {
  const { clock, advance } = fakeClock();
  const tracker = createReturnTracker(clock);
  tracker.observe([{ key: 'a', status: 'blocked' }]);
  const before = tracker.getSnapshot();
  tracker.observe([{ key: 'a', status: 'blocked' }]);
  expect(tracker.getSnapshot()).toBe(before);
  advance(10);
  tracker.observe([]);
  expect(tracker.getSnapshot()).toBe(before + 1);
  expect(tracker.returnedAt('a')).toBeNull();
});
