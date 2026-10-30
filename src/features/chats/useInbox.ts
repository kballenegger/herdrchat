import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import type { InboxPref } from '@/lib/inbox/inbox';
import { inboxRule } from '@/lib/inbox/rules';
import { inboxReturns, type TrackedRow } from '@/lib/inbox/returnTracker';
import { isDemo } from '@/state/connections';
import { useInboxClock } from '@/state/inboxClock';
import { useInboxShelves } from '@/state/inboxShelves';
import { useSettings } from '@/state/settings';
import { useSwipeActivity } from '@/state/swipeActivity';
import { agentRowKey, agentRows, isAgentRow } from './agentRows';
import { chatFacts, type InboxContext } from './chatGroups';
import { rowOpenedAt } from './chatUnread';
import { openFor, readsOf, rowKey, type ListedChat, type OpenChat, type ReadsByConnection } from './listedChat';
import type { PrefRow, useChatPrefs } from './useChatPrefs';

/**
 * The inbox around the chats list (`src/lib/inbox`): what each row's facts
 * are, the shelves' state and the time, for `groupChats`; and the rules that
 * move chats by themselves, applied on each poll.
 *
 * Both views' rows are tracked and ruled on, whichever is showing: a chat
 * settled in Agents comes off the shelf when it starts working while Spaces
 * is up, and switching views does not make the tracker forget every row.
 *
 * All of it only while the setting `inbox` is on. Off, the list is grouped
 * as it always was, and nothing is written: a chat settled or snoozed before
 * stays so in the database, and shows so again when the setting is back on.
 */
export function useInbox({ summaries, prefs, reads, open, searching }: {
  summaries: readonly ListedChat[];
  prefs: ReturnType<typeof useChatPrefs>;
  reads: ReadsByConnection;
  /** The chat on screen beside the list (iPad): being read, so not "Woke". */
  open: OpenChat | null;
  /** Nothing settles by itself while the list is being searched. */
  searching: boolean;
}): InboxContext<ListedChat> {
  const enabled = useSettings((state) => state.inbox);
  const hideWorking = useSettings((state) => state.hideWorking);
  const settleAfterDays = useSettings((state) => state.settleAfterDays);
  const expanded = useInboxShelves((state) => state.expanded);
  const settledPages = useInboxShelves((state) => state.settledPages);
  const swiping = useSwipeActivity((state) => state.rows.size > 0);
  const now = useInboxClock();
  // Re-rendered when the tracker sees a change or a grace ends.
  const tracked = useSyncExternalStore(inboxReturns.subscribe, inboxReturns.getSnapshot);

  const rows = useMemo(() => inboxRows(summaries), [summaries]);
  useEffect(() => {
    inboxReturns.observe(rows.map((row): TrackedRow => ({ key: row.key, status: row.summary.status })));
  }, [rows]);

  const { inboxPrefOf, changeInbox, isLoaded, ownsInbox } = prefs;
  const facts = useCallback(
    (summary: ListedChat, key: string) => {
      const ref = summary as PrefRow;
      return chatFacts(summary, {
        pref: inboxPrefOf(ref),
        openedAt: rowOpenedAt(ref, readsOf(reads, summary), openFor(open, summary), now),
        returnedAt: inboxReturns.returnedAt(key),
        activeSince: inboxReturns.activeSince(key),
        working: inboxReturns.isWorking(key, summary.status, now),
      });
    },
    // `tracked` stands for the tracker's state, which `facts` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reads, open, inboxPrefOf, now, tracked]
  );

  // The rules: a settled chat that something happened to comes off the
  // shelf, a snoozed one that asks wakes, an untouched one settles. One pass
  // at a time; each writes only what differs, so a pass after it is a no-op.
  //
  // Only on a host whose prefs have loaded: before that every chat reads as
  // unpinned and unsettled, and an old pinned or snoozed one would be
  // settled over what is stored. The write decides again on the stored pref
  // (`changeInbox` with a function), for a load that lands in between.
  //
  // An agent of several is settled and snoozed with its workspace
  // (`ownsInbox`): its card's row is the one ruled on, by the workspace's
  // status and newest line. Ruled on by each agent, the idle one would
  // settle the workspace while its sibling works.
  const running = useRef(false);
  useEffect(() => {
    if (!enabled || running.current) return;
    const writes = rows.flatMap((row) => {
      const ref = row.summary as PrefRow;
      if (row.summary.sessionSig === null || !isLoaded(row.summary.connectionId) || !ownsInbox(ref)) return [];
      const known = facts(row.summary, row.key);
      const options = {
        settleAfterDays,
        // The Demo's transcripts are frozen in the past: every chat in it
        // would settle on the first launch.
        allowAutoSettle: !searching && !swiping && !isDemo(row.summary.connectionId),
      };
      if (inboxRule(known, now, options) === null) return [];
      return [{ ref, decide: (stored: InboxPref) => inboxRule({ ...known, pref: stored }, now, options) }];
    });
    if (writes.length === 0) return;
    running.current = true;
    void (async () => {
      try {
        for (const { ref, decide } of writes) await changeInbox(ref, decide);
      } finally {
        running.current = false;
      }
    })();
  }, [enabled, rows, facts, now, settleAfterDays, searching, swiping, changeInbox, isLoaded, ownsInbox]);

  return useMemo(
    () => ({ enabled, now, hideWorking, shelves: { expanded, settledPages }, facts }),
    [enabled, now, hideWorking, expanded, settledPages, facts]
  );
}

/**
 * Every row either view lists, once each, with its key in its view: each
 * workspace by `rowKey`, each agent by `agentRowKey`. A one-agent workspace
 * is both, under one key and one pref, and counted once.
 */
function inboxRows(summaries: readonly ListedChat[]): { key: string; summary: ListedChat }[] {
  const seen = new Set<string>();
  const out: { key: string; summary: ListedChat }[] = [];
  for (const summary of [...summaries, ...agentRows(summaries)]) {
    const key = isAgentRow(summary) ? agentRowKey(summary) : rowKey(summary);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, summary });
  }
  return out;
}
