import { decodeSettleAfterDays, settleAfterLabel, shouldAutoSettle } from '../autoSettle';
import { NO_INBOX_PREF, type InboxFacts, type InboxPref } from '../inbox';
import { inboxRule, stampAt } from '../rules';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const facts = (overrides: Partial<Omit<InboxFacts, 'pref'>> & { pref?: Partial<InboxPref> } = {}): InboxFacts => ({
  status: 'idle', preview: { timestamp: NOW - 4 * DAY, fromUser: false }, openedAt: null, returnedAt: null, activeSince: null, working: false, canHide: true,
  ...overrides,
  pref: { ...NO_INBOX_PREF, ...overrides.pref },
});

describe('shouldAutoSettle', () => {
  it('settles a chat untouched for longer than the setting', () => {
    expect(shouldAutoSettle(facts(), 3, NOW)).toBe(true);
    expect(shouldAutoSettle(facts(), 7, NOW)).toBe(false);
  });

  it('does nothing with the setting off', () => {
    expect(shouldAutoSettle(facts(), 0, NOW)).toBe(false);
  });

  it('leaves alone a chat that is pinned, settled, snoozed, told to stay, working or asking', () => {
    expect(shouldAutoSettle(facts({ pref: { pinnedAt: 1 } }), 3, NOW)).toBe(false);
    expect(shouldAutoSettle(facts({ pref: { settledAt: 1 } }), 3, NOW)).toBe(false);
    expect(shouldAutoSettle(facts({ pref: { snoozedUntil: NOW + DAY, snoozedAt: NOW - 5 * DAY } }), 3, NOW)).toBe(false);
    expect(shouldAutoSettle(facts({ pref: { autoSettle: false } }), 3, NOW)).toBe(false);
    expect(shouldAutoSettle(facts({ status: 'working', working: true }), 3, NOW)).toBe(false);
    expect(shouldAutoSettle(facts({ working: true }), 3, NOW)).toBe(false);
    expect(shouldAutoSettle(facts({ status: 'blocked' }), 3, NOW)).toBe(false);
  });

  it('counts any recent touch: a return, coming off the shelf, a wake', () => {
    expect(shouldAutoSettle(facts({ returnedAt: NOW - DAY }), 3, NOW)).toBe(false);
    expect(shouldAutoSettle(facts({ pref: { unsettledAt: NOW - DAY } }), 3, NOW)).toBe(false);
    expect(shouldAutoSettle(facts({ pref: { snoozedUntil: NOW - DAY, snoozedAt: NOW - 5 * DAY } }), 3, NOW)).toBe(false);
  });

  it('leaves alone a chat with no time to go by', () => {
    expect(shouldAutoSettle(facts({ preview: null }), 1, NOW)).toBe(false);
  });
});

describe('inboxRule', () => {
  const options = { settleAfterDays: 3 as const, allowAutoSettle: true };

  it('takes a settled chat off the shelf when something happened to it, once', () => {
    const settled = facts({ status: 'working', activeSince: NOW - 1000, pref: { settledAt: NOW - DAY, settledReason: 'user' } });
    const change = inboxRule(settled, NOW, options);
    expect(change).toEqual({ settledAt: null, settledReason: null, unsettledAt: NOW });
    // Applied, the rule asks for nothing more.
    expect(inboxRule({ ...settled, pref: { ...settled.pref, ...change } }, NOW, options)).toBeNull();
  });

  it('wakes a snoozed chat that started asking, and not one that finished', () => {
    const pref = { snoozedUntil: NOW + DAY, snoozedAt: NOW - DAY };
    expect(inboxRule(facts({ status: 'blocked', preview: null, pref }), NOW, options)).toEqual({ snoozedUntil: NOW });
    expect(inboxRule(facts({ status: 'done', preview: null, pref }), NOW, options)).toBeNull();
  });

  // The host's clock ahead of the phone's: the agent's last line is stamped
  // a little in the phone's future. A settle stamped with the phone's time
  // alone would be older than it, and the chat would come straight back.
  it('stamps a settle no earlier than the last message, so a fast host clock does not undo it', () => {
    const ahead = NOW + 90_000;
    expect(stampAt(NOW, { timestamp: ahead })).toBe(ahead);
    expect(stampAt(NOW, { timestamp: NOW - DAY })).toBe(NOW);
    expect(stampAt(NOW, null)).toBe(NOW);
    const settled = facts({ preview: { timestamp: ahead, fromUser: false }, pref: { settledAt: stampAt(NOW, { timestamp: ahead }), settledReason: 'user' } });
    expect(inboxRule(settled, NOW, options)).toBeNull();
    // Stamped by the phone alone, it bounced.
    expect(inboxRule({ ...settled, pref: { ...settled.pref, settledAt: NOW } }, NOW, options)).toMatchObject({ settledAt: null });
    // And the rule's own stamps follow the same rule.
    const working = facts({ status: 'working', activeSince: NOW - 1000, preview: { timestamp: ahead, fromUser: false }, pref: { settledAt: NOW - DAY, settledReason: 'user' } });
    expect(inboxRule(working, NOW, options)).toMatchObject({ unsettledAt: ahead });
  });

  it('settles an untouched chat as `auto`, only when allowed', () => {
    expect(inboxRule(facts(), NOW, options)).toEqual({ settledAt: NOW, settledReason: 'auto' });
    expect(inboxRule(facts(), NOW, { ...options, allowAutoSettle: false })).toBeNull();
    expect(inboxRule(facts({ pref: { settledAt: NOW, settledReason: 'auto' } }), NOW, options)).toBeNull();
  });
});

it('decodes the setting and names each choice', () => {
  expect(decodeSettleAfterDays(null)).toBe(3);
  expect(decodeSettleAfterDays('0')).toBe(0);
  expect(decodeSettleAfterDays('14')).toBe(14);
  expect(decodeSettleAfterDays('5')).toBe(3);
  expect(decodeSettleAfterDays('nope')).toBe(3);
  expect([0, 1, 3, 7, 14].map((days) => settleAfterLabel(days as 0))).toEqual(['Off', 'After 1 day', 'After 3 days', 'After a week', 'After two weeks']);
});
