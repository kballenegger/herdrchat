import { useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { FindShortcutView } from '../../../modules/herdr-keys/src/find';
import { useChatSearch } from '@/state/chatSearch';

/**
 * Command-F finds a chat, from anywhere on the chats screen: with nothing
 * focused, in the search field, or mid-prompt in the composer of the chat
 * open beside the list on iPad. It puts the cursor in the list's search
 * field; Esc there empties the search and leaves the field.
 *
 * Only while this screen is the one on top: a sheet over it (Settings,
 * Hosts) or a chat pushed on a phone keeps Command-F to itself. iOS only;
 * elsewhere it is a plain view.
 */
export function ChatsFind({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const searchFocused = useChatSearch((state) => state.focused);
  return (
    <FindShortcutView
      style={{ flex: 1 }}
      active={Platform.OS === 'ios' && focused}
      escape={searchFocused}
      onFind={() => useChatSearch.getState().requestFocus()}
      onEscape={() => useChatSearch.getState().clear()}>
      {children}
    </FindShortcutView>
  );
}
