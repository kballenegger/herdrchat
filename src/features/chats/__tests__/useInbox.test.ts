import { act, renderHook, waitFor } from '@testing-library/react-native';

import { NO_INBOX_PREF, type InboxPref } from '@/lib/inbox/inbox';
import { inboxReturns } from '@/lib/inbox/returnTracker';
import type { AgentInfo } from '@/lib/herdr/models';
import { listChats, type ListedChat } from '../listedChat';
import type { InboxWrite, PrefRow, useChatPrefs } from '../useChatPrefs';
import { SETTINGS_DEFAULTS, useSettings } from '@/state/settings';
import { useInbox } from '../useInbox';
import type { ChatSummary } from '../useWorkspaces';

let mockDemo = false;
jest.mock('@/state/connections', () => ({ isDemo: () => mockDemo }));

const DAY = 86_400_000;
const agent = (workspaceId: string): AgentInfo => ({
  agent: 'claude', agentStatus: 'idle', cwd: `/home/me/${workspaceId}`, foregroundCwd: null, focused: true, paneId: `${workspaceId}:p1`,
  tabId: 't1', terminalId: null, workspaceId, agentSession: null, stateChangeSeq: null, completionSeq: null, inputPending: false, name: null, title: null,
});
const chat = (workspaceId: string, status: ChatSummary['status'], timestamp: number | null): ListedChat => {
  const one = agent(workspaceId);
  const preview = timestamp === null ? null : { text: 'done', timestamp, fromUser: false };
  const [listed] = listChats([{
    workspaceId, title: workspaceId, number: 1, status, agents: [one],
    panes: [{ paneId: one.paneId, agent: one, sessionSig: `sig-${workspaceId}`, preview, status, sessionTitle: null, agentName: null }],
    preview, sessionSig: `sig-${workspaceId}`, shellPanes: [], tabs: [], layouts: [], activeTabId: null, tabCount: 0, paneCount: 0,
    restoreError: null, sessionTitle: null, agentName: null,
  }], 'gimel', null);
  return listed!;
};

/**
 * Prefs as the hook sees them. `changeInbox` records what it would write:
 * a rule is a function of the stored pref, decided here on the same prefs.
 */
function fakePrefs(prefs: Record<string, Partial<InboxPref>>, { loaded = true } = {}) {
  const inboxPrefOf = (row: PrefRow): InboxPref => ({ ...NO_INBOX_PREF, ...prefs[row.workspaceId] });
  const changeInbox = jest.fn(async (row: PrefRow, write: InboxWrite) => {
    const change = typeof write === 'function' ? write(inboxPrefOf(row)) : write;
    if (change !== null) written.push({ workspaceId: row.workspaceId, chatKey: row.chatKey ?? null, change });
    return null;
  });
  const written: { workspaceId: string; chatKey: string | null; change: unknown }[] = [];
  const value = {
    inboxPrefOf,
    changeInbox,
    isLoaded: () => loaded,
    ownsInbox: (row: PrefRow) => row.inboxRef === undefined,
  } as unknown as ReturnType<typeof useChatPrefs>;
  return { value, changeInbox, written };
}

const props = (summaries: ListedChat[], prefs: ReturnType<typeof useChatPrefs>, extra: Partial<Parameters<typeof useInbox>[0]> = {}) =>
  ({ summaries, prefs, reads: new Map(), open: null, searching: false, ...extra });

beforeEach(() => {
  inboxReturns.reset();
  mockDemo = false;
  useSettings.getState().hydrate({ ...SETTINGS_DEFAULTS, inbox: true });
});
afterAll(() => useSettings.getState().hydrate(SETTINGS_DEFAULTS));

// Someone drove a settled chat from the terminal: it comes back by itself.
it('takes a settled chat off the shelf when it is seen to start working', async () => {
  const { value, written } = fakePrefs({ w1: { settledAt: Date.now() - DAY, settledReason: 'user' } });
  const hook = await renderHook((summaries: ListedChat[]) => useInbox(props(summaries, value)), { initialProps: [chat('w1', 'idle', null)] });
  expect(written).toEqual([]);
  await act(async () => hook.rerender([chat('w1', 'working', null)]));
  await waitFor(() => expect(written).toEqual([
    { workspaceId: 'w1', chatKey: null, change: { settledAt: null, settledReason: null, unsettledAt: expect.any(Number) } },
  ]));
});

// Settled while it worked, then the app was relaunched: the first poll sees
// it working, but nothing happened to it since it was settled.
it('leaves a chat settled while it worked on the shelf across a relaunch', async () => {
  const { value, written } = fakePrefs({ w1: { settledAt: Date.now() - 60_000, settledReason: 'user' } });
  inboxReturns.reset();
  await renderHook(() => useInbox(props([chat('w1', 'working', null)], value)));
  await act(async () => undefined);
  expect(written).toEqual([]);
});

