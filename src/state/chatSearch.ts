import { create } from 'zustand';

/**
 * What the keyboard asks of the chats list's search field (Command-F, Esc),
 * from outside the list: the shortcut lives around the whole screen, the
 * field inside the list.
 *
 * Counters rather than flags: each request is an event, and the field acts on
 * each change it hears (`ChatSearch` subscribes), so asking twice works twice
 * and nothing has to be reset. `focused` goes the other way, the field saying
 * it has focus, so Esc is offered only then.
 */
export const useChatSearch = create<{
  focusRequests: number;
  clearRequests: number;
  focused: boolean;
  /** Put the cursor in the search field. */
  requestFocus: () => void;
  /** Empty the search and leave the field. */
  clear: () => void;
  setFocused: (focused: boolean) => void;
}>((set) => ({
  focusRequests: 0,
  clearRequests: 0,
  focused: false,
  requestFocus: () => set((state) => ({ focusRequests: state.focusRequests + 1 })),
  clear: () => set((state) => ({ clearRequests: state.clearRequests + 1 })),
  setFocused: (focused) => set({ focused }),
}));
