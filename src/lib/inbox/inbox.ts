/**
 * The chats list as an inbox, the way T3 Code's sidebar works: every chat you
 * open, you aim to close.
 *
 * You don't archive a chat, you settle it: it moves to a Settled shelf at the
 * bottom and comes back by itself when something happens to it. You snooze a
 * chat that can wait: it hides until a time, or until it raises its hand. A
 * chat that is working waits on a Working shelf and comes back to the top of
 * the inbox when it finishes. Everything else is ordered by when it last came
 * back to you, newest first, not by when you last wrote to it.
 *
 * Pure: the caller hands in each chat's facts (its status, its last message,
 * its pref, its read marker, what the return tracker saw) and gets the
 * sections back. Nothing here is stored as a flag: "woke" and "settled until
 * something happened" are comparisons of times the app already keeps, in the
 * style of `unread.ts`.
 */

/** herdr's `AgentStatus`, restated so this module imports nothing. */
export type InboxStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

/** What settled a chat: a person, or the "settle untouched chats" setting. */
export type SettledReason = 'user' | 'auto';

/** A chat's inbox choices, as stored in `chat_prefs` (`ChatPref`). */
export interface InboxPref {
  /** When it was pinned, which orders Pinned; null when not pinned. */
  pinnedAt: number | null;
  /** When it was settled; null when it is not. */
  settledAt: number | null;
  settledReason: SettledReason | null;
  /** When it last came off the Settled shelf, which returns it to the top. */
  unsettledAt: number | null;
  /**
   * When a snooze ends. Kept after it has passed: a snooze that ended is when
   * the chat woke, which orders it and marks it until it is opened. Waking a
   * chat early writes the moment it woke here.
   */
  snoozedUntil: number | null;
  /** When it was snoozed: only what happens after this wakes it. */
  snoozedAt: number | null;
  /** Off: the chat is never settled for being untouched. */
  autoSettle: boolean;
}

export const NO_INBOX_PREF: InboxPref = {
  pinnedAt: null,
  settledAt: null,
  settledReason: null,
  unsettledAt: null,
  snoozedUntil: null,
  snoozedAt: null,
  autoSettle: true,
};

/** Everything the layout needs to know about one chat. */
export interface InboxFacts {
  status: InboxStatus;
  /** Its last message: when, and whether you wrote it. */
  preview: { timestamp: number | null; fromUser: boolean } | null;
  /** The pref in force for it (`NO_INBOX_PREF` when none is). */
  pref: InboxPref;
  /** When its thread was last opened, by the read marker in force; null if never. */
  openedAt: number | null;
  /** When the return tracker last saw it come back (leave working, or ask). */
  returnedAt: number | null;
  /** When the return tracker last saw it start working or asking. */
  activeSince: number | null;
  /** Working by the return tracker, which holds a finished run for a grace. */
  working: boolean;
  /**
   * Whether it may wait on the Working shelf. A space card does not: it
   * stands for a workspace with other agents and terminals under it, which
   * would hide with it.
   */
  canHide: boolean;
}

export type InboxSection = 'pinned' | 'inbox' | 'working' | 'snoozed' | 'settled';

/** The Settled shelf shows this many rows, then "Show N more" a page at a time. */
export const SETTLED_PAGE = 20;

/**
 * Whether something happened to a settled chat after it was settled: it
 * started working or asking (someone drove it from the terminal), or the agent
 * wrote. Such a chat comes off the shelf by itself.
 */
export function settledActivity(facts: Pick<InboxFacts, 'status' | 'preview' | 'pref' | 'activeSince'>): boolean {
  const { settledAt } = facts.pref;
  if (settledAt === null) return false;
  const active = facts.status === 'working' || facts.status === 'blocked';
  if (active && facts.activeSince !== null && facts.activeSince > settledAt) return true;
  const preview = facts.preview;
  return preview !== null && !preview.fromUser && preview.timestamp !== null && preview.timestamp > settledAt;
}

