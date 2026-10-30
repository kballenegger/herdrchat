import { renderHook, waitFor } from '@testing-library/react-native';

import { NO_INBOX_PREF, type InboxPref } from '@/lib/inbox/inbox';
import { inboxReturns } from '@/lib/inbox/returnTracker';
import type { AgentInfo } from '@/lib/herdr/models';
import { listChats, type ListedChat } from '../listedChat';
import type { PrefRow, useChatPrefs } from '../useChatPrefs';
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

function fakePrefs(prefs: Record<string, Partial<InboxPref>>) {
  const changeInbox = jest.fn(async () => null);
  const value = {
    inboxPrefOf: (row: PrefRow) => ({ ...NO_INBOX_PREF, ...prefs[row.workspaceId] }),
    changeInbox,
  } as unknown as ReturnType<typeof useChatPrefs>;
  return { value, changeInbox };
}

beforeEach(() => {
  inboxReturns.reset();
  mockDemo = false;
});

// Someone drove a settled chat from the terminal: it comes back by itself.
it('takes a settled chat off the shelf when it starts working', async () => {
  const { value, changeInbox } = fakePrefs({ w1: { settledAt: Date.now() - DAY, settledReason: 'user' } });
  await renderHook(() => useInbox({ summaries: [chat('w1', 'working', null)], prefs: value, reads: new Map(), searching: false }));
  await waitFor(() => expect(changeInbox).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceId: 'w1' }),
    { settledAt: null, settledReason: null, unsettledAt: expect.any(Number) }
  ));
});

it('wakes a snoozed chat that asks, and leaves one that finished', async () => {
  const snoozed = { snoozedUntil: Date.now() + DAY, snoozedAt: Date.now() - 1000 };
  const { value, changeInbox } = fakePrefs({ w1: snoozed, w2: snoozed });
  await renderHook(() => useInbox({
    summaries: [chat('w1', 'blocked', null), chat('w2', 'done', Date.now())], prefs: value, reads: new Map(), searching: false,
  }));
  await waitFor(() => expect(changeInbox).toHaveBeenCalledTimes(1));
  expect(changeInbox).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1' }), { snoozedUntil: expect.any(Number) });
});

it('settles an untouched chat, but not while searching, and never on the Demo', async () => {
  const old = Date.now() - 5 * DAY;
  const searching = fakePrefs({});
  await renderHook(() => useInbox({ summaries: [chat('w1', 'idle', old)], prefs: searching.value, reads: new Map(), searching: true }));
  mockDemo = true;
  const demo = fakePrefs({});
  await renderHook(() => useInbox({ summaries: [chat('w1', 'idle', old)], prefs: demo.value, reads: new Map(), searching: false }));
  mockDemo = false;
  const listed = fakePrefs({});
  await renderHook(() => useInbox({ summaries: [chat('w1', 'idle', old)], prefs: listed.value, reads: new Map(), searching: false }));
  await waitFor(() => expect(listed.changeInbox).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceId: 'w1' }), { settledAt: expect.any(Number), settledReason: 'auto' }
  ));
  expect(searching.changeInbox).not.toHaveBeenCalled();
  expect(demo.changeInbox).not.toHaveBeenCalled();
});

it('reads the woke mark against the chat\'s own read marker', async () => {
  const woke = Date.now() - 60_000;
  const { value } = fakePrefs({ w1: { snoozedUntil: woke, snoozedAt: woke - DAY } });
  const reads = new Map([['gimel', new Map([['w1', { sessionSig: 'sig-w1', openedAt: woke + 1 }]])]]);
  const unread = await renderHook(() => useInbox({ summaries: [chat('w1', 'idle', null)], prefs: value, reads: new Map(), searching: false }));
  expect(unread.result.current.facts(chat('w1', 'idle', null), 'gimel\nw1').openedAt).toBeNull();
  const read = await renderHook(() => useInbox({ summaries: [chat('w1', 'idle', null)], prefs: value, reads, searching: false }));
  expect(read.result.current.facts(chat('w1', 'idle', null), 'gimel\nw1').openedAt).toBe(woke + 1);
});
