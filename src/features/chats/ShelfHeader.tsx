import { Pressable, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import type { ShelfId } from '@/lib/inbox/inbox';
import { useTheme } from '@/theme/ThemeProvider';
import { inbox, minTouchTarget, size, spacing } from '@/theme/tokens';

/**
 * A shelf's header under the inbox: "Working · 2", with a chevron that says
 * whether it is open. Tapping it opens or shuts the shelf. Working and Snoozed
 * start shut, so the inbox is what you see; Settled starts open.
 */
export function ShelfHeader({ id, title, count, expanded, onPress }: {
  id: ShelfId;
  title: string;
  count: number;
  expanded: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const label = `${title} · ${count}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={expanded ? `Hides the ${title.toLowerCase()} chats` : `Shows the ${title.toLowerCase()} chats`}
      accessibilityState={{ expanded }}
      testID={`inbox-shelf-${id}`}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
        minHeight: minTouchTarget, paddingVertical: spacing.sm, opacity: pressed ? inbox.pressedOpacity : 1,
      })}>
      <Icon
        name={expanded ? 'chevron.down' : 'chevron.right'}
        size={size.rowChevron}
        tintColor={colors.secondaryLabel}
        fallback={<Text variant="caption" color="secondary">{expanded ? '▾' : '▸'}</Text>}
      />
      <Text variant="footnote" weight="600" color="secondary">{label}</Text>
      <View style={{ height: 1, flex: 1, backgroundColor: colors.separator }} />
    </Pressable>
  );
}

/** Settled's "Show N more": the next page of settled chats. */
export function ShowMoreRow({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Show ${count} more`}
      testID="inbox-settled-more"
      style={({ pressed }) => ({ minHeight: minTouchTarget, justifyContent: 'center', alignItems: 'center', opacity: pressed ? inbox.pressedOpacity : 1 })}>
      <Text variant="footnote" color="tint">Show {count} more</Text>
    </Pressable>
  );
}

/**
 * "All clear": nothing in the inbox while the shelves hold chats. A quiet
 * line where the inbox would be, not the full-screen empty state, which is
 * for a host with no workspaces at all.
 */
export function AllClearRow() {
  return (
    <View
      accessible
      accessibilityLabel="All clear"
      testID="inbox-clear"
      style={{ minHeight: minTouchTarget, justifyContent: 'center', alignItems: 'center' }}>
      <Text variant="footnote" color="secondary">All clear</Text>
    </View>
  );
}