// The setting off is the list as it always was: nothing is written.
it('writes nothing while the list is not an inbox', async () => {
  useSettings.getState().set('inbox', false);
  const { value, changeInbox } = fakePrefs({ w1: { snoozedUntil: Date.now() + DAY, snoozedAt: Date.now() - 1000 } });
  const old = Date.now() - 30 * DAY;
  const hook = await renderHook(() => useInbox(props([chat('w1', 'blocked', null), chat('w2', 'idle', old)], value)));
  await act(async () => undefined);
  expect(changeInbox).not.toHaveBeenCalled();
  expect(hook.result.current.enabled).toBe(false);
});

// Before a host's prefs load, every chat reads unpinned and unsettled: an
// old pinned chat would be settled over its pin.
it('rules on no chat whose host\'s prefs have not loaded', async () => {
  const { value, changeInbox } = fakePrefs({}, { loaded: false });
  await renderHook(() => useInbox(props([chat('w1', 'idle', Date.now() - 30 * DAY)], value)));
  await act(async () => undefined);
  expect(changeInbox).not.toHaveBeenCalled();
});

it('wakes a snoozed chat that asks, and leaves one that finished', async () => {
  const snoozed = { snoozedUntil: Date.now() + DAY, snoozedAt: Date.now() - 1000 };
  const { value, changeInbox } = fakePrefs({ w1: snoozed, w2: snoozed });
  await renderHook(() => useInbox(props([chat('w1', 'blocked', null), chat('w2', 'done', Date.now())], value)));
  await waitFor(() => expect(changeInbox).toHaveBeenCalledTimes(1));
  expect(changeInbox).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1' }), expect.any(Function));
});

it('settles an untouched chat, but not while searching, and never on the Demo', async () => {
  const old = Date.now() - 5 * DAY;
  const searching = fakePrefs({});
  await renderHook(() => useInbox(props([chat('w1', 'idle', old)], searching.value, { searching: true })));
  mockDemo = true;
  const demo = fakePrefs({});
  await renderHook(() => useInbox(props([chat('w1', 'idle', old)], demo.value)));
  mockDemo = false;
  const listed = fakePrefs({});
  await renderHook(() => useInbox(props([chat('w1', 'idle', old)], listed.value)));
  await waitFor(() => expect(listed.written).toEqual([
    { workspaceId: 'w1', chatKey: null, change: { settledAt: expect.any(Number), settledReason: 'auto' } },
  ]));
  expect(searching.changeInbox).not.toHaveBeenCalled();
  expect(demo.changeInbox).not.toHaveBeenCalled();
});

it('reads the woke mark against the chat\'s own read marker', async () => {
  const woke = Date.now() - 60_000;
  const { value } = fakePrefs({ w1: { snoozedUntil: woke, snoozedAt: woke - DAY } });
  const reads = new Map([['gimel', new Map([['w1', { sessionSig: 'sig-w1', openedAt: woke + 1 }]])]]);
  const unread = await renderHook(() => useInbox(props([chat('w1', 'idle', null)], value)));
  expect(unread.result.current.facts(chat('w1', 'idle', null), 'gimel\nw1').openedAt).toBeNull();
  const read = await renderHook(() => useInbox(props([chat('w1', 'idle', null)], value, { reads })));
  expect(read.result.current.facts(chat('w1', 'idle', null), 'gimel\nw1').openedAt).toBe(woke + 1);
  // Open beside the list (iPad), it is being read now: no "Woke" on it.
  const open = await renderHook(() => useInbox(props([chat('w1', 'idle', null)], value, { open: { connectionId: 'gimel', key: 'w1' } })));
  const facts = open.result.current.facts(chat('w1', 'idle', null), 'gimel\nw1');
  expect(facts.openedAt).toBe(open.result.current.now);
  expect(facts.openedAt! >= woke).toBe(true);
});

// w6 runs two agents. Each is settled with the workspace, so only the card
// is ruled on; ruled on by its own idle line, p1 would settle the
// workspace while p2 works.
it('rules on a workspace of several agents by its card alone', async () => {
  const old = Date.now() - 30 * DAY;
  const p1 = agent('w6');
  const p2 = { ...agent('w6'), paneId: 'w6:p2' };
  const pane = (item: AgentInfo, status: ChatSummary['status'], timestamp: number) => ({
    paneId: item.paneId, agent: item, sessionSig: `sig-${item.paneId}`, preview: { text: 'x', timestamp, fromUser: false }, status, sessionTitle: null, agentName: null,
  });
  const [w6] = listChats([{
    workspaceId: 'w6', title: 'api', number: 6, status: 'working', agents: [p1, p2],
    panes: [pane(p1, 'idle', old), pane(p2, 'working', Date.now())], preview: { text: 'x', timestamp: Date.now(), fromUser: false },
    sessionSig: 'sig-w6:p1,sig-w6:p2', shellPanes: [], tabs: [], layouts: [], activeTabId: null, tabCount: 0, paneCount: 0,
    restoreError: null, sessionTitle: null, agentName: null,
  }], 'gimel', null);
  const { value, changeInbox } = fakePrefs({});
  await renderHook(() => useInbox(props([w6!], value)));
  await act(async () => undefined);
  expect(changeInbox).not.toHaveBeenCalled();
});
