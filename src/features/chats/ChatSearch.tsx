import { useEffect, useRef } from 'react';
import { TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useChatSearch } from '@/state/chatSearch';
import { useTheme } from '@/theme/ThemeProvider';
import { minTouchTarget, radius, screenPadding, spacing, typography } from '@/theme/tokens';

/**
 * The chat list's search field. Command-F puts the cursor in it and Esc
 * empties it and leaves it (`useChatSearch`, asked by `ChatsFind`); Return
 * calls `onSubmit`, which opens the first chat found.
 */
export function ChatSearch({ query, onChange, onSubmit, onEscape }: {
  query: string;
  onChange: (query: string) => void;
  onSubmit: () => void;
  /** Esc in the field: the field blurs itself, the list empties the search. */
  onEscape: () => void;
}) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  // Each request is an event from the store, heard as it happens rather than
  // read in a render: asking to focus twice focuses twice.
  useEffect(() => useChatSearch.subscribe((state, before) => {
    if (state.focusRequests !== before.focusRequests) input.current?.focus();
    if (state.clearRequests !== before.clearRequests) {
      onEscape();
      input.current?.blur();
    }
  }), [onEscape]);
  // Unmounted while focused (the host changed): no field holds Esc any more.
  useEffect(() => () => useChatSearch.getState().setFocused(false), []);
  return (
    <View style={{ paddingHorizontal: screenPadding, paddingBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.chatCard }}>
        <Icon name="magnifyingglass" tintColor={colors.secondaryLabel} />
        <TextInput
          ref={input}
          testID="chat-search"
          accessibilityLabel="Search chats"
          placeholder="Search chats"
          placeholderTextColor={colors.secondaryLabel}
          value={query}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          onFocus={() => useChatSearch.getState().setFocused(true)}
          onBlur={() => useChatSearch.getState().setFocused(false)}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={{ flex: 1, minWidth: 0, minHeight: minTouchTarget, paddingVertical: spacing.md, color: colors.label, fontSize: typography.body.fontSize }}
        />
      </View>
    </View>
  );
}