/** On the Settled shelf. */
export function isSettled(facts: Pick<InboxFacts, 'status' | 'preview' | 'pref' | 'activeSince'>): boolean {
  return facts.pref.settledAt !== null && !settledActivity(facts);
}

/**
 * On the Snoozed shelf: its snooze has not ended, and it has not raised its
 * hand. A chat can't be snoozed while it asks (`canSnooze`), so asking now
 * means it asked since. A finished run never wakes it.
 */
export function isSnoozed(facts: Pick<InboxFacts, 'status' | 'pref'>, now: number): boolean {
  const until = facts.pref.snoozedUntil;
  return until !== null && until > now && facts.status !== 'blocked';
}

/**
 * When a snoozed chat woke, or null: its snooze's end once that has passed,
 * or the moment it raised its hand (before the rule that writes it there has
 * run, the tracker's time it started asking).
 */
export function wokeAt(facts: Pick<InboxFacts, 'status' | 'pref' | 'activeSince'>, now: number): number | null {
  const until = facts.pref.snoozedUntil;
  if (until === null) return null;
  if (until <= now) return until;
  return facts.status === 'blocked' ? facts.activeSince ?? now : null;
}

/** Shows "Woke": it woke since its thread was last opened. */
export function showsWoke(facts: Pick<InboxFacts, 'status' | 'pref' | 'activeSince' | 'openedAt'>, now: number): boolean {
  const woke = wokeAt(facts, now);
  return woke !== null && (facts.openedAt === null || facts.openedAt < woke);
}

/**
 * When a chat last came back to you: the latest of what the tracker saw, its
 * last message, coming off the Settled shelf, and waking from a snooze. What
 * the inbox is ordered by, newest first.
 */
export function returnTime(facts: InboxFacts, now: number): number {
  return Math.max(
    facts.returnedAt ?? 0,
    facts.preview?.timestamp ?? 0,
    facts.pref.unsettledAt ?? 0,
    wokeAt(facts, now) ?? 0
  );
}

/** Which section a chat is listed in. */
export function sectionOf(facts: InboxFacts, now: number, hideWorking: boolean): InboxSection {
  // A pin is a pin: it never moves by itself. Settling or snoozing unpins.
  if (facts.pref.pinnedAt !== null) return 'pinned';
  if (isSettled(facts)) return 'settled';
  if (isSnoozed(facts, now)) return 'snoozed';
  if (hideWorking && facts.canHide && facts.working && facts.status !== 'blocked') return 'working';
  return 'inbox';
}

/** One chat in its section. */
export interface InboxRow<T> {
  item: T;
  section: InboxSection;
  /** It woke from a snooze and has not been opened since. */
  woke: boolean;
}

export interface InboxLayout<T> {
  pinned: InboxRow<T>[];
  inbox: InboxRow<T>[];
  working: InboxRow<T>[];
  snoozed: InboxRow<T>[];
  settled: InboxRow<T>[];
}

/**
 * The chats in their sections, each in its order: Pinned in pin order, the
 * inbox and the Working shelf by return time (newest first), Snoozed by when
 * each wakes (soonest first), Settled by when each was settled (newest first).
 * Ties keep the order the chats came in, which is the host's.
 */
