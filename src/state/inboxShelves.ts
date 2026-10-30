import { create } from 'zustand';

import { DEFAULT_SHELVES, type ShelfId, type ShelfState } from '@/lib/inbox/inbox';

/**
 * Which inbox shelves are open, and how many pages of Settled are shown. For
 * the session only, like the agents bar: Working and Snoozed are shut again
 * and Settled is back to one page on the next launch.
 */
interface InboxShelvesState extends ShelfState {
  toggle: (id: ShelfId) => void;
  /** Settled's "Show N more": the next page. */
  showMore: () => void;
}

export const useInboxShelves = create<InboxShelvesState>((set) => ({
  ...DEFAULT_SHELVES,
  toggle: (id) => set((state) => ({
    expanded: { ...state.expanded, [id]: !state.expanded[id] },
    // Shut, Settled goes back to its first page.
    settledPages: id === 'settled' ? 1 : state.settledPages,
  })),
  showMore: () => set((state) => ({ settledPages: state.settledPages + 1 })),
}));
