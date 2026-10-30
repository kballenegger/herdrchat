import type * as SQLite from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { publishMutedChats } from '@/features/notifications/mutedChats';
import { activePref, prefSource, type ChatPref, type ChatPrefChange, type PrefRef } from '@/lib/chatPrefs';
import { NO_INBOX_PREF, type InboxPref } from '@/lib/inbox/inbox';
import { errorText } from '@/lib/herdr/protocol';
import { haptics } from '@/components/haptics';
import { resolveConnection, type ServerConnection } from '@/state/connections';
import { loadChatPrefs, restoreChatPref, saveChatPref } from '@/state/db';
import { inboxClock } from '@/state/inboxClock';
import { agentPrefRow } from './agentRows';
import { paneChats } from './chatGroups';
import { rowKey, type ListedChat } from './listedChat';

/**
 * Pinned, muted, settled and snoozed chats on the listed hosts, and the
 * changes to each.
 *
 * Both need the chat's session: a pin or mute belongs to a conversation, and
 * herdr hands its workspace slot to the next one (see `chatPrefs`). A chat
 * whose agent has not reported a session yet offers neither.
 *
 * The list holds the chats of every saved host, whose workspace ids repeat
 * each other's, so prefs are loaded and saved under each row's own connection
 * and `pinnedAt` is filed by `rowKey`.
 *
 * A row may name a chat other than its workspace's (`PrefRow.chatKey`): an
 * agent's row in the Agents view pins and mutes that agent's chat, filed
 * under its `chatKey` (`w6/w6:p2`) with its own session. A one-agent
 * workspace's agent row names the workspace chat, so a pin made in either
 * view is the same pin. An agent of several is also pinned and muted by what
 * it inherits (`PrefRow.inherits`, `prefSource`): its workspace's card, and
 * the pref it got while it was the workspace's only agent. Its row in Spaces
 * (`PaneRow`) is the same `PrefRow` as its row in Agents (`agentPrefRow`), so
 * the two views always agree about an agent. `pinnedAt` files those by the
 * same key the Agents view groups by (`agentRowKey`).
 *
 * Settling and snoozing go the other way for such an agent: they are its
 * workspace's (`PrefRow.inboxRef`, the card's pref), because Spaces lists the
 * agent under its card, in the card's section, and an agent settled on its
 * own would still be listed in the inbox there. So a settle or snooze made
 * on the card holds each of its agents in Agents, and one made on an agent in
 * Agents holds its card and its siblings in both views.
 */
