import type { ListItemWithTerminals } from '@/features/terminal/listRows';
import { isAgentRow } from './agentRows';
import { spaceCardMode } from './chatGroups';
import type { ListedChat } from './listedChat';
import { paneTarget } from './paneTarget';
import { rowTitle } from './rowText';

/** The conversation a row of the chats list opens: `openChat`'s arguments. */
export interface ChatRowTarget {
  connectionId: string;
  workspaceId: string;
  title: string;
  paneId: string | undefined;
  /** The session the list saw, so the chat opens from its cache at once. */
  sig: string | null;
}

/**
 * What tapping this row opens, when it opens a conversation: a chat's row, an
 * agent's row (in Agents, or under a space card). Not a group header, a tab's
 * divider, a terminal row, or a space card, whose tap shows its layout; the
 * agents under that card are its conversations.
 *
 * The one place a row's chat is worked out, so a tap and Return in the search
 * field (`firstChatRow`) cannot open different things.
 */
export function chatRowTarget(row: ListItemWithTerminals<ListedChat>): ChatRowTarget | null {
  if (row.kind === 'pane') {
    const { summary, pane } = row;
    const target = paneTarget(summary, pane);
    return {
      connectionId: summary.connectionId, workspaceId: summary.workspaceId, title: target.title, paneId: target.paneId,
      sig: target.paneId === undefined ? summary.sessionSig : pane.sessionSig,
    };
  }
  if (row.kind !== 'chat') return null;
  const item = row.summary;
  const agent = isAgentRow(item) ? item : null;
  if (agent === null && spaceCardMode(item) === 'space') return null;
  return {
    connectionId: item.connectionId, workspaceId: item.workspaceId, title: rowTitle(item), paneId: agent?.pane?.paneId,
    sig: agent?.pane != null ? agent.pane.sessionSig : item.sessionSig,
  };
}

/**
 * The first conversation in the list's rows, in the list's own order (pinned,
 * then Needs you, Working, Idle): what Return in the search field opens.
 * Null when the rows hold none.
 */
export function firstChatRow(rows: readonly ListItemWithTerminals<ListedChat>[]): ChatRowTarget | null {
  for (const row of rows) {
    const target = chatRowTarget(row);
    if (target !== null) return target;
  }
  return null;
}
