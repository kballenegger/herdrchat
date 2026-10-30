import { Keyboard, View } from 'react-native';

import { Text } from '@/components/Text';
import { SwipeableChatRow } from '@/features/chats/SwipeableChatRow';
import type { useChatActions } from '@/features/chats/useChatActions';
import type { useChatPrefs } from '@/features/chats/useChatPrefs';
import { openFor, readsOf, type ListedChat, type OpenChat, type ReadsByConnection } from '@/features/chats/listedChat';
import type { LayoutAnchor } from '@/features/spaces/LayoutPeek';
import { terminalRowParams, type ListItemWithTerminals } from '@/features/terminal/listRows';
import { openTerminal } from '@/features/terminal/navigation';
import { useTheme } from '@/theme/ThemeProvider';
import { minTouchTarget, spacing } from '@/theme/tokens';
import { canSnooze, wakeLabel } from '@/lib/inbox/snooze';
import type { SheetAction } from '@/components/ActionSheet';

import { agentPrefRow, agentTestKey, isAgentRow, isAgentUnread } from './agentRows';
import { spaceCardMode } from './chatGroups';
import { isChatUnread, isPaneUnread } from './chatUnread';
import { chatRowTarget, type ChatRowTarget } from './chatRowTarget';
import { openChat } from './navigation';
import { PaneRow } from './PaneRow';
import { paneTarget } from './paneTarget';
import { rowTitle, spaceTitle } from './rowText';
import { formatListTime, type RowAction } from './ChatRow';
import { AllClearRow, ShelfHeader, ShowMoreRow } from './ShelfHeader';
import type { TrailingSwipe } from './SwipeableChatRow';
import type { InboxTarget, useInboxActions } from './useInboxActions';
import type { InboxSection } from '@/lib/inbox/inbox';
import { useInboxShelves } from '@/state/inboxShelves';
import { TabDivider } from './TabDivider';
import { TerminalRow } from './TerminalRow';

/** What a space card's layout button does: a floating card on iPad, a sheet on a phone. */
export interface LayoutButton {
  /** A pointer is there to hover with. */
  pointer: boolean;
  open: (item: ListedChat, anchor: LayoutAnchor) => void;
  hover: (item: ListedChat, anchor: LayoutAnchor) => void;
  leave: (item: ListedChat) => void;
}

/** Opens a row's conversation (`chatRowTarget`), as a tap on it does. */
export function openChatTarget(target: ChatRowTarget) {
  Keyboard.dismiss();
  openChat(target.connectionId, target.workspaceId, target.title, target.paneId, target.sig);
}

function openRow(row: ListItemWithTerminals<ListedChat>) {
  const target = chatRowTarget(row);
  if (target !== null) openChatTarget(target);
}

/**
 * One row of the chat list: Pinned's header, a shelf's header, "Show N
 * more", "All clear", a tab's divider, a pane's terminal, an agent's row
 * under its workspace, or a chat.
 */
