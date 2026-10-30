import { useSQLiteContext } from 'expo-sqlite';

import { showActionSheet } from '@/components/ActionSheet';
import { ActionRow, Divider, Section } from '@/components/SettingsList';
import { Toggle } from '@/components/Toggle';
import { SETTLE_AFTER_DAYS, settleAfterLabel } from '@/lib/inbox/autoSettle';
import { saveSetting } from '@/state/saveSetting';
import { useSettings } from '@/state/settings';

/**
 * The chats list as an inbox (`src/lib/inbox`): whether working chats wait
 * under the list, and when an untouched chat settles by itself.
 */
export function InboxSection() {
  const db = useSQLiteContext();
  const hideWorking = useSettings((state) => state.hideWorking);
  const settleAfterDays = useSettings((state) => state.settleAfterDays);
  return (
    <Section title="Inbox">
      <Toggle
        label="Hide chats while they work"
        detail="Working chats wait under the list and come back to the top when they finish."
        value={hideWorking}
        onChange={(next) => saveSetting(db, 'hideWorking', next)}
        testID="toggle-hide-working"
      />
      <Divider />
      <ActionRow
        label="Settle untouched chats"
        detail={settleAfterLabel(settleAfterDays)}
        testID="settle-after"
        onPress={() => showActionSheet({
          title: 'Settle untouched chats',
          message: 'A chat nothing has happened to for this long moves to Settled. It comes back when something does.',
          actions: SETTLE_AFTER_DAYS.map((days) => ({
            label: days === settleAfterDays ? `${settleAfterLabel(days)} ✓` : settleAfterLabel(days),
            onPress: () => saveSetting(db, 'settleAfterDays', days),
          })),
        })}
      />
    </Section>
  );
}
