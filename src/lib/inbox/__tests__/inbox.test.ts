import {
  DEFAULT_SHELVES,
  NO_INBOX_PREF,
  SETTLED_PAGE,
  inboxEntries,
  inboxLayout,
  isSettled,
  isSnoozed,
  returnTime,
  sectionOf,
  showsWoke,
  wokeAt,
  type InboxFacts,
  type InboxLayout,
  type InboxPref,
} from '../inbox';

const NOW = 1_000_000_000;
const HOUR = 3_600_000;

interface Chat { id: string; facts: InboxFacts }
const chat = (id: string, facts: Partial<Omit<InboxFacts, 'pref'>> & { pref?: Partial<InboxPref> } = {}): Chat => ({
  id,
  facts: {
    status: 'idle', preview: null, openedAt: null, returnedAt: null, activeSince: null, working: false, canHide: true,
    ...facts,
    pref: { ...NO_INBOX_PREF, ...facts.pref },
  },
});
const at = (timestamp: number, fromUser = false) => ({ timestamp, fromUser });
const layoutOf = (chats: readonly Chat[], hideWorking = true, now = NOW) =>
  inboxLayout(chats, (item) => item.facts, { now, hideWorking });
const ids = (layout: InboxLayout<Chat>) => Object.fromEntries(
  Object.entries(layout).map(([section, rows]) => [section, (rows as { item: Chat }[]).map((row) => row.item.id)])
);

it('orders the inbox by when each chat last came back, newest first, ties in the host\'s order', () => {
  const layout = layoutOf([
    chat('old', { preview: at(NOW - 5 * HOUR) }),
    chat('none-a'),
    chat('returned', { preview: at(NOW - 9 * HOUR), returnedAt: NOW - HOUR }),
    chat('none-b'),
    chat('unsettled', { pref: { unsettledAt: NOW - 2 * HOUR } }),
  ]);
  expect(ids(layout).inbox).toEqual(['returned', 'unsettled', 'old', 'none-a', 'none-b']);
});

// A question pops to the top: the tracker records the moment a chat starts
// asking as its return.
it('puts a chat that just started asking at the top', () => {
  const layout = layoutOf([
    chat('recent', { preview: at(NOW - 60_000) }),
    chat('asking', { status: 'blocked', preview: at(NOW - 10 * HOUR), returnedAt: NOW, activeSince: NOW }),
  ]);
  expect(ids(layout).inbox).toEqual(['asking', 'recent']);
});

it('keeps pinned chats in pin order, and never moves one by itself', () => {
  const layout = layoutOf([
    chat('b', { pref: { pinnedAt: 20 }, status: 'working', working: true }),
    chat('a', { pref: { pinnedAt: 10, settledAt: NOW - HOUR } }),
    chat('c', { pref: { pinnedAt: 30, snoozedUntil: NOW + HOUR, snoozedAt: NOW - HOUR } }),
  ]);
  expect(ids(layout)).toEqual({ pinned: ['a', 'b', 'c'], inbox: [], working: [], snoozed: [], settled: [] });
});

it('hides working chats on the Working shelf when the setting is on, and lists them when it is off', () => {
  const chats = [
    chat('busy', { status: 'working', working: true, preview: at(NOW - HOUR, true) }),
    chat('grace', { status: 'idle', working: true }),
    chat('space', { status: 'working', working: true, canHide: false }),
    chat('idle', { preview: at(NOW - 2 * HOUR) }),
  ];
  expect(ids(layoutOf(chats, true))).toMatchObject({ inbox: ['idle', 'space'], working: ['busy', 'grace'] });
  // Off: in the inbox by return time, a working chat's being its last message.
  expect(ids(layoutOf(chats, false)).inbox).toEqual(['busy', 'idle', 'grace', 'space']);
});

it('never holds a chat that is asking on the Working shelf', () => {
  expect(sectionOf(chat('x', { status: 'blocked', working: true }).facts, NOW, true)).toBe('inbox');
});

describe('snoozed', () => {
  const snoozed = { snoozedUntil: NOW + HOUR, snoozedAt: NOW - HOUR };

  it('lists a snoozed chat on its shelf, soonest to wake first', () => {
    const layout = layoutOf([
      chat('later', { pref: { snoozedUntil: NOW + 3 * HOUR, snoozedAt: NOW - HOUR } }),
      chat('sooner', { pref: snoozed }),
    ]);
    expect(ids(layout).snoozed).toEqual(['sooner', 'later']);
  });

  it('wakes early when it starts asking, and not when a run finishes', () => {
    expect(isSnoozed(chat('x', { status: 'blocked', pref: snoozed }).facts, NOW)).toBe(false);
    expect(isSnoozed(chat('x', { status: 'done', pref: snoozed }).facts, NOW)).toBe(true);
    expect(isSnoozed(chat('x', { status: 'idle', preview: at(NOW), pref: snoozed }).facts, NOW)).toBe(true);
    // A working snoozed chat stays snoozed, not on the Working shelf.
    expect(sectionOf(chat('x', { status: 'working', working: true, pref: snoozed }).facts, NOW, true)).toBe('snoozed');
  });

  it('returns at the top when its time comes, marked "Woke" until it is opened', () => {
    const woke = chat('woke', { preview: at(NOW - 10 * HOUR), pref: { snoozedUntil: NOW - 60_000, snoozedAt: NOW - HOUR } });
    const layout = layoutOf([chat('recent', { preview: at(NOW - 5 * 60_000) }), woke]);
    expect(ids(layout).inbox).toEqual(['woke', 'recent']);
    expect(layout.inbox[0]?.woke).toBe(true);
    expect(layout.inbox[1]?.woke).toBe(false);
    expect(wokeAt(woke.facts, NOW)).toBe(NOW - 60_000);
    // Opened since it woke: no mark. Opened before: still marked.
    expect(showsWoke({ ...woke.facts, openedAt: NOW - 30_000 }, NOW)).toBe(false);
    expect(showsWoke({ ...woke.facts, openedAt: NOW - 2 * HOUR }, NOW)).toBe(true);
  });

  it('marks a chat that woke by asking, at the moment it started', () => {
    const asking = chat('asking', { status: 'blocked', activeSince: NOW - 1000, pref: snoozed });
    expect(wokeAt(asking.facts, NOW)).toBe(NOW - 1000);
    expect(layoutOf([asking]).inbox[0]?.woke).toBe(true);
    expect(returnTime(asking.facts, NOW)).toBe(NOW - 1000);
  });
});