export function useChatPrefs(
  db: SQLite.SQLiteDatabase,
  connection: ServerConnection | null,
  summaries: readonly ListedChat[],
  /** Every listed host's id: whose prefs to load. */
  connectionIds: readonly string[] = connection === null ? [] : [connection.id]
): {
  pinnedAt: ReadonlyMap<string, number>;
  isPinned: (summary: PrefRow) => boolean;
  isMuted: (summary: PrefRow) => boolean;
  /** Whether muting means anything for this row: only the host's own chats notify. */
  canMute: (summary: PrefRow) => boolean;
  togglePin: (summary: PrefRow) => void;
  toggleMute: (summary: PrefRow) => void;
  /**
   * A row's inbox choices in force: its own pref's settle and snooze, and the
   * pin that pins it, its own or one it inherits (`prefSource`).
   */
  inboxPrefOf: (summary: PrefRow) => InboxPref;
  /**
   * Change the inbox choices on a row's own pref, unpinning whatever pins it
   * when `unpin` is set (settling or snoozing a pinned chat unpins it), and
   * resolve with what it was, for Undo. Null when the row has no session to
   * file a pref under.
   */
  changeInbox: (summary: PrefRow, change: InboxWrite, options?: { unpin?: boolean }) => Promise<PrefSnapshot | null>;
  /** Put back what `changeInbox` changed, exactly. */
  restore: (snapshot: PrefSnapshot) => Promise<void>;
  /**
   * Whether a host's prefs have been read from the database. Until then
   * every row reads as unpinned, unsettled and unsnoozed, which is not what
   * is stored: the inbox's rules must not act on it.
   */
  isLoaded: (connectionId: string) => boolean;
  /**
   * Whether a row's inbox choices are its own pref's. An agent of several is
   * settled and snoozed with its workspace (`inboxRef`), whose card's row
   * the rules act on.
   */
  ownsInbox: (summary: PrefRow) => boolean;
  /** A mute saved here that could not reach the host. */
  error: string | null;
  clearError: () => void;
} {
  const [prefs, setPrefs] = useState<ReadonlyMap<string, ReadonlyMap<string, ChatPref>>>(new Map());
  const [error, setError] = useState<string | null>(null);
  // A string, so a list rebuilt with the same ids does not reload.
  const idsKey = connectionIds.join('\n');

  const reload = useCallback(async () => {
    if (idsKey === '') return;
    setPrefs(await loadAll(db, idsKey.split('\n')));
  }, [db, idsKey]);

  // On a host switch, and on coming back to the list (the iPad sidebar stays
  // focused, which is why both).
  useEffect(() => {
    if (idsKey === '') return;
    let alive = true;
    void loadAll(db, idsKey.split('\n')).then((next) => {
      if (alive) setPrefs(next);
    });
    return () => {
      alive = false;
    };
  }, [db, idsKey]);
  useFocusEffect(useCallback(() => void reload(), [reload]));

  /** The pref that pins, or mutes, a row: its own or one it inherits. */
  const sourceOf = useCallback(
    (summary: PrefRow, choice: 'pin' | 'mute'): PrefRef | null =>
      prefSource(prefs.get(summary.connectionId) ?? NO_PREFS, refsOf(summary), choice),
    [prefs]
  );
  const pinOf = useCallback(
    (summary: PrefRow): number | null => {
      const source = sourceOf(summary, 'pin');
      return source === null ? null : prefs.get(summary.connectionId)?.get(source.key)?.pinnedAt ?? null;
    },
    [prefs, sourceOf]
  );

  const pinnedAt = useMemo(() => {
    const order = new Map<string, number>();
    const file = (summary: PrefRow) => {
      const at = pinOf(summary);
      if (at !== null) order.set(rowKey({ connectionId: summary.connectionId, workspaceId: prefKey(summary) }), at);
    };
    for (const summary of summaries) {
      file(summary);
      // Each agent of a workspace that runs several, as its row in the
      // Agents view is filed.
      for (const pane of paneChats(summary)) file(agentPrefRow(summary, pane));
    }
    return order;
  }, [summaries, pinOf]);

  const togglePin = useCallback(
    (summary: PrefRow) => {
      if (summary.sessionSig === null) return;
      haptics.selection();
      // Unpinning clears whatever pins the row, which may be its workspace.
      const source = sourceOf(summary, 'pin');
      const target = source ?? { key: prefKey(summary), sessionSig: summary.sessionSig };
      if (target.sessionSig === null) return;
      void saveChatPref(db, summary.connectionId, target.key, target.sessionSig, {
        pinnedAt: source === null ? Date.now() : null,
      }).then(reload);
    },
    [db, sourceOf, reload]
  );

  // Each row's own host is told, whose notifier sends its pushes.
  const canMute = useCallback((summary: PrefRow) => resolveConnection(summary.connectionId) !== null, []);

  const toggleMute = useCallback(
    (summary: PrefRow) => {
      const host = resolveConnection(summary.connectionId);
      if (host === null || summary.sessionSig === null) return;
      haptics.selection();
      // Unmuting clears whatever silences the row: muted from its workspace's
      // card, the host is quiet about every agent in it, and an "Unmute" that
      // left that mute in place would change nothing the person can hear.
      const source = sourceOf(summary, 'mute');
      const target = source ?? { key: prefKey(summary), sessionSig: summary.sessionSig };
      if (target.sessionSig === null) return;
      void saveChatPref(db, host.id, target.key, target.sessionSig, { muted: source === null })
        .then(reload)
        .then(() => publishMutedChats(db, host))
        .catch((thrown: unknown) => setError(`Couldn't update notifications on ${host.name}. ${errorText(thrown)}`));
    },
    [db, sourceOf, reload]
  );

  const inboxPrefOf = useCallback(
    (summary: PrefRow): InboxPref => inboxPrefIn(prefs.get(summary.connectionId) ?? NO_PREFS, summary),
    [prefs]
  );

  const changeInbox = useCallback(
    async (summary: PrefRow, write: InboxWrite, options: { unpin?: boolean } = {}): Promise<PrefSnapshot | null> => {
      const own = inboxRefOf(summary);
      if (own.sessionSig === null) return null;
      // From the database rather than the loaded map: a write a moment ago
      // (an Undo, a rule) may not have reloaded yet, and a rule decided on
      // a map that had not loaded at all must be decided again on what is
      // really stored.
      const stored = await loadChatPrefs(db, summary.connectionId);
      const change = typeof write === 'function' ? write(inboxPrefIn(stored, summary)) : write;
      if (change === null) return null;
      const pin = options.unpin === true ? prefSource(stored, refsOf(summary), 'pin') : null;
      const keys = [...new Set([own.key, ...(pin === null ? [] : [pin.key])])];
      const snapshot: PrefSnapshot = { connectionId: summary.connectionId, prefs: keys.map((key) => ({ key, pref: stored.get(key) ?? null })) };
      if (pin !== null && pin.key !== own.key && pin.sessionSig !== null) {
        await saveChatPref(db, summary.connectionId, pin.key, pin.sessionSig, { pinnedAt: null });
      }
      await saveChatPref(db, summary.connectionId, own.key, own.sessionSig, pin !== null && pin.key === own.key ? { ...change, pinnedAt: null } : change);
      await reload();
      inboxClock.touch();
      return snapshot;
    },
    [db, reload]
  );

  const restore = useCallback(
    async (snapshot: PrefSnapshot) => {
      for (const { key, pref } of snapshot.prefs) await restoreChatPref(db, snapshot.connectionId, key, pref);
      await reload();
      inboxClock.touch();
    },
    [db, reload]
  );

  return {
    pinnedAt,
    inboxPrefOf,
    changeInbox,
    restore,
    isLoaded: useCallback((connectionId: string) => prefs.has(connectionId), [prefs]),
    ownsInbox: useCallback((summary: PrefRow) => summary.inboxRef === undefined, []),
    isPinned: (summary) => sourceOf(summary, 'pin') !== null,
    isMuted: (summary) => canMute(summary) && sourceOf(summary, 'mute') !== null,
    canMute,
    togglePin,
    toggleMute,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}

const NO_PREFS: ReadonlyMap<string, ChatPref> = new Map();

/** The stored prefs a change touched, as they were: what Undo writes back. */
export interface PrefSnapshot {
  connectionId: string;
  prefs: readonly { key: string; pref: ChatPref | null }[];
}

/**
 * A change to a row's inbox choices, or a function that decides it from the
 * stored choices at the moment of writing (null: nothing to write).
 */
export type InboxWrite = ChatPrefChange | ((stored: InboxPref) => ChatPrefChange | null);

/**
 * A row's inbox choices in a host's prefs: the settle and snooze of the pref
 * they are filed on (`inboxRefOf`), and the pin that pins it, its own or one
 * it inherits (`prefSource`).
 */
function inboxPrefIn(prefs: ReadonlyMap<string, ChatPref>, summary: PrefRow): InboxPref {
  const ref = inboxRefOf(summary);
  const filed = activePref(prefs, ref.key, ref.sessionSig);
  const pin = prefSource(prefs, refsOf(summary), 'pin');
  const pinnedAt = pin === null ? null : prefs.get(pin.key)?.pinnedAt ?? null;
  return { ...NO_INBOX_PREF, ...(filed === null ? {} : inboxPart(filed)), pinnedAt };
}

/** Where a row's settle and snooze are filed: its workspace card's for an agent of several, else its own. */
function inboxRefOf(summary: PrefRow): PrefRef {
  return summary.inboxRef ?? { key: prefKey(summary), sessionSig: summary.sessionSig };
}

/** A pref's inbox choices, without its pin (which may be inherited) or session. */
function inboxPart(pref: ChatPref): Omit<InboxPref, 'pinnedAt'> {
  return {
    settledAt: pref.settledAt,
    settledReason: pref.settledReason,
    unsettledAt: pref.unsettledAt,
    snoozedUntil: pref.snoozedUntil,
    snoozedAt: pref.snoozedAt,
    autoSettle: pref.autoSettle,
  };
}

/**
 * What a pin or mute is made on: a row's connection, its session, and the
 * chat it names, the workspace's unless `chatKey` says otherwise. `inherits`
 * lists the prefs that also pin or mute it, after its own (`agentPrefRow`).
 */
export type PrefRow = Pick<ListedChat, 'connectionId' | 'workspaceId' | 'sessionSig'> & {
  chatKey?: string;
  inherits?: readonly PrefRef[];
  /** Where it is settled and snoozed, when not on its own pref (`agentPrefRow`). */
  inboxRef?: PrefRef;
};

/** The key a row's pref is filed under: its `chatKey`, or its workspace's. */
function prefKey(summary: PrefRow): string {
  return summary.chatKey ?? summary.workspaceId;
}

/** Every pref that can pin or mute a row, its own first. */
function refsOf(summary: PrefRow): PrefRef[] {
  return [{ key: prefKey(summary), sessionSig: summary.sessionSig }, ...(summary.inherits ?? [])];
}

async function loadAll(
  db: SQLite.SQLiteDatabase,
  connectionIds: readonly string[]
): Promise<Map<string, ReadonlyMap<string, ChatPref>>> {
  const loaded = await Promise.all(connectionIds.map(async (id) => [id, await loadChatPrefs(db, id)] as const));
  return new Map(loaded);
}
