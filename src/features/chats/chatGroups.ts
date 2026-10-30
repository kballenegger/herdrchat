import { agentName } from '@/lib/herdr/models';
import {
  DEFAULT_SHELVES,
  NO_INBOX_PREF,
  SHELF_TITLES,
  inboxEntries,
  inboxLayout,
  type InboxFacts,
  type InboxPref,
  type InboxSection,
  type ShelfId,
  type ShelfState,
} from '@/lib/inbox/inbox';
import type { HostRef } from './listedChat';
import type { ChatSummary, PaneSummary } from './useWorkspaces';

export const PINNED_TITLE = 'Pinned';

/** The list's groups while it is not an inbox (the setting `inbox` off): as it always was. */
export const CHAT_GROUPS = [
  { id: 'pinned', title: PINNED_TITLE },
  { id: 'needs-you', title: 'Needs you' },
  { id: 'working', title: 'Working' },
  { id: 'idle', title: 'Idle' },
] as const;
export type ChatGroupId = (typeof CHAT_GROUPS)[number]['id'];

export type ChatListItem<S extends ChatSummary = ChatSummary> =
  /** A group's header: Pinned, or with the inbox off, Needs you, Working or Idle. */
  | { kind: 'group'; id: ChatGroupId; title: string; count: number }
  /** A shelf's header: Working, Snoozed or Settled, with its count. Tapping it opens or shuts it. */
  | { kind: 'shelf'; id: ShelfId; title: string; count: number; expanded: boolean }
  /** Settled's "Show N more". */
  | { kind: 'more'; count: number }
  /** "All clear": the inbox is empty while shelves hold chats. */
  | { kind: 'clear' }
  | {
    kind: 'chat'; summary: S;
    /**
     * The inbox section it is listed in, which decides its swipe and whether
     * its row is slim; null while the list is not an inbox, where its swipe
     * is Rename and Close as it always was.
     */
    section: InboxSection | null;
    /** It woke from a snooze and has not been opened since. */
    woke: boolean;
  }
  /** One agent of a workspace whose card is a space (`spaceCardMode`), listed under it. */
  | {
    kind: 'pane'; summary: S; pane: S['panes'][number];
    /**
     * Where this row sits among the agents listed under its workspace, which
     * a search can make fewer than the workspace holds. The row's rail joins
     * the workspace card above the first and stops at the last.
     */
    first: boolean; last: boolean;
  }
  /**
   * Where a tab's rows start under a space card whose listed rows sit in two
   * or more tabs (`withTerminalRows`): a hairline between it and the tab
   * before, and the tab's label above its rows when the person named it.
   * The first tab's has no line, and is only there when it has a label.
   */
  | {
    kind: 'tab'; summary: S; tabId: string;
    /** `tabHeading`: null for a tab herdr only numbered. */
    label: string | null;
    first: boolean;
  };

/** What the inbox knows about one row beyond its summary. */
export interface RowInbox {
  pref: InboxPref;
  openedAt: number | null;
  returnedAt: number | null;
  activeSince: number | null;
  working: boolean;
}

/** A row's inbox facts: its own status and last message, and what the app knows of it. */
export function chatFacts(summary: ChatSummary, known: Partial<RowInbox> = {}): InboxFacts {
  return {
    status: summary.status,
    preview: summary.preview,
    pref: known.pref ?? NO_INBOX_PREF,
    openedAt: known.openedAt ?? null,
    returnedAt: known.returnedAt ?? null,
    activeSince: known.activeSince ?? null,
    working: known.working ?? summary.status === 'working',
    // A space card stands for a workspace: its other agents and terminals
    // would hide with it.
    canHide: spaceCardMode(summary) === 'chat',
  };
}

/** How the inbox lays out a list: its time, its setting, its shelves, each row's facts. */
export interface InboxContext<S extends ChatSummary = ChatSummary> {
  /**
   * The setting `inbox`. Off, the list is grouped as it always was (Pinned,
   * Needs you, Working, Idle) and only the pins of `facts` count.
   */
  enabled: boolean;
  now: number;
  hideWorking: boolean;
  shelves: ShelfState;
  /** A row's facts, by the row and its key (`keyOf`). */
  facts: (summary: S, key: string) => InboxFacts;
}

/** The inbox off, with no pins: the list grouped by what each chat is doing. */
export const PLAIN_INBOX: InboxContext = { enabled: false, now: 0, hideWorking: false, shelves: DEFAULT_SHELVES, facts: (summary) => chatFacts(summary) };

/**
 * What a workspace's card in Spaces stands for.
 *
 * `chat`: the workspace holds one conversational agent and nothing else, so
 * the card is that agent's chat, titled by its session, and opens it.
 * `space`: anything more (two agents, or an agent beside a shell, or only
 * shells): the card is the workspace, titled by its label with its stats
 * under it, and it opens the workspace's layout; each agent is a row of its
 * own under it, then each other pane's terminal row. A one-agent workspace
 * with a shell used to be the agent's card with the terminal row hanging off
 * it, which read as if the terminal belonged to the agent.
 *
 * A workspace whose one agent herdr could not restore (no pane, a
 * `restoreError`, nothing else in it) is still that agent's chat: its card
 * says "Couldn't restore" and opens the conversation, as it always did. As a
 * space it would be titled by the workspace with "no agent" and open a layout
 * with nothing to tap, and the conversation could not be reached from Spaces.
 */
export type SpaceCardMode = 'chat' | 'space';