export function inboxLayout<T>(
  items: readonly T[],
  factsOf: (item: T) => InboxFacts,
  options: { now: number; hideWorking: boolean }
): InboxLayout<T> {
  const { now, hideWorking } = options;
  const facts = items.map((item) => ({ item, facts: factsOf(item) }));
  const layout: InboxLayout<T> = { pinned: [], inbox: [], working: [], snoozed: [], settled: [] };
  const byKey = new Map<T, InboxFacts>();
  for (const entry of facts) {
    byKey.set(entry.item, entry.facts);
    const section = sectionOf(entry.facts, now, hideWorking);
    layout[section].push({ item: entry.item, section, woke: section !== 'snoozed' && section !== 'settled' && showsWoke(entry.facts, now) });
  }
  const at = (row: InboxRow<T>) => byKey.get(row.item) ?? null;
  const newestFirst = (value: (facts: InboxFacts) => number) => (a: InboxRow<T>, b: InboxRow<T>) => {
    const left = at(a);
    const right = at(b);
    return (right === null ? 0 : value(right)) - (left === null ? 0 : value(left));
  };
  // `Array.prototype.sort` is stable, so a tie keeps the host's order.
  layout.pinned.sort((a, b) => (at(a)?.pref.pinnedAt ?? 0) - (at(b)?.pref.pinnedAt ?? 0));
  layout.inbox.sort(newestFirst((chat) => returnTime(chat, now)));
  layout.working.sort(newestFirst((chat) => returnTime(chat, now)));
  layout.snoozed.sort((a, b) => (at(a)?.pref.snoozedUntil ?? 0) - (at(b)?.pref.snoozedUntil ?? 0));
  layout.settled.sort(newestFirst((chat) => chat.pref.settledAt ?? 0));
  return layout;
}

export type ShelfId = 'working' | 'snoozed' | 'settled';

/** Which shelves are open, and how many pages of Settled are shown. */
export interface ShelfState {
  expanded: Readonly<Record<ShelfId, boolean>>;
  settledPages: number;
}

/** Working and Snoozed start shut, Settled open with one page. */
export const DEFAULT_SHELVES: ShelfState = {
  expanded: { working: false, snoozed: false, settled: true },
  settledPages: 1,
};

/** One line of the inbox as the list draws it. */
export type InboxEntry<T> =
  | { kind: 'pinned-header'; count: number }
  | { kind: 'row'; row: InboxRow<T> }
  | { kind: 'shelf'; id: ShelfId; count: number; expanded: boolean }
  | { kind: 'more'; count: number }
  /** The inbox is empty while shelves hold chats. */
  | { kind: 'clear' };

export const SHELF_TITLES: Readonly<Record<ShelfId, string>> = {
  working: 'Working',
  snoozed: 'Snoozed',
  settled: 'Settled',
};

/**
 * The layout as lines: Pinned under its header, the inbox (no header: the
 * inbox is the list), then each shelf that holds chats as a header with its
 * count, its rows when it is open, and Settled's "Show N more".
 *
 * A search opens every shelf and lists every match, so nothing found is
 * hidden behind a header; and it leaves out "All clear", which is about the
 * inbox, not about a search.
 */
export function inboxEntries<T>(layout: InboxLayout<T>, shelves: ShelfState, searching: boolean): InboxEntry<T>[] {
  const out: InboxEntry<T>[] = [];
  if (layout.pinned.length > 0) {
    out.push({ kind: 'pinned-header', count: layout.pinned.length });
    for (const row of layout.pinned) out.push({ kind: 'row', row });
  }
  for (const row of layout.inbox) out.push({ kind: 'row', row });
  const shelved = layout.working.length + layout.snoozed.length + layout.settled.length;
  if (!searching && layout.inbox.length === 0 && shelved > 0) out.push({ kind: 'clear' });
  for (const id of ['working', 'snoozed', 'settled'] as const) {
    const rows = layout[id];
    if (rows.length === 0) continue;
    const expanded = searching || shelves.expanded[id];
    out.push({ kind: 'shelf', id, count: rows.length, expanded });
    if (!expanded) continue;
    const shown = id === 'settled' && !searching ? rows.slice(0, SETTLED_PAGE * Math.max(1, shelves.settledPages)) : rows;
    for (const row of shown) out.push({ kind: 'row', row });
    const rest = rows.length - shown.length;
    if (rest > 0) out.push({ kind: 'more', count: Math.min(SETTLED_PAGE, rest) });
  }
  return out;
}
