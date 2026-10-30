import { create } from 'zustand';

/**
 * The custom snooze sheet's request and answer. The sheet is a route, and a
 * value handed back with `router.setParams` after `router.back()` lands on the
 * route being left, so the chat's snooze goes through here: the list opens
 * the sheet with what to call it and what to do with a time, and the sheet
 * picks one or cancels.
 */
export interface CustomSnoozeRequest {
  /** The chat's title, which the sheet names. */
  title: string;
  apply: (until: number) => void;
}

interface CustomSnoozeState {
  request: CustomSnoozeRequest | null;
  open: (request: CustomSnoozeRequest) => void;
  pick: (until: number) => void;
  cancel: () => void;
}

export const useCustomSnooze = create<CustomSnoozeState>((set, get) => ({
  request: null,
  open: (request) => set({ request }),
  pick: (until) => {
    const request = get().request;
    set({ request: null });
    request?.apply(until);
  },
  cancel: () => set({ request: null }),
}));
