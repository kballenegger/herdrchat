import { isSnoozed, wokeAt, type InboxFacts } from './inbox';

/** "Settle untouched chats": off, or after this many days. */
export const SETTLE_AFTER_DAYS = [0, 1, 3, 7, 14] as const;
export type SettleAfterDays = (typeof SETTLE_AFTER_DAYS)[number];
export const DEFAULT_SETTLE_AFTER_DAYS: SettleAfterDays = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isSettleAfterDays(value: unknown): value is SettleAfterDays {
  return (SETTLE_AFTER_DAYS as readonly unknown[]).includes(value);
}

/** A stored value back to a setting; anything else is the default. */
export function decodeSettleAfterDays(value: string | null): SettleAfterDays {
  if (value === null || value.trim() === '') return DEFAULT_SETTLE_AFTER_DAYS;
  const parsed = Number(value);
  return isSettleAfterDays(parsed) ? parsed : DEFAULT_SETTLE_AFTER_DAYS;
}

/** The setting's words, as its picker and its row say them. */
export function settleAfterLabel(days: SettleAfterDays): string {
  switch (days) {
    case 0: return 'Off';
    case 1: return 'After 1 day';
    case 7: return 'After a week';
    case 14: return 'After two weeks';
    default: return `After ${days} days`;
  }
}

/** When a chat was last touched: its last message, a return, coming off the shelf, a wake. */
export function lastActivity(facts: InboxFacts, now: number): number {
  return Math.max(facts.preview?.timestamp ?? 0, facts.returnedAt ?? 0, facts.pref.unsettledAt ?? 0, wokeAt(facts, now) ?? 0);
}

/**
 * Whether a chat should be settled for being untouched, now: the setting is
 * on, the chat is in the inbox (not pinned, snoozed or settled), it was not
 * told to stay (`autoSettle` off), it is not working or asking, and nothing
 * has happened to it for the setting's number of days. A chat with no time to
 * go by at all is left alone: "untouched since never" is not a time.
 */
export function shouldAutoSettle(facts: InboxFacts, settleAfterDays: SettleAfterDays, now: number): boolean {
  if (settleAfterDays === 0) return false;
  const { pref } = facts;
  if (pref.pinnedAt !== null || pref.settledAt !== null || !pref.autoSettle) return false;
  if (isSnoozed(facts, now)) return false;
  if (facts.status === 'working' || facts.status === 'blocked' || facts.working) return false;
  const last = lastActivity(facts, now);
  return last > 0 && now - last > settleAfterDays * DAY_MS;
}
