import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { customSnoozeAt, parseTime, snoozeDays, whenLabel } from '@/lib/inbox/snooze';
import { useCustomSnooze } from '@/state/customSnooze';
import { useTheme } from '@/theme/ThemeProvider';
import { minTouchTarget, radius, screenPadding, spacing } from '@/theme/tokens';

/**
 * Snooze a chat until a time of your choosing: a day (today, tomorrow, the
 * next five by weekday) and a time typed as you would say it (`6pm`, `18:30`).
 *
 * The repo has no native date picker, and one day out of seven plus a typed
 * time covers what a snooze needs without adding one. The choice goes back
 * through `useCustomSnooze`, not route params: `router.setParams` after
 * `router.back()` would land on the route being left.
 */
export default function CustomSnoozeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const request = useCustomSnooze((state) => state.request);
  // The time the sheet opened at: days and "is it in the future" go by it.
  const [opened] = useState(() => Date.now());
  const days = snoozeDays(opened);
  const [day, setDay] = useState(0);
  const [time, setTime] = useState('');
  const minutes = parseTime(time);
  const until = minutes === null ? null : customSnoozeAt(opened, day, minutes);
  const canSnooze = request !== null && until !== null;

  const cancel = () => {
    useCustomSnooze.getState().cancel();
    router.back();
  };
  const snooze = () => {
    if (!canSnooze) return;
    useCustomSnooze.getState().pick(until);
    router.back();
  };

  return (
    <Screen presentation="form-sheet">
      <View style={{ padding: screenPadding, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: minTouchTarget }}>
          <Pressable onPress={cancel} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={spacing.sm} testID="snooze-cancel">
            <Text variant="body" color="tint">Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm }}>
            <Text variant="headline" numberOfLines={1}>Snooze {request?.title ?? ''}</Text>
          </View>
          <Pressable
            onPress={snooze}
            disabled={!canSnooze}
            accessibilityRole="button"
            accessibilityLabel="Snooze"
            accessibilityState={{ disabled: !canSnooze }}
            hitSlop={spacing.sm}
            testID="snooze-save">
            <Text variant="body" weight="600" color={canSnooze ? 'tint' : 'tertiary'}>Snooze</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
          {days.map((option) => {
            const selected = option.offset === day;
            return (
              <Pressable
                key={option.offset}
                onPress={() => setDay(option.offset)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                testID={`snooze-day-${option.offset}`}
                style={({ pressed }) => ({
                  minHeight: minTouchTarget, justifyContent: 'center', paddingHorizontal: spacing.md,
                  borderRadius: radius.full, borderWidth: 1,
                  borderColor: selected ? colors.tint : colors.separator,
                  backgroundColor: selected ? colors.tintMuted : pressed ? colors.fillSubtle : 'transparent',
                })}>
                <Text variant="subhead" color={selected ? 'tint' : 'label'}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Field
          label="Time"
          value={time}
          onChangeText={setTime}
          placeholder="6pm or 18:30"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={snooze}
          testID="snooze-time"
        />

        <Text variant="caption" color="secondary" testID="snooze-when">
          {until !== null ? `Comes back ${whenLabel(until, opened, false)}.`
            : minutes !== null ? 'That time has passed.' : 'It comes back then, or sooner if it asks you something.'}
        </Text>
      </View>
    </Screen>
  );
}
