import { useRecyclingState } from '@shopify/flash-list';
import { memo, useCallback, useRef, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import { haptics } from '@/components/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { inbox, minTouchTarget, radius, spacing } from '@/theme/tokens';
import { useSwipeActivity } from '@/state/swipeActivity';
import { fullSwipeLine, isFullSwipe } from '@/lib/inbox/swipe';
import type { LayoutAnchor } from '@/features/spaces/LayoutPeek';
import { ChatRow, type RowAction } from './ChatRow';
import { SpaceCard } from './SpaceCard';
import { rowTestKey, type HostRef } from './listedChat';
import { spaceTitle } from './rowText';
import type { ChatSummary } from './useWorkspaces';

/**
 * A chat row with swipe actions: Pin and Mute on the leading side, and on the
 * trailing one (`TrailingSwipe`) Rename and Close as Messages splits them, or
 * while the list is an inbox Settle and Snooze for a chat in the inbox,
 * Unsettle for a settled one, Wake for a snoozed one. An inbox swipe dragged
 * past the panel (`fullSwipeLine`) commits its first action without a tap,
 * as Mail's does.
 *
 * `ChatRow` stays presentational — it does not know it can be swiped, which is
 * what lets it keep being used wherever a row is drawn without one.
 *
 * The leading side is safe here because the chats list is the app's root (and the
 * iPad sidebar) with no back gesture to fight: a leading action would begin in
 * the left-edge strip an interactive pop owns. Reusing this row on a pushed
 * screen means dropping `onTogglePin` and `onToggleMute`, which removes them.
 *
 * Two actions a side, not more. Past three the panel is wider than the row's
 * text and the swipe stops being a shortcut.
 */
const ACTION_WIDTH = 76;

/** One trailing action: what it is called, its glyph, its colour, and what it does. */
export interface SwipeChoice {
  /** Names its test id (`swipe-action-settle`). */
  id: 'settle' | 'snooze' | 'unsettle' | 'wake' | 'rename' | 'close';
  label: string;
  /** What VoiceOver reads when `label` is shortened to fit the panel. */
  accessibilityLabel?: string;
  symbol: IconName;
  tone: Tone;
  run: () => void;
}

/**
 * The trailing side: its outer action, and maybe a second beside the row.
 * With `full`, dragging past the panel (`fullSwipeLine`) runs the outer one
 * without a tap: the inbox's Settle, Unsettle or Wake. Without it, the panel
 * only opens: Rename and Close, while the list is not an inbox, as they
 * always were (no full swipe ever closes a workspace).
 */
export interface TrailingSwipe {
  primary: SwipeChoice;
  secondary?: SwipeChoice;
  full: boolean;
}

const fullSwipeOptions = { fraction: inbox.fullSwipe, margin: inbox.fullSwipeMargin };

export const SwipeableChatRow = memo(function SwipeableChatRow({
  summary,
  testKey,
  unread,
  selected,
  onPress,
  onLongPress,
  trailing,
  actions = [],
  variant = 'card',
  trailingLabel,
  woke = false,
  pinned = false,
  muted = false,
  onTogglePin,
  onToggleMute,
  onSwiped,
  space,
}: {
  summary: ChatSummary & { host?: HostRef | null };
  /** What the row's testIDs are built from, when not its workspace's (`ChatRow`). */
  testKey?: string;
  unread: boolean;
  selected?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  /** Absent while the chat has no session to settle or snooze by. */
  trailing?: TrailingSwipe;
  /** Everything the swipes and the long press can do, for VoiceOver and Voice Control. */
  actions?: readonly RowAction[];
  /** `slim` for a settled or snoozed chat (`ChatRow`). */
  variant?: 'card' | 'slim';
  /** A slim row's right edge (`ChatRow.trailing`). */
  trailingLabel?: string;
  woke?: boolean;
  pinned?: boolean;
  muted?: boolean;
  /** Absent while the chat has no session to pin or mute by. */
  onTogglePin?: () => void;
  onToggleMute?: () => void;
  /**
   * The gesture was used. Opening the panel is enough — someone who swipes,
   * reads the two actions and swipes back has learned the gesture, and going on
   * hinting at it would be nagging about something they just did.
   */
  onSwiped: () => void;
  /**
   * Draw the workspace's space card instead of a chat (`spaceCardMode`):
   * tapping it shows its layout, `onPress` is unused. The swipe is the same.
   */
  space?: {
    onOpenLayout: (anchor: LayoutAnchor) => void;
    onHoverLayout?: (anchor: LayoutAnchor) => void;
    onLeaveLayout?: () => void;
  };
}) {
  const swipeable = useRef<SwipeableMethods>(null);

  /**
   * Snap the panel shut when this instance is recycled onto a different chat.
   *
   * FlashList reuses mounted components rather than remounting them, and the
   * swipeable keeps its open state internally — so a row left open, scrolled
   * past and recycled would come back open on an unrelated conversation, with
   * Rename and Close already under the reader's thumb.
   *
   * `reset()`, NOT `close()`, and the difference is visible. `close()` calls
   * `animateRow(0)`; `reset()` writes the shared values directly. Recycling is
   * not a gesture ending, it is a component becoming a different row — so an
   * animation there plays over content that has already changed. Closing a chat
   * shifts every row below it up by one, which recycles them all, and with
   * `close()` that showed as a blank gap where a row should be: the row's height
   * was reserved while its content was still animating in from off-screen.
   *
   * The state value is unused; `onReset` firing on a workspace-id change is the
   * whole point, and it is the hook FlashList ships for exactly this.
   */
  const key = testKey ?? rowTestKey(summary);
  useRecyclingState(false, [key], () => {
    swipeable.current?.reset();
    useSwipeActivity.getState().ended(key);
  });

  // How far the row has been dragged open this gesture, for the full swipe.
  const peak = useSharedValue(0);
  const width = useRef(0);
  const renderRightActions = useCallback(
    (_progress: unknown, translation: SharedValue<number>, methods: SwipeableMethods) => trailing === undefined ? null : (
      <ActionPanel
        side="right"
        count={trailing.secondary === undefined ? 1 : 2}
        seam={(trailing.secondary ?? trailing.primary).tone}
        translation={translation}
        peak={trailing.full ? peak : undefined}
        rowWidth={width.current}>
        {trailing.secondary !== undefined && (
          <SwipeAction
            id={trailing.secondary.id}
            label={trailing.secondary.label}
            accessibilityLabel={trailing.secondary.accessibilityLabel}
            symbol={trailing.secondary.symbol}
            tone={trailing.secondary.tone}
            onPress={() => {
              // Closed before acting, so returning from a sheet does not land
              // on a row still hanging open behind it.
              methods.close();
              trailing.secondary?.run();
            }}
          />
        )}
        <SwipeAction
          id={trailing.primary.id}
          label={trailing.primary.label}
          accessibilityLabel={trailing.primary.accessibilityLabel}
          symbol={trailing.primary.symbol}
          tone={trailing.primary.tone}
          onPress={() => {
            methods.close();
            trailing.primary.run();
          }}
        />
      </ActionPanel>
    ),
    [trailing, peak]
  );

  const leadingCount = (onTogglePin !== undefined ? 1 : 0) + (onToggleMute !== undefined ? 1 : 0);
  const renderLeftActions = useCallback(
    (_progress: unknown, translation: SharedValue<number>, methods: SwipeableMethods) => (
      <ActionPanel side="left" count={leadingCount} seam={onToggleMute !== undefined ? 'neutral' : 'tint'} translation={translation}>
        {onTogglePin !== undefined && (
          <SwipeAction
            label={pinned ? 'Unpin' : 'Pin'}
            symbol={pinned ? 'pin.slash' : 'pin.fill'}
            tone="tint"
            onPress={() => {
              methods.close();
              onTogglePin();
            }}
          />
        )}
        {onToggleMute !== undefined && (
          <SwipeAction
            label={muted ? 'Unmute' : 'Mute'}
            symbol={muted ? 'bell' : 'bell.slash'}
            tone="neutral"
            onPress={() => {
              methods.close();
              onToggleMute();
            }}
          />
        )}
      </ActionPanel>
    ),
    [pinned, muted, onTogglePin, onToggleMute, leadingCount]
  );
  const leading = leadingCount > 0;
  const anchor = useRef<View>(null);

  return (
    <ReanimatedSwipeable
      containerStyle={{ borderRadius: radius.sm, overflow: 'hidden', marginBottom: spacing.sm }}
      ref={swipeable}
      // Half the finger's travel, as it always was; but a row with a full
      // swipe follows the finger, or the line past the panel
      // (`fullSwipeLine`) would need a drag wider than the phone.
      friction={trailing?.full === true ? 1 : 2}
      // Both actions have to be reachable before the panel snaps open, so the
      // threshold is a fraction of the panel rather than the default half-width
      // of the whole row.
      rightThreshold={ACTION_WIDTH / 2}
      leftThreshold={ACTION_WIDTH / 2}
      // Past the panel on the trailing side is the full swipe.
      overshootRight={trailing?.full === true}
      overshootLeft={false}
      onSwipeableOpenStartDrag={() => {
        peak.set(0);
        useSwipeActivity.getState().began(key);
      }}
      onSwipeableClose={() => useSwipeActivity.getState().ended(key)}
      // The panel opening is the moment the gesture committed. Feeling it here
      // rather than on the action tap is what tells you the swipe worked while
      // your thumb is still covering the row.
      onSwipeableWillOpen={(direction) => {
        haptics.selection();
        onSwiped();
        // Dragged past the full-swipe line: the first action, no tap needed.
        if (direction === 'left' && trailing?.full === true
          && isFullSwipe(peak.get(), width.current, panelWidth(trailing), fullSwipeOptions)) {
          swipeable.current?.close();
          trailing.primary.run();
        }
      }}
      testID={`chat-swipe-${key}`}
      renderRightActions={trailing === undefined ? undefined : renderRightActions}
      renderLeftActions={leading ? renderLeftActions : undefined}>
      <View
        ref={anchor}
        collapsable={false}
        onLayout={(event) => {
          width.current = event.nativeEvent.layout.width;
        }}>
      {space === undefined || variant === 'slim' ? (
          <ChatRow
            summary={summary}
            testKey={key}
            unread={unread}
            selected={selected}
            onPress={space === undefined ? onPress : () => space.onOpenLayout(anchor)}
            onLongPress={onLongPress}
            pinned={pinned}
            muted={muted}
            actions={actions}
            variant={variant}
            title={space === undefined ? undefined : spaceTitle(summary)}
            trailing={trailingLabel}
            woke={woke}
          />
      ) : (
        <SpaceCard
          summary={summary}
          testKey={key}
          unread={unread}
          onOpenLayout={space.onOpenLayout}
          onHoverLayout={space.onHoverLayout}
          onLeaveLayout={space.onLeaveLayout}
          onLongPress={onLongPress}
          pinned={pinned}
          muted={muted}
          actions={actions}
          woke={woke}
        />
      )}
      </View>
    </ReanimatedSwipeable>
  );
});

/**
 * The actions, riding on the row's edge rather than lying under the row.
 *
 * The swipeable's own panel sits still while the row slides off it, so it
 * had to be drawn the whole time: it showed as a red sliver past the row's
 * rounded corner as the row settled, and through the row whenever the row
 * was translucent. Moved with the drag instead, the panel is off the edge
 * whenever the row is closed and enters exactly as far as the row leaves,
 * the way Mail's do.
 *
 * The seam carries the inner action's colour under the row's rounded corner
 * while the row is moved, so the card sits on the panel instead of beside it
 * with the list showing through the corner gap.
 */
function ActionPanel({
  side,
  count,
  seam,
  translation,
  peak,
  rowWidth = 0,
  children,
}: {
  side: 'left' | 'right';
  count: number;
  /** The tone of the action next to the row. */
  seam: Tone;
  translation: SharedValue<number>;
  /** Where the furthest drag of this gesture went (negative: trailing), for the full swipe. */
  peak?: SharedValue<number>;
  /** The row's width, which the full-swipe line is a fraction of. */
  rowWidth?: number;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const width = count * ACTION_WIDTH;
  const line = rowWidth > 0 ? fullSwipeLine(rowWidth, width, fullSwipeOptions) : 0;
  useAnimatedReaction(
    () => translation.get(),
    (value, previous) => {
      if (peak === undefined) return;
      if (value < peak.get()) peak.set(value);
      // Felt as the drag crosses the line, so a full swipe is known before the finger lifts.
      if (line > 0 && previous !== null && previous >= -line && value < -line) scheduleOnRN(haptics.medium);
    }
  );
  const style = useAnimatedStyle(() => {
    const offset = translation.get();
    return {
      transform: [
        { translateX: side === 'right' ? Math.max(0, width + offset) : Math.min(0, offset - width) },
      ],
    };
  });
  const seamStyle = useAnimatedStyle(() => ({ opacity: translation.get() === 0 ? 0 : 1 }));
  return (
    <Animated.View style={[{ flexDirection: 'row', width }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, bottom: 0, width: radius.sm, backgroundColor: toneBackground(colors, seam) },
          side === 'right' ? { left: -radius.sm } : { right: -radius.sm },
          seamStyle,
        ]}
      />
      {children}
    </Animated.View>
  );
}

export type Tone = 'neutral' | 'tint' | 'destructive';

/** How wide a trailing panel is: one action or two. */
function panelWidth(trailing: TrailingSwipe): number {
  return (trailing.secondary === undefined ? 1 : 2) * ACTION_WIDTH;
}

function toneBackground(colors: ReturnType<typeof useTheme>['colors'], tone: Tone): string {
  return tone === 'destructive' ? colors.destructive : tone === 'tint' ? colors.tint : colors.swipeNeutral;
}

function SwipeAction({
  id,
  label,
  accessibilityLabel,
  symbol,
  tone,
  onPress,
}: {
  /** Names the test id; defaults to the label. */
  id?: string;
  label: string;
  /** What VoiceOver reads when the visible label is shortened to fit. */
  accessibilityLabel?: string;
  symbol: IconName;
  tone: Tone;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const background = toneBackground(colors, tone);
  const foreground = tone === 'neutral' ? colors.label : colors.onTint;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={`swipe-action-${id ?? label.toLowerCase()}`}
      style={({ pressed }) => ({
        width: ACTION_WIDTH,
        // Stretches to the row's height rather than a fixed one: rows grow with
        // Dynamic Type, and a short action panel would leave a stripe of
        // background under it.
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.xxs,
        minHeight: minTouchTarget,
        backgroundColor: background,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Icon name={symbol} size={20} tintColor={foreground} />
      <Text variant="caption2" style={{ color: foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}
