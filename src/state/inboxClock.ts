import { useSyncExternalStore } from 'react';

import { inboxReturns } from '@/lib/inbox/returnTracker';
import { inbox } from '@/theme/tokens';

/**
 * The time the inbox is laid out at. Read during render, so it is a store, not
 * `Date.now()`: it moves on a tick while the list is on screen (a snooze that
 * ended comes back, wake labels count down), when the return tracker's grace
 * ends, and when a pref is written (`touch`), so a chat woken a moment ago is
 * not still snoozed by a clock from before.
 */
let current = Date.now();
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

function touch(): void {
  current = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (ticker === null) ticker = setInterval(touch, inbox.clockTick);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

inboxReturns.subscribe(touch);

export const inboxClock = { subscribe, now: () => current, touch };

/** The inbox's time, re-rendering when it moves. */
export function useInboxClock(): number {
  return useSyncExternalStore(subscribe, inboxClock.now);
}
