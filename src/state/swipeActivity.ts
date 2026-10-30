import { create } from 'zustand';

/**
 * The chat rows being swiped, or with their actions open, by test key. The
 * inbox does not settle chats by itself meanwhile: a row moving to another
 * shelf under a finger would take the panel with it. By row rather than a
 * count, so a row recycled while open (which closes it without a close
 * event) cannot leave the list thinking a swipe never ended.
 */
interface SwipeActivityState {
  rows: ReadonlySet<string>;
  began: (row: string) => void;
  ended: (row: string) => void;
}

export const useSwipeActivity = create<SwipeActivityState>((set) => ({
  rows: new Set(),
  began: (row) => set((state) => (state.rows.has(row) ? state : { rows: new Set([...state.rows, row]) })),
  ended: (row) => set((state) => {
    if (!state.rows.has(row)) return state;
    const rows = new Set(state.rows);
    rows.delete(row);
    return { rows };
  }),
}));
