import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { showActionSheet } from '@/components/ActionSheet';
import { haptics } from '@/components/haptics';
import { stampAt } from '@/lib/inbox/rules';
import { snoozePresets, whenLabel } from '@/lib/inbox/snooze';
import { useCustomSnooze } from '@/state/customSnooze';
import { useUndoNotice } from '@/state/undoNotice';
import type { PrefRow, PrefSnapshot, useChatPrefs } from './useChatPrefs';

/** What a row's inbox actions need: where its pref is filed, and what to call it. */
export interface InboxTarget {
  row: PrefRow;
  title: string;
  /**
   * The last message of what is settled or snoozed (for an agent of several,
   * its workspace's), by the host's clock: a choice is stamped no earlier
   * than it (`stampAt`), so a host clock ahead of the phone's does not undo
   * it at once.
   */
  preview: { timestamp: number | null } | null;
}

/**
 * Settle, snooze and their way back, on a row's own pref, as the swipe, the
 * long-press menu and VoiceOver's actions all reach them.
 *
 * Settle and Snooze leave an Undo behind (`useUndoNotice`), which writes back
 * exactly what was there, the pin they took off included. Unsettle and Wake
 * are the undoing of those two, and need none.
 */
export function useInboxActions(prefs: ReturnType<typeof useChatPrefs>): {
  settle: (target: InboxTarget) => void;
  unsettle: (target: InboxTarget) => void;
  /** The snooze sheet: the presets, then "Custom…". */
  snooze: (target: InboxTarget) => void;
  snoozeUntil: (target: InboxTarget, until: number) => void;
  wake: (target: InboxTarget) => void;
  /** "Don't settle automatically" and back. */
  setAutoSettle: (target: InboxTarget, on: boolean) => void;
} {
  const router = useRouter();
  const { changeInbox, restore } = prefs;
  const offerUndo = useCallback(
    (message: string, snapshot: PrefSnapshot | null) => {
      if (snapshot === null) return;
      useUndoNotice.getState().show(message, () => void restore(snapshot));
    },
    [restore]
  );

  const settle = useCallback(
    ({ row, preview }: InboxTarget) => {
      haptics.selection();
      void changeInbox(row, { settledAt: stampAt(Date.now(), preview), settledReason: 'user', snoozedUntil: null, snoozedAt: null }, { unpin: true })
        .then((snapshot) => offerUndo('Settled', snapshot));
    },
    [changeInbox, offerUndo]
  );

  const unsettle = useCallback(
    ({ row, preview }: InboxTarget) => {
      haptics.selection();
      void changeInbox(row, { settledAt: null, settledReason: null, unsettledAt: stampAt(Date.now(), preview) });
    },
    [changeInbox]
  );

  const snoozeUntil = useCallback(
    ({ row, preview }: InboxTarget, until: number) => {
      haptics.selection();
      const now = Date.now();
      void changeInbox(row, { snoozedUntil: until, snoozedAt: stampAt(now, preview), settledAt: null, settledReason: null }, { unpin: true })
        .then((snapshot) => offerUndo(`Snoozed until ${whenLabel(until, now, false)}`, snapshot));
    },
    [changeInbox, offerUndo]
  );

  const snooze = useCallback(
    (target: InboxTarget) => {
      haptics.medium();
      const presets = snoozePresets(Date.now());
      showActionSheet({
        title: `Snooze ${target.title}`,
        actions: [
          ...presets.map((preset) => ({
            label: `${preset.label} · ${preset.whenLabel}`,
            onPress: () => snoozeUntil(target, preset.at),
          })),
          {
            label: 'Custom…',
            onPress: () => {
              useCustomSnooze.getState().open({ title: target.title, apply: (until) => snoozeUntil(target, until) });
              router.push('/snooze');
            },
          },
        ],
      });
    },
    [snoozeUntil, router]
  );

  const wake = useCallback(
    ({ row }: InboxTarget) => {
      haptics.selection();
      // The snooze ends now: it woke, and is marked so until it is opened.
      void changeInbox(row, { snoozedUntil: Date.now() });
    },
    [changeInbox]
  );

  const setAutoSettle = useCallback(
    ({ row }: InboxTarget, on: boolean) => {
      haptics.selection();
      void changeInbox(row, { autoSettle: on });
    },
    [changeInbox]
  );

  return { settle, unsettle, snooze, snoozeUntil, wake, setAutoSettle };
}
