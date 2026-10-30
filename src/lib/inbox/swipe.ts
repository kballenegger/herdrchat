/**
 * How far a trailing swipe must be dragged to commit its first action without
 * a tap (Settle, Unsettle, Wake), as Mail's full swipe does.
 *
 * A fraction of the row, and never short of the open panel plus a margin: on
 * a phone a two-action panel is most of the way to a fraction of the row, and
 * a line inside the panel settled a chat that was only being opened to reach
 * Snooze. Past the panel, a drag that stops where the actions are shown in
 * full never commits.
 */
export function fullSwipeLine(rowWidth: number, panelWidth: number, options: { fraction: number; margin: number }): number {
  return Math.max(panelWidth + options.margin, rowWidth * options.fraction);
}

/** Whether a drag that went `peak` px (negative: trailing) commits the first action. */
export function isFullSwipe(peak: number, rowWidth: number, panelWidth: number, options: { fraction: number; margin: number }): boolean {
  return rowWidth > 0 && -peak > fullSwipeLine(rowWidth, panelWidth, options);
}
