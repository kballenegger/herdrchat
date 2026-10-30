import type { InboxStatus } from './inbox';

/**
 * How long a chat that stopped working still counts as working. A run can end
 * a moment before the next one starts (an agent that answers and carries on),
 * and without this the chat would flicker through the inbox and back.
 */
export const WORKING_EXIT_GRACE_MS = 2_000;

/** A row as the tracker sees it: its key (connection and chat) and status. */
export interface TrackedRow {
  key: string;
  status: InboxStatus;
}

/** The timers the tracker runs on, injected so tests can drive the clock. */
export interface TrackerClock {
  now: () => number;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

interface RowState {
  status: InboxStatus;
  /** While a finished run's grace lasts: when it ends. */
  graceUntil: number | null;
  /** When it last came back: left working, or started asking. */
  returnedAt: number | null;
  /**
   * When it was seen to start working or asking; null when it has not been
   * seen to (it was already doing so when first seen, or never has).
   */
  activeSince: number | null;
}

export interface ReturnTracker {
  /** Record a poll's rows. A row that is not in it is forgotten. */
  observe: (rows: readonly TrackedRow[], now?: number) => void;
  /** When the row last came back to you, as seen by this app. */
  returnedAt: (key: string) => number | null;
  /**
   * When the row was seen to start working or asking: a change between two
   * polls. Null for a row already working or asking when first seen, whose
   * start this app did not see.
   */
  activeSince: (key: string) => number | null;
  /**
   * Whether the row counts as working: its status says so, or it stopped less
   * than `WORKING_EXIT_GRACE_MS` ago and did not stop to ask. `status` is the
   * row's status now, which may be newer than the last poll observed.
   */
  isWorking: (key: string, status: InboxStatus, now: number) => boolean;
  /** `useSyncExternalStore`: a grace ending, or a poll that changed something. */
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  reset: () => void;
}

const defaultClock: TrackerClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * What the app saw each chat do, across polls: when it came back to you, and
 * whether it is still within the grace after a run.
 *
 * A chat comes back when it leaves `working` (to anything) and when it starts
 * asking (`blocked`), which is what makes a question pop to the top. A chat
 * already asking when first seen came back then too: it needs you now. One
 * first seen doing anything else has no return of its own, and is ordered by
 * its last message.
 *
 * When a chat started working or asking (`activeSince`) is only what was seen
 * change between two polls. A row first seen working or asking (the app was
 * just launched, the list remounted on another host) has no start: the time
 * it was first seen is when the app looked, not when anything happened. A
 * chat settled while it worked would otherwise come off the shelf on every
 * launch, its "start" always newer than its settle.
 *
 * Module-level (`inboxReturns`), keyed by connection and row, so placement
 * survives the list unmounting under a pushed screen.
 */
export function createReturnTracker(clock: TrackerClock = defaultClock): ReturnTracker {
  const states = new Map<string, RowState>();
  const listeners = new Set<() => void>();
  let version = 0;
  let timer: unknown = null;

  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };

  const schedule = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    let next = Infinity;
    for (const state of states.values()) {
      if (state.graceUntil !== null) next = Math.min(next, state.graceUntil);
    }
    if (next === Infinity) return;
    timer = clock.setTimeout(() => {
      timer = null;
      const at = clock.now();
      for (const state of states.values()) {
        if (state.graceUntil !== null && state.graceUntil <= at) state.graceUntil = null;
      }
      schedule();
      notify();
    }, Math.max(0, next - clock.now()));
  };

  return {
    observe(rows, now = clock.now()) {
      let changed = false;
      const present = new Set<string>();
      for (const { key, status } of rows) {
        if (present.has(key)) continue;
        present.add(key);
        const previous = states.get(key);
        if (previous === undefined) {
          states.set(key, { status, graceUntil: null, returnedAt: status === 'blocked' ? now : null, activeSince: null });
          changed = true;
          continue;
        }
        if (previous.status === status) {
          if (previous.graceUntil !== null && previous.graceUntil <= now) {
            previous.graceUntil = null;
            changed = true;
          }
          continue;
        }
        changed = true;
        const inGrace = previous.graceUntil !== null && previous.graceUntil > now;
        const next: RowState = { ...previous, status };
        if (status === 'working') {
          // A run that carries on within the grace is the same stretch of work.
          if (!inGrace) next.activeSince = now;
          next.graceUntil = null;
        } else if (status === 'blocked') {
          next.returnedAt = now;
          next.activeSince = now;
          next.graceUntil = null;
        } else if (previous.status === 'working') {
          next.returnedAt = now;
          next.graceUntil = now + WORKING_EXIT_GRACE_MS;
        }
        states.set(key, next);
      }
      for (const key of [...states.keys()]) {
        if (!present.has(key)) {
          states.delete(key);
          changed = true;
        }
      }
      if (!changed) return;
      schedule();
      notify();
    },
    returnedAt: (key) => states.get(key)?.returnedAt ?? null,
    activeSince: (key) => states.get(key)?.activeSince ?? null,
    isWorking(key, status, now) {
      if (status === 'working') return true;
      // Asking is never held back: it needs you.
      if (status === 'blocked') return false;
      const state = states.get(key);
      if (state === undefined) return false;
      // Not yet observed leaving: the poll that saw it stop is about to.
      if (state.status === 'working') return true;
      return state.graceUntil !== null && state.graceUntil > now;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => version,
    reset() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      states.clear();
      notify();
    },
  };
}

/** The app's one tracker, shared by every mount of the chats list. */
export const inboxReturns = createReturnTracker();
