import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ChatPref } from '@/lib/chatPrefs';
import { NO_INBOX_PREF, type InboxPref } from '@/lib/inbox/inbox';
import type { ServerConnection } from '@/state/connections';
import { agentPrefRow, agentRows } from '../agentRows';
import { listChats, type ListedChat } from '../listedChat';
import { useChatPrefs } from '../useChatPrefs';
import type { ChatSummary } from '../useWorkspaces';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@/components/haptics', () => ({ haptics: { selection: jest.fn() } }));
jest.mock('@/features/notifications/mutedChats', () => ({ publishMutedChats: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/state/connections', () => ({ resolveConnection: () => null }));
/**
 * The database, in memory: what `saveChatPref` and `restoreChatPref` write is
 * what `loadChatPrefs` reads back, with the real merge and the real "a pref
 * that chooses nothing is deleted".
 */
const mockStored = new Map<string, Map<string, ChatPref>>();
jest.mock('@/state/db', () => {
  const { applyPrefChange, isEmptyPref } = jest.requireActual<typeof import('@/lib/chatPrefs')>('@/lib/chatPrefs');
  const table = (id: string) => mockStored.get(id) ?? mockStored.set(id, new Map()).get(id)!;
  const restore = async (_db: unknown, id: string, key: string, pref: ChatPref | null) => {
    if (pref === null || isEmptyPref(pref)) table(id).delete(key);
    else table(id).set(key, pref);
  };
  return {
    loadChatPrefs: jest.fn(async (_db: unknown, id: string) => new Map(mockStored.get(id) ?? [])),
    saveChatPref: jest.fn(async (db: unknown, id: string, key: string, sessionSig: string, change: Partial<ChatPref>) =>
      restore(db, id, key, applyPrefChange(table(id).get(key), sessionSig, change))),
    restoreChatPref: jest.fn(restore),
  };
});

const db = {} as SQLiteDatabase;
const host = { id: 'gimel', name: 'Gimel', host: 'gimel', port: 22, username: 'me' } as ServerConnection;
const agent = (paneId: string) => ({
  agent: 'claude', agentStatus: 'idle' as const, cwd: '/home/demo/api', foregroundCwd: null, focused: false, paneId, tabId: 't1', terminalId: null,
  workspaceId: 'w6', agentSession: null, stateChangeSeq: null, completionSeq: null, inputPending: false, name: null, title: null,
});
const p1 = agent('w6:p1');
const p2 = agent('w6:p2');
// w6 as the Demo has it: two agents, so a space card with a row for each.
const w6: ChatSummary = {
  workspaceId: 'w6', title: 'api', number: 6, status: 'idle', agents: [p1, p2],
  panes: [p1, p2].map((item) => ({ paneId: item.paneId, agent: item, sessionSig: `sig-${item.paneId}`, preview: null, status: 'idle' as const, sessionTitle: null, agentName: null })),
  preview: null, sessionSig: 'sig-w6:p1,sig-w6:p2', shellPanes: [], tabs: [], layouts: [], activeTabId: null, tabCount: 0, paneCount: 0, restoreError: null, sessionTitle: null, agentName: null,
};
const w1: ChatSummary = { ...w6, workspaceId: 'w1', title: 'notes', number: 1, agents: [], panes: [], sessionSig: 'sig-w1' };
const listed = listChats([w1, w6], host.id, null);
const [notes, api] = listed as [ListedChat, ListedChat];
const card = api;
const p1Row = agentPrefRow(api, api.panes[0]!);
const p2Row = agentPrefRow(api, api.panes[1]!);
const pref = (sessionSig: string, choices: Partial<ChatPref>): ChatPref => ({ ...NO_INBOX_PREF, sessionSig, muted: false, ...choices });
const stored = () => new Map(mockStored.get(host.id) ?? []);
const settle: Partial<InboxPref> = { settledAt: 1_000, settledReason: 'user', snoozedUntil: null, snoozedAt: null };

beforeEach(() => {
  mockStored.clear();
  jest.clearAllMocks();
});

async function mounted() {
  const hook = await renderHook(() => useChatPrefs(db, host, listed, [host.id]));
  await waitFor(() => expect(hook.result.current.isLoaded(host.id)).toBe(true));
  return hook;
}

// Settling unpins: a settled chat cannot also be pinned. Undo puts back
// exactly what was stored, the pin included.
describe('settle and its Undo', () => {
  it('unpins a pinned chat it settles, and Undo restores the stored row exactly', async () => {
    const before = pref('sig-w1', { pinnedAt: 7, muted: true, autoSettle: false });
    mockStored.set(host.id, new Map([['w1', before]]));
    const { result } = await mounted();
    let snapshot: Awaited<ReturnType<typeof result.current.changeInbox>> = null;
    await act(async () => {
      snapshot = await result.current.changeInbox(notes, settle, { unpin: true });
    });
    expect(stored().get('w1')).toEqual({ ...before, ...settle, pinnedAt: null });
    expect(result.current.inboxPrefOf(notes)).toMatchObject({ pinnedAt: null, settledAt: 1_000 });
    await act(async () => result.current.restore(snapshot!));
    expect(stored()).toEqual(new Map([['w1', before]]));
    expect(result.current.isPinned(notes)).toBe(true);
  });

  // The agent is settled with its workspace, and pinned by its card: the
  // settle is the card's, the pin it removes is the card's, and Undo brings
  // both back as they were. A pin on the agent's own chat goes too.
  it('settles an agent with its card, unpins what pinned it, and Undo restores every row', async () => {
    const cardPin = pref('sig-w6:p1,sig-w6:p2', { pinnedAt: 4, muted: true });
    mockStored.set(host.id, new Map([['w6', cardPin]]));
    const { result } = await mounted();
    expect(result.current.isPinned(p2Row)).toBe(true);
    let snapshot: Awaited<ReturnType<typeof result.current.changeInbox>> = null;
    await act(async () => {
      snapshot = await result.current.changeInbox(p2Row, settle, { unpin: true });
    });
    expect(stored().get('w6')).toEqual({ ...cardPin, ...settle, pinnedAt: null });
    await act(async () => result.current.restore(snapshot!));
    expect(stored()).toEqual(new Map([['w6', cardPin]]));

    const ownPin = pref('sig-w6:p2', { pinnedAt: 9 });
    mockStored.set(host.id, new Map([['w6/w6:p2', ownPin]]));
    await act(async () => {
      snapshot = await result.current.changeInbox(p2Row, settle, { unpin: true });
    });
    // The pin on its own chat is gone (an empty pref is no row), the settle is the card's.
    expect(stored().has('w6/w6:p2')).toBe(false);
    expect(stored().get('w6')).toMatchObject({ sessionSig: 'sig-w6:p1,sig-w6:p2', settledAt: 1_000 });
    await act(async () => result.current.restore(snapshot!));
    expect(stored()).toEqual(new Map([['w6/w6:p2', ownPin]]));
  });
});

// Spaces lists an agent under its card, in the card's section, so the two
// views can only agree if an agent is settled and snoozed with its workspace.
describe('an agent of several, in both views', () => {
  it('reads a settle or snooze on the card from each agent, in Agents and under the card', async () => {
    mockStored.set(host.id, new Map([['w6', pref('sig-w6:p1,sig-w6:p2', { settledAt: 50, settledReason: 'user' })]]));
    const { result } = await mounted();
    const [agentsP1, agentsP2] = agentRows([api]);
    for (const row of [card, p1Row, p2Row, agentsP1!, agentsP2!]) expect(result.current.inboxPrefOf(row).settledAt).toBe(50);
    // Only the card's row is ruled on: its agents' are its.
    expect(result.current.ownsInbox(card)).toBe(true);
    expect(result.current.ownsInbox(p2Row)).toBe(false);
  });

  it('files a snooze made on one agent on its card, so its sibling and the card follow', async () => {
    const { result } = await mounted();
    await act(async () => {
      await result.current.changeInbox(p1Row, { snoozedUntil: 9_000, snoozedAt: 1_000 }, { unpin: true });
    });
    expect([...stored().keys()]).toEqual(['w6']);
    for (const row of [card, p1Row, p2Row]) expect(result.current.inboxPrefOf(row).snoozedUntil).toBe(9_000);
  });
});

// A rule decided on prefs that had not loaded yet saw an unpinned,
// unsettled chat with auto-settle on. Decided again on what is stored, it
// writes nothing over a pin, an opt-out or a settle the person made.
it('decides a rule again on the stored pref before writing it', async () => {
  const before = pref('sig-w1', { pinnedAt: 3, autoSettle: false });
  mockStored.set(host.id, new Map([['w1', before]]));
  const { result } = await mounted();
  const seen: InboxPref[] = [];
  let snapshot: unknown = 'unset';
  await act(async () => {
    snapshot = await result.current.changeInbox(notes, (current) => {
      seen.push(current);
      return current.pinnedAt !== null || !current.autoSettle ? null : { settledAt: 1, settledReason: 'auto' };
    });
  });
  expect(seen).toEqual([expect.objectContaining({ pinnedAt: 3, autoSettle: false })]);
  expect(snapshot).toBeNull();
  expect(stored()).toEqual(new Map([['w1', before]]));
});

it('says when a host\'s prefs have loaded', async () => {
  const { result } = await renderHook(() => useChatPrefs(db, host, listed, [host.id]));
  expect(result.current.isLoaded('elsewhere')).toBe(false);
  await waitFor(() => expect(result.current.isLoaded(host.id)).toBe(true));
});
