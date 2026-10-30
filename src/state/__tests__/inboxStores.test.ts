import { useCustomSnooze } from '../customSnooze';
import { useInboxShelves } from '../inboxShelves';
import { useSwipeActivity } from '../swipeActivity';
import { useUndoNotice } from '../undoNotice';

describe('the undo notice', () => {
  afterEach(() => useUndoNotice.setState({ notice: null }));

  it('runs the pending undo once and puts the notice away', () => {
    const undo = jest.fn();
    useUndoNotice.getState().show('Settled', undo);
    expect(useUndoNotice.getState().notice?.message).toBe('Settled');
    useUndoNotice.getState().undo();
    useUndoNotice.getState().undo();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(useUndoNotice.getState().notice).toBeNull();
  });

  // The next settle replaces the notice, and the old one's timer must not
  // take the new one away.
  it('is replaced by the next action, whose notice an old timer leaves alone', () => {
    const first = jest.fn();
    const second = jest.fn();
    useUndoNotice.getState().show('Settled', first);
    const old = useUndoNotice.getState().notice?.id;
    useUndoNotice.getState().show('Snoozed until 6:00 PM', second);
    useUndoNotice.getState().dismiss(old);
    expect(useUndoNotice.getState().notice?.message).toBe('Snoozed until 6:00 PM');
    useUndoNotice.getState().undo();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('the shelves', () => {
  afterEach(() => useInboxShelves.setState({ expanded: { working: false, snoozed: false, settled: true }, settledPages: 1 }));

  it('starts Working and Snoozed shut and Settled open, and opens a shelf when asked', () => {
    expect(useInboxShelves.getState().expanded).toEqual({ working: false, snoozed: false, settled: true });
    useInboxShelves.getState().toggle('working');
    expect(useInboxShelves.getState().expanded.working).toBe(true);
  });

  it('pages Settled, and back to its first page when shut', () => {
    useInboxShelves.getState().showMore();
    useInboxShelves.getState().showMore();
    expect(useInboxShelves.getState().settledPages).toBe(3);
    useInboxShelves.getState().toggle('settled');
    expect(useInboxShelves.getState().settledPages).toBe(1);
  });
});

describe('the custom snooze', () => {
  it('hands the picked time to the request, once', () => {
    const apply = jest.fn();
    useCustomSnooze.getState().open({ title: 'notes', apply });
    useCustomSnooze.getState().pick(1234);
    useCustomSnooze.getState().pick(5678);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(1234);
  });

  it('does nothing when cancelled', () => {
    const apply = jest.fn();
    useCustomSnooze.getState().open({ title: 'notes', apply });
    useCustomSnooze.getState().cancel();
    useCustomSnooze.getState().pick(1);
    expect(apply).not.toHaveBeenCalled();
  });
});

it('knows a swipe is under way until that row ends it', () => {
  useSwipeActivity.getState().began('w1');
  useSwipeActivity.getState().began('w1');
  useSwipeActivity.getState().began('w2');
  useSwipeActivity.getState().ended('w1');
  expect(useSwipeActivity.getState().rows.size).toBe(1);
  useSwipeActivity.getState().ended('w2');
  expect(useSwipeActivity.getState().rows.size).toBe(0);
});
