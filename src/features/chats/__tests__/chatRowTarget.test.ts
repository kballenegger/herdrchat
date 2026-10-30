import { HerdrClient } from '@/lib/herdr/client';
import { DemoHost } from '@/lib/demo/host';
import { chatListRows } from '../chatListRows';
import { chatRowTarget, firstChatRow } from '../chatRowTarget';
import { PLAIN_INBOX, chatFacts, type InboxContext } from '../chatGroups';
import { NO_INBOX_PREF } from '@/lib/inbox/inbox';
import { listChats, type ListedChat } from '../listedChat';
import { buildSummaries } from '../useWorkspaces';

jest.mock('../../usePollGate', () => ({ usePollGate: () => true }));
jest.mock('../../useHostEvents', () => ({ useHostEvents: () => false }));
jest.mock('@/state/settings', () => ({ useSettings: () => 1 }));
jest.mock('@/state/hostTheme', () => ({ checkHostTheme: async () => true }));
jest.mock('@/state/slashCommands', () => ({ scanSlashCatalogue: async () => undefined }));

let summaries: ListedChat[] = [];
beforeAll(async () => {
  const snapshot = await new HerdrClient(new DemoHost()).snapshot();
  summaries = listChats(
    buildSummaries(snapshot.workspaces ?? [], snapshot.agents, new Map(), [], snapshot.panes, new Map(), snapshot),
    'demo', null
  );
});

// The inbox off (the default), with these chats pinned in this order.
const pinning = (pinned: readonly string[]): InboxContext<ListedChat> => ({
  ...(PLAIN_INBOX as unknown as InboxContext<ListedChat>),
  facts: (summary, key) => {
    const at = pinned.indexOf(key);
    return chatFacts(summary, { pref: { ...NO_INBOX_PREF, pinnedAt: at === -1 ? null : at } });
  },
});

const rows = (query: string, mode: 'spaces' | 'agents' = 'spaces', pinned: readonly string[] = []) =>
  chatListRows(mode, summaries, query, pinning(pinned), true);

describe('firstChatRow', () => {
  it("opens the list's first chat, under its group header", () => {
    const all = rows('');
    expect(all[0]?.kind).toBe('group');
    const first = all.find((row) => row.kind === 'chat');
    expect(first?.kind === 'chat' && first.summary.workspaceId).toBe('w1');
    expect(firstChatRow(all)).toEqual({
      connectionId: 'demo', workspaceId: 'w1', title: 'Folder picker read errors', paneId: undefined,
      sig: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('follows the search', () => {
    expect(firstChatRow(rows('Release notes'))).toEqual({
      connectionId: 'demo', workspaceId: 'w2', title: 'Release notes summary', paneId: undefined,
      sig: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('follows the pins: a pinned chat comes first', () => {
    expect(firstChatRow(rows('', 'spaces', ['demo\nw3']))?.workspaceId).toBe('w3');
  });

  // w6's card shows its layout when tapped; its agents are the conversations.
  it("skips a space card for the first agent under it", () => {
    const found = rows('api');
    expect(found.some((row) => row.kind === 'chat' && row.summary.workspaceId === 'w6')).toBe(true);
    expect(firstChatRow(found)).toEqual(expect.objectContaining({ workspaceId: 'w6', paneId: 'w6:p1' }));
  });

  it("opens an agent's own chat in Agents", () => {
    // w6's two agents are rows of their own, in the list's order: the one
    // working (p2) above the idle one.
    const found = rows('api', 'agents');
    const first = found.find((row) => row.kind === 'chat');
    expect(first !== undefined && chatRowTarget(first)).toEqual(expect.objectContaining({ workspaceId: 'w6', paneId: 'w6:p2' }));
    expect(firstChatRow(found)).toEqual({
      connectionId: 'demo', workspaceId: 'w6', title: 'Save button wrap', paneId: 'w6:p2', sig: '66666666-6666-4666-8666-666666666662',
    });
  });

  // The inbox on: a settled chat sits on the Settled shelf, under its
  // header, and is still the conversation Return opens when it is all the
  // search finds.
  it('looks past a shelf header in the inbox', () => {
    const settled: InboxContext<ListedChat> = {
      ...pinning([]), enabled: true,
      facts: (summary) => chatFacts(summary, { pref: { ...NO_INBOX_PREF, settledAt: 1 } }),
    };
    const found = chatListRows('spaces', summaries, 'Release notes', settled, true);
    expect(found[0]?.kind).toBe('shelf');
    expect(firstChatRow(found)?.workspaceId).toBe('w2');
  });

  it('is null with no chat in the rows', () => {
    expect(firstChatRow([])).toBeNull();
    expect(firstChatRow(rows('no chat is called this'))).toBeNull();
    // Only headers, tab dividers and terminal rows.
    expect(firstChatRow(rows('').filter((row) => row.kind !== 'chat' && row.kind !== 'pane'))).toBeNull();
  });
});

describe('chatRowTarget', () => {
  it('opens nothing from a header, a tab divider or a terminal row', () => {
    for (const row of rows('')) {
      if (row.kind === 'group' || row.kind === 'tab' || row.kind === 'terminal') expect(chatRowTarget(row)).toBeNull();
    }
  });
});
