import { shouldAutoSettle, type SettleAfterDays } from './autoSettle';
import { settledActivity, type InboxFacts, type InboxPref } from './inbox';

/**
 * The time to stamp an inbox choice with: now by the phone, or the chat's
 * last message by the host's clock if that is later.
 *
 * A settle is undone by an agent message newer than it (`settledActivity`),
 * and that message's time comes from the host. With the host's clock ahead
 * of the phone's, a settle stamped with the phone's time alone could be
 * older than the very message it was settled after, and the chat would come
 * straight back, again on every retry, until the phone caught up.
 */
export function stampAt(now: number, preview: { timestamp: number | null } | null): number {
  return Math.max(now, preview?.timestamp ?? 0);
}

/** A change to one chat's pref, as `saveChatPref` takes it. */
export type InboxChange = Partial<Omit<InboxPref, 'pinnedAt'>>;

/**
 * What the inbox does to a chat by itself, now, or null for nothing:
 *
 * - a settled chat that something happened to since comes off the shelf, at
 *   the top of the inbox (`unsettledAt`);
 * - a snoozed chat that started asking wakes, at the moment it woke
 *   (`snoozedUntil`), which a finished run never does;
 * - a chat untouched for the setting's days settles, said to be `auto`,
 *   unless `allowAutoSettle` is false (the list is being searched or swiped,
 *   or the host is the Demo, whose transcripts are frozen in the past).
 *
 * Each is written only when the stored pref differs, so applying the answer
 * and asking again answers null: no loops.
 */
export function inboxRule(
  facts: InboxFacts,
  now: number,
  options: { settleAfterDays: SettleAfterDays; allowAutoSettle: boolean }
): InboxChange | null {
  const { pref } = facts;
  if (pref.settledAt !== null && settledActivity(facts)) {
    return { settledAt: null, settledReason: null, unsettledAt: stampAt(now, facts.preview) };
  }
  if (pref.snoozedUntil !== null && pref.snoozedUntil > now && facts.status === 'blocked') {
    return { snoozedUntil: now };
  }
  if (options.allowAutoSettle && shouldAutoSettle(facts, options.settleAfterDays, now)) {
    return { settledAt: stampAt(now, facts.preview), settledReason: 'auto' };
  }
  return null;
}
