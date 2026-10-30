import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { activeRead } from '@/lib/unread';
import { inboxRule } from '@/lib/inbox/rules';
import { inboxReturns, type TrackedRow } from '@/lib/inbox/returnTracker';
import { isDemo } from '@/state/connections';
import { useInboxClock } from '@/state/inboxClock';
import { useInboxShelves } from '@/state/inboxShelves';
import { useSettings } from '@/state/settings';
import { useSwipeActivity } from '@/state/swipeActivity';
import { agentRowKey, agentRows, isAgentRow } from './agentRows';
import { chatFacts, type InboxContext } from './chatGroups';
import { readsOf, rowKey, type ListedChat, type ReadsByConnection } from './listedChat';
import type { PrefRow, useChatPrefs } from './useChatPrefs';

/**
 * The inbox around the chats list (`src/lib/inbox`): what each row's facts
 * are, the shelves' state and the time, for `groupChats`; and the rules that
 * move chats by themselves, applied on each poll.
 *
 * Both views' rows are tracked and ruled on, whichever is showing: a chat
 * settled in Agents comes off the shelf when it starts working while Spaces
 * is up, and switching views does not make the tracker forget every row.
 */
export function useInbox({ summaries, prefs, reads, searching }: {
  summaries: readonly ListedChat[];
  prefs: ReturnType<typeof useChatPrefs>;
  reads: ReadsByConnection;
  /** Nothing settles by itself while the list is being searched. */
  searching: boolean;
}): InboxContext<ListedChat> {
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

  const { inboxPrefOf, changeInbox } = prefs;
  const facts = useCallback(
    (summary: ListedChat, key: string) => {
      const ref = summary as PrefRow;
      const read = summary.sessionSig === null ? null
        : activeRead(readsOf(reads, summary), ref.chatKey ?? summary.workspaceId, summary.sessionSig);
      return chatFacts(summary, {
        pref: inboxPrefOf(ref),
        openedAt: read?.openedAt ?? null,
        returnedAt: inboxReturns.returnedAt(key),
        activeSince: inboxReturns.activeSince(key),
        working: inboxReturns.isWorking(key, summary.status, now),
      });
    },
    // `tracked` stands for the tracker's state, which `facts` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reads, inboxPrefOf, now, tracked]
  );

  // The rules: a settled chat that something happened to comes off the
  // shelf, a snoozed one that asks wakes, an untouched one settles. One pass
  // at a time; each writes only what differs, so a pass after it is a no-op.
  const running = useRef(false);
  useEffect(() => {
    if (running.current) return;
    const writes = rows.flatMap((row) => {
      if (row.summary.sessionSig === null) return [];
      const change = inboxRule(facts(row.summary, row.key), now, {
        settleAfterDays,
        // The Demo's transcripts are frozen in the past: every chat in it
        // would settle on the first launch.
        allowAutoSettle: !searching && !swiping && !isDemo(row.summary.connectionId),
      });
      return change === null ? [] : [{ row, change }];
    });
    if (writes.length === 0) return;
    running.current = true;
    void (async () => {
      try {
        for (const { row, change } of writes) await changeInbox(row.summary as PrefRow, change);
      } finally {
        running.current = false;
      }
    })();
  }, [rows, facts, now, settleAfterDays, searching, swiping, changeInbox]);

  return useMemo(
    () => ({ now, hideWorking, shelves: { expanded, settledPages }, facts }),
    [now, hideWorking, expanded, settledPages, facts]
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