describe('settled', () => {
  it('lists settled chats newest settled first', () => {
    const layout = layoutOf([
      chat('first', { pref: { settledAt: NOW - 3 * HOUR } }),
      chat('second', { pref: { settledAt: NOW - HOUR } }),
    ]);
    expect(ids(layout).settled).toEqual(['second', 'first']);
  });

  it('comes off the shelf when it starts working or asking after it was settled', () => {
    const pref = { settledAt: NOW - HOUR };
    expect(isSettled(chat('x', { status: 'working', activeSince: NOW - 60_000, pref }).facts)).toBe(false);
    expect(isSettled(chat('x', { status: 'blocked', activeSince: NOW - 60_000, pref }).facts)).toBe(false);
    // Already working when it was settled: it stays until something new happens.
    expect(isSettled(chat('x', { status: 'working', activeSince: NOW - 2 * HOUR, pref }).facts)).toBe(true);
  });

  it('comes off the shelf when the agent writes after it was settled, and not for your own message', () => {
    const pref = { settledAt: NOW - HOUR };
    expect(isSettled(chat('x', { preview: at(NOW - 60_000), pref }).facts)).toBe(false);
    expect(isSettled(chat('x', { preview: at(NOW - 60_000, true), pref }).facts)).toBe(true);
    expect(isSettled(chat('x', { preview: at(NOW - 2 * HOUR), pref }).facts)).toBe(true);
  });
});

describe('entries', () => {
  const settled = (count: number) => Array.from({ length: count }, (_, index) => chat(`s${index}`, { pref: { settledAt: NOW - index } }));
  const kinds = (entries: ReturnType<typeof inboxEntries>) => entries.map((entry) =>
    entry.kind === 'row' ? (entry.row.item as Chat).id : entry.kind === 'shelf' ? `${entry.id}:${entry.count}:${entry.expanded ? 'open' : 'shut'}`
      : entry.kind === 'more' ? `more:${entry.count}` : entry.kind === 'pinned-header' ? `pinned:${entry.count}` : 'clear');

  it('lists Pinned under its header, the inbox with none, then each shelf that holds chats', () => {
    const layout = layoutOf([
      chat('pin', { pref: { pinnedAt: 1 } }),
      chat('inbox'),
      chat('busy', { status: 'working', working: true }),
      chat('later', { pref: { snoozedUntil: NOW + HOUR, snoozedAt: NOW } }),
      chat('done', { pref: { settledAt: NOW } }),
    ]);
    expect(kinds(inboxEntries(layout, DEFAULT_SHELVES, false))).toEqual([
      'pinned:1', 'pin', 'inbox', 'working:1:shut', 'snoozed:1:shut', 'settled:1:open', 'done',
    ]);
    expect(kinds(inboxEntries(layoutOf([chat('inbox')]), DEFAULT_SHELVES, false))).toEqual(['inbox']);
  });

  it('opens a shelf when asked, and pages Settled', () => {
    const layout = layoutOf([chat('busy', { status: 'working', working: true }), ...settled(SETTLED_PAGE * 2 + 5)]);
    const open = { expanded: { working: true, snoozed: false, settled: true }, settledPages: 1 };
    const entries = kinds(inboxEntries(layout, open, false));
    expect(entries.slice(0, 3)).toEqual(['clear', 'working:1:open', 'busy']);
    expect(entries.filter((entry) => entry.startsWith('s') && !entry.startsWith('settled'))).toHaveLength(SETTLED_PAGE);
    expect(entries.at(-1)).toBe(`more:${SETTLED_PAGE}`);
    const two = kinds(inboxEntries(layout, { ...open, settledPages: 2 }, false));
    expect(two.at(-1)).toBe('more:5');
    expect(kinds(inboxEntries(layout, { ...open, settledPages: 3 }, false)).at(-1)).toBe(`s${SETTLED_PAGE * 2 + 4}`);
  });

  it('says "All clear" when the inbox is empty and shelves hold chats', () => {
    expect(kinds(inboxEntries(layoutOf([chat('done', { pref: { settledAt: NOW } })]), DEFAULT_SHELVES, false)))
      .toEqual(['clear', 'settled:1:open', 'done']);
    expect(inboxEntries(layoutOf([]), DEFAULT_SHELVES, false)).toEqual([]);
  });

  it('opens every shelf and lists every match while searching', () => {
    const layout = layoutOf([
      chat('busy', { status: 'working', working: true }),
      chat('later', { pref: { snoozedUntil: NOW + HOUR, snoozedAt: NOW } }),
      ...settled(SETTLED_PAGE + 1),
    ]);
    const entries = kinds(inboxEntries(layout, DEFAULT_SHELVES, true));
    expect(entries.slice(0, 4)).toEqual(['working:1:open', 'busy', 'snoozed:1:open', 'later']);
    expect(entries).not.toContain('clear');
    expect(entries.some((entry) => entry.startsWith('more'))).toBe(false);
    expect(entries).toHaveLength(4 + 1 + SETTLED_PAGE + 1);
  });
});