export function ChatListItem({ row, prefs, actions, inbox, now, open, reads, openTerminalKey, layout, onSwiped }: {
  row: ListItemWithTerminals<ListedChat>;
  prefs: ReturnType<typeof useChatPrefs>;
  actions: ReturnType<typeof useChatActions<ListedChat>>;
  inbox: ReturnType<typeof useInboxActions>;
  /** The inbox's time, which a snoozed row's wake label counts down to. */
  now: number;
  /** The chat open in the detail, which its row shows as selected. */
  open: OpenChat | null;
  reads: ReadsByConnection;
  /** The terminal open in the detail, as `connectionId\npaneId`. */
  openTerminalKey: string | null;
  layout: LayoutButton;
  /** A row was swiped: the hint has done its job. */
  onSwiped: () => void;
}) {
  const { colors } = useTheme();
  if (row.kind === 'group') return (
    <View
      testID={`chat-group-${row.id}`}
      accessibilityRole="header"
      accessibilityLabel={`${row.title}, ${row.count} chats`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: minTouchTarget, paddingVertical: spacing.sm }}>
      <Text variant="caption" mono color={row.id === 'needs-you' ? 'attention' : 'secondary'}>{row.title.toUpperCase()}</Text>
      <View style={{ height: 1, flex: 1, backgroundColor: row.id === 'needs-you' ? colors.attentionBorder : colors.separator }} />
      <Text variant="caption" mono color="secondary">{row.count}</Text>
    </View>
  );
  if (row.kind === 'shelf') return (
    <ShelfHeader id={row.id} title={row.title} count={row.count} expanded={row.expanded} onPress={() => useInboxShelves.getState().toggle(row.id)} />
  );
  if (row.kind === 'more') return <ShowMoreRow count={row.count} onPress={() => useInboxShelves.getState().showMore()} />;
  if (row.kind === 'clear') return <AllClearRow />;
  if (row.kind === 'tab') return <TabDivider summary={row.summary} tabId={row.tabId} label={row.label} first={row.first} />;
  if (row.kind === 'terminal') {
    const { summary, terminal } = row;
    return (
      <TerminalRow
        summary={summary}
        terminal={terminal}
        first={row.first}
        last={row.last}
        standalone={row.standalone}
        selected={openTerminalKey === `${summary.connectionId}\n${terminal.paneId}`}
        onPress={() => {
          Keyboard.dismiss();
          openTerminal(terminalRowParams(summary.connectionId, terminal));
        }}
      />
    );
  }
  const item = row.summary;
  // An agent's row in the Agents view: its pin, its read and its
  // thread are its agent's (`chatKey`). Rename and Close still act
  // on its workspace, as they do from an agent's row in Spaces.
  const agent = isAgentRow(item) ? item : null;
  const pinned = prefs.isPinned(item);
  const muted = prefs.isMuted(item);
  // Both belong to a conversation, so both wait for its session id.
  const personal = item.sessionSig !== null;
  const mutable = personal && prefs.canMute(item);
  // Compared on the row's own connection: one host's `w1` is not
  // another's.
  const openHere = openFor(open, item);
  const rowReads = readsOf(reads, item);
  // The pin and mute, then the inbox's own: what the swipe offers, and the
  // two that only the menu does.
  const pinMute: SheetAction[] = personal ? [
    { label: pinned ? 'Unpin' : 'Pin', onPress: () => prefs.togglePin(item) },
    ...(mutable ? [{ label: muted ? 'Unmute notifications' : 'Mute notifications', onPress: () => prefs.toggleMute(item) }] : []),
  ] : [];
  if (row.kind === 'pane') {
    const { pane } = row;
    const target = paneTarget(item, pane);
    // The agent's own pin and mute, as its row in Agents reads and
    // makes them (`agentPrefRow`): acting on the workspace from
    // here pinned something the other view never showed. The one
    // agent of its workspace is the workspace chat there, so it is
    // pinned and muted as the workspace here too.
    const own = target.paneId === undefined ? item : agentPrefRow(item, pane);
    const ownPersonal = own.sessionSig !== null;
    const ownPinned = prefs.isPinned(own);
    const ownMuted = prefs.isMuted(own);
    const ownMutable = ownPersonal && prefs.canMute(own);
    // That workspace pin is drawn once, on the card above: the same
    // pin on both rows read as two. Pin and Mute stay in this
    // row's long-press sheet.
    const sharesCard = target.paneId === undefined;
    return (
      <PaneRow
        summary={item}
        pane={pane}
        first={row.first}
        last={row.last}
        pinned={ownPinned && !sharesCard}
        muted={ownMuted && !sharesCard}
        selected={openHere === target.key}
        unread={isPaneUnread(item, pane, rowReads, openHere)}
        onPress={() => openRow(row)}
        onLongPress={() => actions.manageChat(item, ownPersonal ? [
          { label: ownPinned ? 'Unpin' : 'Pin', onPress: () => prefs.togglePin(own) },
          ...(ownMutable ? [{ label: ownMuted ? 'Unmute notifications' : 'Mute notifications', onPress: () => prefs.toggleMute(own) }] : []),
        ] : [])}
      />
    );
  }
  // A workspace card that stands for the workspace rather than one
  // chat (`spaceCardMode`) shows its layout, and is never the
  // selection: the agent rows under it are.
  const space = agent === null && spaceCardMode(item) === 'space';
  // Null while the list is not an inbox (the setting off): the row, its
  // swipe (Rename and Close), its menu and its VoiceOver actions are as they
  // always were.
  const section = row.section;
  const rename = () => actions.renameChat(item);
  const close = () => actions.closeChat(item);
  const pref = prefs.inboxPrefOf(item);
  // An agent of several is settled with its workspace (`inboxRef`), whose
  // newest line is what the settle has to be newer than.
  const settles = agent?.pane != null ? agent.workspace : item;
  const target = { row: item, title: space ? spaceTitle(item) : rowTitle(item), preview: settles.preview };
  const choices = personal && section !== null ? inboxChoices(section, item.status, target, inbox) : null;
  const slim = section === 'snoozed' || section === 'settled';
  const trailingLabel = section === 'snoozed' && pref.snoozedUntil !== null ? wakeLabel(pref.snoozedUntil, now)
    : section === 'settled' && pref.settledAt !== null ? formatListTime(pref.settledAt) : undefined;
  const menu: SheetAction[] = [
    ...pinMute,
    ...(choices === null ? [] : [
      ...choices.menu,
      pref.autoSettle
        ? { label: "Don't settle automatically", onPress: () => inbox.setAutoSettle(target, false) }
        : { label: 'Settle automatically', onPress: () => inbox.setAutoSettle(target, true) },
    ]),
  ];
  const rowActions: RowAction[] = [
    ...(personal ? [{ name: 'pin', label: pinned ? 'Unpin' : 'Pin', run: () => prefs.togglePin(item) }] : []),
    ...(mutable ? [{ name: 'mute', label: muted ? 'Unmute notifications' : 'Mute notifications', run: () => prefs.toggleMute(item) }] : []),
    ...(choices === null ? [] : choices.actions),
    { name: 'rename', label: 'Rename workspace', run: rename },
    { name: 'close', label: 'Close chat', run: close },
  ];
  return (
    <SwipeableChatRow
      summary={item}
      testKey={agent === null ? undefined : agentTestKey(agent)}
      pinned={pinned}
      muted={muted}
      onTogglePin={personal ? () => prefs.togglePin(item) : undefined}
      onToggleMute={mutable ? () => prefs.toggleMute(item) : undefined}
      selected={!space && openHere === (agent?.chatKey ?? item.workspaceId)}
      unread={agent === null ? isChatUnread(item, rowReads, openHere) : isAgentUnread(agent, rowReads, openHere)}
      onPress={() => openRow(row)}
      onLongPress={() => actions.manageChat(item, menu)}
      onSwiped={onSwiped}
      trailing={section === null ? renameCloseSwipe(rename, close) : choices?.swipe}
      actions={rowActions}
      variant={slim ? 'slim' : 'card'}
      trailingLabel={trailingLabel}
      woke={row.woke}
      space={space ? {
        onOpenLayout: (anchor) => layout.open(item, anchor),
        onHoverLayout: layout.pointer ? (anchor) => layout.hover(item, anchor) : undefined,
        onLeaveLayout: layout.pointer ? () => layout.leave(item) : undefined,
      } : undefined}
    />
  );
}

