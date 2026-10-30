import { fullSwipeLine, isFullSwipe } from '../swipe';

// The tokens' values (`inbox.fullSwipe`, `inbox.fullSwipeMargin`), restated:
// `src/lib` imports nothing from the theme.
const options = { fraction: 0.58, margin: 44 };
const ACTION = 76;

// An iPhone 17 Pro's row (402 pt less two 20 pt gutters) with Settle and
// Snooze: the line was at 40% of the row, 145 px, inside the 152 px panel,
// so opening the panel far enough to read Snooze settled the chat.
it('puts the line past a two-action panel on a phone', () => {
  const row = 362;
  const panel = 2 * ACTION;
  const line = fullSwipeLine(row, panel, options);
  expect(line).toBeGreaterThanOrEqual(panel + 44);
  expect(line).toBeCloseTo(row * 0.58);
  // Dragged to show both actions in full, and a little more: no commit.
  expect(isFullSwipe(-(panel + 10), row, panel, options)).toBe(false);
  expect(isFullSwipe(-(line + 1), row, panel, options)).toBe(true);
  // And reachable: the row follows the finger (friction 1), so the line is
  // inside the row's own width.
  expect(line).toBeLessThan(row);
});

it('is a fraction of a wide row, as on iPad', () => {
  expect(fullSwipeLine(700, 2 * ACTION, options)).toBeCloseTo(406);
  expect(fullSwipeLine(700, ACTION, options)).toBeCloseTo(406);
});

it('never commits before the row has been measured', () => {
  expect(isFullSwipe(-1000, 0, ACTION, options)).toBe(false);
});
