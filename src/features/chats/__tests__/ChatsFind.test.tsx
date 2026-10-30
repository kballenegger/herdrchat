import { act, render } from '@testing-library/react-native';
import { Platform, Text, View as MockView, type ViewProps } from 'react-native';

import { useChatSearch } from '@/state/chatSearch';
import { ChatsFind } from '../ChatsFind';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
// The native view, as the props it is handed.
jest.mock('../../../../modules/herdr-keys/src/find', () => ({
  FindShortcutView: (props: ViewProps & { active: boolean; escape: boolean; onFind: () => void; onEscape: () => void }) =>
    <MockView testID="find" {...props} />,
}));

beforeEach(() => {
  mockFocused = true;
  Platform.OS = 'ios';
  useChatSearch.setState({ focusRequests: 0, clearRequests: 0, focused: false });
});

it('holds the screen and takes Command-F while it is on top, on iOS', async () => {
  const screen = await render(<ChatsFind><Text>chats</Text></ChatsFind>);
  expect(screen.getByText('chats')).toBeOnTheScreen();
  expect(screen.getByTestId('find')).toHaveProp('active', true);
});

// A sheet over the chats (Settings) or a chat pushed on a phone.
it('leaves Command-F alone under another screen', async () => {
  mockFocused = false;
  const screen = await render(<ChatsFind><Text>chats</Text></ChatsFind>);
  expect(screen.getByTestId('find')).toHaveProp('active', false);
});

it('leaves Command-F alone off iOS', async () => {
  Platform.OS = 'android';
  const screen = await render(<ChatsFind><Text>chats</Text></ChatsFind>);
  expect(screen.getByTestId('find')).toHaveProp('active', false);
});

it('asks the search field for focus on Command-F, and to clear on Esc', async () => {
  const screen = await render(<ChatsFind><Text>chats</Text></ChatsFind>);
  const find = screen.getByTestId('find');
  await act(() => (find.props as { onFind: () => void }).onFind());
  expect(useChatSearch.getState().focusRequests).toBe(1);
  await act(() => (find.props as { onEscape: () => void }).onEscape());
  expect(useChatSearch.getState().clearRequests).toBe(1);
});

// Esc only while the search field has focus: the composer keeps its own.
it('offers Esc only while the search field has focus', async () => {
  const screen = await render(<ChatsFind><Text>chats</Text></ChatsFind>);
  expect(screen.getByTestId('find')).toHaveProp('escape', false);
  await act(() => useChatSearch.getState().setFocused(true));
  expect(screen.getByTestId('find')).toHaveProp('escape', true);
});
