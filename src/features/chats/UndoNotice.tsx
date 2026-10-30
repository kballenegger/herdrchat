import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { useUndoNotice } from '@/state/undoNotice';
import { useTheme } from '@/theme/ThemeProvider';
import { inbox, minTouchTarget, radius, screenPadding, spacing } from '@/theme/tokens';

/**
 * "Settled · Undo": a bar at the bottom of the chats list after a chat is
 * settled or snoozed, for `inbox.undoNotice`. Undo puts the chat back exactly
 * as it was (`useUndoNotice`); the next settle or snooze replaces the notice.
 *
 * Settling is meant to be quick and to cost nothing, which is only true if a
 * settle by mistake is one tap from undone.
 */
export function UndoNotice() {
  const notice = useUndoNotice((state) => state.notice);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => useUndoNotice.getState().dismiss(notice.id), inbox.undoNotice);
    return () => clearTimeout(timer);
  }, [notice]);

  if (notice === null) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: screenPadding, right: screenPadding, bottom: insets.bottom + inbox.undoLift }}>
      <View
        testID="undo-notice"
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: spacing.md,
          paddingLeft: spacing.lg, paddingRight: spacing.sm, minHeight: minTouchTarget,
          borderRadius: radius.md, backgroundColor: colors.secondarySystemBackground,
          borderWidth: 1, borderColor: colors.separator,
        }}>
        <Text variant="subhead" numberOfLines={1} style={{ flex: 1 }} testID="undo-notice-message">{notice.message}</Text>
        <Pressable
          onPress={() => useUndoNotice.getState().undo()}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          hitSlop={spacing.sm}
          testID="undo-notice-undo"
          style={({ pressed }) => ({ minHeight: minTouchTarget, justifyContent: 'center', paddingHorizontal: spacing.sm, opacity: pressed ? inbox.pressedOpacity : 1 })}>
          <Text variant="subhead" weight="600" color="tint">Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}
