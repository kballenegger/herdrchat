import { create } from 'zustand';

/**
 * The one pending undo: after Settle or Snooze, a notice at the bottom of the
 * list ("Settled · Undo") that puts the chat back exactly as it was, pin
 * included. The next action replaces it; it goes after `inbox.undoNotice`.
 */
export interface UndoNotice {
  /** Tells one notice from the next, so a timer for an old one clears nothing. */
  id: number;
  message: string;
  undo: () => void;
}

interface UndoNoticeState {
  notice: UndoNotice | null;
  show: (message: string, undo: () => void) => void;
  /** Without an id, whatever is showing; with one, only that notice. */
  dismiss: (id?: number) => void;
  /** Run the undo and put the notice away. */
  undo: () => void;
}

let nextId = 0;

export const useUndoNotice = create<UndoNoticeState>((set, get) => ({
  notice: null,
  show: (message, undo) => {
    nextId += 1;
    set({ notice: { id: nextId, message, undo } });
  },
  dismiss: (id) => {
    const current = get().notice;
    if (current === null || (id !== undefined && current.id !== id)) return;
    set({ notice: null });
  },
  undo: () => {
    const current = get().notice;
    if (current === null) return;
    set({ notice: null });
    current.undo();
  },
}));
