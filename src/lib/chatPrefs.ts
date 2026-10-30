import { NO_INBOX_PREF, type InboxPref } from './inbox/inbox';

/**
 * Pinned, muted, settled and snoozed chats: choices made on this phone about
 * one conversation (`inbox/inbox.ts` for the last two).
 *
 * Kept per workspace but stamped with the session, like read markers: herdr
 * reuses workspace slots, and a new chat landing in a pinned or muted slot
 * must not inherit either. A pref whose session no longer matches is simply
 * not in force; it is replaced the next time that slot is pinned or muted.
 */

export interface ChatPref extends InboxPref {
  /** `sessionSignature` of the chat when the choice was made. */
  sessionSig: string;
  muted: boolean;
}

/** A pref with nothing chosen, for a session: what a row with no stored pref is. */
export function emptyPref(sessionSig: string): ChatPref {
  return { ...NO_INBOX_PREF, sessionSig, muted: false };
}

/** Whether a pref chooses nothing, so its row can go. */
export function isEmptyPref(pref: Omit<ChatPref, 'sessionSig'>): boolean {
  return pref.pinnedAt === null && !pref.muted && pref.settledAt === null && pref.unsettledAt === null &&
    pref.snoozedUntil === null && pref.snoozedAt === null && pref.autoSettle;
}

/** A change to a pref: any of its choices. */
export type ChatPrefChange = Partial<Omit<ChatPref, 'sessionSig'>>;

/**
 * A pref with a change made: on the stored pref when it is for the same
 * session, on an empty one when it was left by an earlier chat in the slot,
 * whose other choices do not carry over.
 */
export function applyPrefChange(current: ChatPref | undefined, sessionSig: string, change: ChatPrefChange): ChatPref {
  const base = current !== undefined && current.sessionSig === sessionSig ? current : emptyPref(sessionSig);
  const next: ChatPref = { ...base };
  for (const [key, value] of Object.entries(change) as [keyof ChatPrefChange, unknown][]) {
    if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
  }
  return next;
}

/** A `chat_prefs` row as SQLite hands it back. */
export interface ChatPrefRow {
  workspace_id: string;
  session_sig: string;
  pinned_at: number | null;
  muted: number;
  /** Null on a row read before the inbox's columns were added (never, once migrated). */
  settled_at: number | null;
  settled_reason: string | null;
  unsettled_at: number | null;
  snoozed_until: number | null;
  snoozed_at: number | null;
  auto_settle: number | null;
}

/** A stored row to a pref. An unknown reason is the person's: they settled it. */
export function decodeChatPrefRow(row: ChatPrefRow): ChatPref {
  // `?? null`: a row selected without a column (or a driver that leaves a
  // NULL out) reads as nothing chosen.
  const settledAt = row.settled_at ?? null;
  return {
    sessionSig: row.session_sig,
    pinnedAt: row.pinned_at ?? null,
    muted: row.muted === 1,
    settledAt,
    settledReason: settledAt === null ? null : row.settled_reason === 'auto' ? 'auto' : 'user',
    unsettledAt: row.unsettled_at ?? null,
    snoozedUntil: row.snoozed_until ?? null,
    snoozedAt: row.snoozed_at ?? null,
    autoSettle: row.auto_settle !== 0,
  };
}

/** A pref to the row's values, as `restoreChatPref` writes them. */
export function encodeChatPrefRow(pref: ChatPref): Omit<ChatPrefRow, 'workspace_id' | 'auto_settle'> & { auto_settle: number } {
  return {
    session_sig: pref.sessionSig,
    pinned_at: pref.pinnedAt,
    muted: pref.muted ? 1 : 0,
    settled_at: pref.settledAt,
    settled_reason: pref.settledAt === null ? null : pref.settledReason ?? 'user',
    unsettled_at: pref.unsettledAt,
    snoozed_until: pref.snoozedUntil,
    snoozed_at: pref.snoozedAt,
    auto_settle: pref.autoSettle ? 1 : 0,
  };
}

/** The pref in force for a chat, or null. A chat with no session id yet has none. */
export function activePref(
  prefs: ReadonlyMap<string, ChatPref>,
  workspaceId: string,
  sessionSig: string | null
): ChatPref | null {
  if (sessionSig === null) return null;
  const pref = prefs.get(workspaceId);
  return pref !== undefined && pref.sessionSig === sessionSig ? pref : null;
}

/**
 * The agent session ids the host's watcher should stay quiet about.
 *
 * The watcher sees raw session values (`agent_session.value`), while a
 * signature joins every agent's and marks Codex ones (`codex:<id>`) and Pi or
 * OMP ones (`pi:` / `omp:<kind>:<encoded value>`, often a path), so this undoes them. Muting by session rather than workspace is what keeps a later chat in
 * the same slot audible.
 */
export function mutedSessionIds(prefs: Iterable<ChatPref>): string[] {
  const ids = new Set<string>();
  for (const pref of prefs) {
    if (!pref.muted) continue;
    for (const part of pref.sessionSig.split(',')) {
      const id = rawSessionValue(part);
      if (id.length > 0) ids.add(id);
    }
  }
  return [...ids].sort();
}

/** One part of a session signature back to herdr's `agent_session.value`. */
function rawSessionValue(part: string): string {
  if (part.startsWith('codex:')) return part.slice('codex:'.length);
  const journal = /^(?:pi|omp):[a-z]+:(.*)$/.exec(part);
  if (journal === null) return part;
  try {
    return decodeURIComponent(journal[1] ?? '');
  } catch {
    return '';
  }
}

/** Where a pin or mute can be filed: a chat key, and the session it is for. */
export interface PrefRef {
  key: string;
  sessionSig: string | null;
}

/**
 * Which of a row's prefs puts a pin or a mute in force on it, or null.
 *
 * A row is pinned or muted by its own pref first (`refs[0]`), and then by any
 * it inherits: an agent of a workspace that runs several is also pinned by its
 * workspace's card, and keeps the pin it got while it was the workspace's only
 * agent (filed under the workspace with its own session). Without that, a pin
 * made on the card did not show on the agent's row in the other view, and an
 * agent's pin vanished from its row the moment a second agent started beside
 * it, while the host went on muting it.
 *
 * The answer is also what undoing acts on: unpinning a row clears the pref
 * that pins it, so a row never offers "Unpin" and then stays pinned.
 */
export function prefSource(
  prefs: ReadonlyMap<string, ChatPref>,
  refs: readonly PrefRef[],
  choice: 'pin' | 'mute'
): PrefRef | null {
  for (const ref of refs) {
    const pref = activePref(prefs, ref.key, ref.sessionSig);
    if (pref === null) continue;
    if (choice === 'pin' ? pref.pinnedAt !== null : pref.muted) return ref;
  }
  return null;
}