/**
 * What a chat in a section can do in the inbox, as a swipe, as menu rows and
 * as VoiceOver actions: Settle and Snooze from the inbox (no Snooze while it
 * asks, which would wake it at once), Unsettle from Settled, Wake from
 * Snoozed.
 */
function inboxChoices(
  section: InboxSection,
  status: ListedChat['status'],
  target: InboxTarget,
  inbox: ReturnType<typeof useInboxActions>
): { swipe: TrailingSwipe; menu: SheetAction[]; actions: RowAction[] } {
  if (section === 'settled') {
    const run = () => inbox.unsettle(target);
    return {
      swipe: { primary: { id: 'unsettle', label: 'Unsettle', symbol: 'arrow.uturn.backward', tone: 'tint', run }, full: true },
      menu: [{ label: 'Unsettle', onPress: run }],
      actions: [{ name: 'unsettle', label: 'Unsettle', run }],
    };
  }
  if (section === 'snoozed') {
    const run = () => inbox.wake(target);
    return {
      swipe: { primary: { id: 'wake', label: 'Wake', symbol: 'alarm', tone: 'tint', run }, full: true },
      menu: [{ label: 'Wake', onPress: run }],
      actions: [{ name: 'wake', label: 'Wake', run }],
    };
  }
  const settle = () => inbox.settle(target);
  const snooze = () => inbox.snooze(target);
  const snoozable = canSnooze(status);
  return {
    swipe: {
      primary: { id: 'settle', label: 'Settle', symbol: 'checkmark.circle', tone: 'tint', run: settle },
      secondary: snoozable ? { id: 'snooze', label: 'Snooze', symbol: 'clock', tone: 'neutral', run: snooze } : undefined,
      full: true,
    },
    menu: [{ label: 'Settle', onPress: settle }, ...(snoozable ? [{ label: 'Snooze…', onPress: snooze }] : [])],
    actions: [{ name: 'settle', label: 'Settle', run: settle }, ...(snoozable ? [{ name: 'snooze', label: 'Snooze', run: snooze }] : [])],
  };
}

/** Rename and Close, the trailing swipe while the list is not an inbox. */
function renameCloseSwipe(onRename: () => void, onClose: () => void): TrailingSwipe {
  return {
    // "Workspace" under the pencil, not "Rename": a row titled by its
    // session no longer shows the workspace label this renames, and
    // "Rename workspace" does not fit the panel. VoiceOver hears it whole.
    secondary: { id: 'rename', label: 'Workspace', accessibilityLabel: 'Rename workspace', symbol: 'pencil', tone: 'neutral', run: onRename },
    primary: { id: 'close', label: 'Close', symbol: 'xmark', tone: 'destructive', run: onClose },
    full: false,
  };
}