export function spaceCardMode(summary: Pick<ChatSummary, 'panes' | 'shellPanes' | 'restoreError'>): SpaceCardMode {
  if (summary.shellPanes.length > 0) return 'space';
  if (summary.panes.length === 1) return 'chat';
  return summary.panes.length === 0 && summary.restoreError !== null ? 'chat' : 'space';
}

/**
 * The agents of a workspace that get rows of their own: every one of them
 * under a space card, none under a chat card, whose one agent is the card.
 */
export function paneChats<S extends ChatSummary>(summary: S): readonly S['panes'][number][] {
  return spaceCardMode(summary) === 'space' ? summary.panes : [];
}

/**
 * The list's rows. As an inbox (`src/lib/inbox`, the setting on): Pinned
 * first in pin order, then the chats that came back to you most recently,
 * then the Working, Snoozed and Settled shelves. Otherwise as it always was:
 * Pinned, then by live state (Needs you, Working, Idle), keeping the host's
 * order within each group except Idle, where the chat that finished last
 * comes first. Each chat brings its agents' rows under it, in whatever
 * section or group it is in.
 *
 * A pinned chat stays in Pinned whatever it is doing: its row already says
 * when it needs you, and a pin that jumped away the moment the agent asked
 * something would not be a pin.
 *
 * A chat on another host is listed like any other, and found by its host's
 * name too. `keyOf` names a row: the workspace id on one host, `rowKey` once a
 * list holds several, whose workspace ids repeat each other's.
 */
export function groupChats<S extends ChatSummary & { host?: HostRef | null }>(
  summaries: readonly S[],
  query: string,
  inbox: InboxContext<S> = PLAIN_INBOX as unknown as InboxContext<S>,
  keyOf: (summary: S) => string = (summary) => summary.workspaceId
): ChatListItem<S>[] {
  const needle = query.trim().toLowerCase();
  const found = (texts: readonly string[]) => texts.some((text) => text.toLowerCase().includes(needle));
  // An agent by its herdr id and by the name its row shows: herdr's `agy` is
  // "Antigravity" on the row, and a search for that found nothing.
  const agentWords = (kind: string | null) => (kind === null ? '' : `${kind} ${agentName(kind)}`);
  // A chat is found by the title its row shows, the session's, as well.
  const paneMatches = (pane: PaneSummary) => found([`${agentWords(pane.agent.agent)} ${pane.agent.cwd}`, pane.sessionTitle ?? '', pane.agentName ?? '']);
  /** The pane rows to list under a chat: all of them when the workspace itself matched. */
  const panesOf = new Map<string, readonly S['panes'][number][]>();
  const matches = summaries.filter((chat) => {
    const panes = paneChats(chat);
    const own = [chat.title, chat.workspaceId, chat.host?.label ?? ''];
    if (found([...own, ...chat.agents.map((agent) => `${agentWords(agent.agent)} ${agent.cwd} ${agent.title ?? ''} ${agent.name ?? ''}`)])) {
      // A folder or provider shared by only some of the agents names those.
      // A search for the workspace's own name lists every agent in it.
      // So does a search for the host it is on.
      const named = found(own) ? [] : panes.filter(paneMatches);
      panesOf.set(keyOf(chat), named.length > 0 ? named : panes);
      return true;
    }
    return false;
  });
  const rowsOf = (summary: S, section: InboxSection | null, woke: boolean): ChatListItem<S>[] => [
    { kind: 'chat', summary, section, woke },
    ...(panesOf.get(keyOf(summary)) ?? []).map((pane, index, listed): ChatListItem<S> => ({
      kind: 'pane', summary, pane, first: index === 0, last: index === listed.length - 1,
    })),
  ];
  if (!inbox.enabled) {
    const pinnedAt = (chat: S) => inbox.facts(chat, keyOf(chat)).pref.pinnedAt;
    const groupOf = (chat: S): ChatGroupId =>
      pinnedAt(chat) !== null
        ? 'pinned'
        : chat.status === 'blocked' ? 'needs-you' : chat.status === 'working' ? 'working' : 'idle';
    return CHAT_GROUPS.flatMap(({ id, title }): ChatListItem<S>[] => {
      const chats = matches.filter((chat) => groupOf(chat) === id);
      if (id === 'pinned') chats.sort((a, b) => (pinnedAt(a) ?? 0) - (pinnedAt(b) ?? 0));
      // The chat that finished last first, by its last message; one with none keeps its place after them.
      if (id === 'idle') chats.sort((a, b) => (b.preview?.timestamp ?? 0) - (a.preview?.timestamp ?? 0));
      if (chats.length === 0) return [];
      return [{ kind: 'group', id, title, count: chats.length }, ...chats.flatMap((summary) => rowsOf(summary, null, false))];
    });
  }
  const layout = inboxLayout(matches, (chat) => inbox.facts(chat, keyOf(chat)), { now: inbox.now, hideWorking: inbox.hideWorking });
  return inboxEntries(layout, inbox.shelves, needle !== '').flatMap((entry): ChatListItem<S>[] => {
    switch (entry.kind) {
      case 'pinned-header': return [{ kind: 'group', id: 'pinned', title: PINNED_TITLE, count: entry.count }];
      case 'shelf': return [{ kind: 'shelf', id: entry.id, title: SHELF_TITLES[entry.id], count: entry.count, expanded: entry.expanded }];
      case 'more': return [{ kind: 'more', count: entry.count }];
      case 'clear': return [{ kind: 'clear' }];
      case 'row': return rowsOf(entry.row.item, entry.row.section, entry.row.woke);
    }
  });
}
