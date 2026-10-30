import { act, fireEvent, render } from '@testing-library/react-native';
import { TextInput } from 'react-native';

import { useChatSearch } from '@/state/chatSearch';
import { ChatSearch } from '../ChatSearch';

jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').darkPalette, reduceMotion: true }),
}));
jest.mock('@/components/Icon', () => ({ Icon: () => null }));

const props = () => ({ query: '', onChange: jest.fn(), onSubmit: jest.fn(), onEscape: jest.fn() });

beforeEach(() => useChatSearch.setState({ focusRequests: 0, clearRequests: 0, focused: false }));

it('calls onSubmit on Return', async () => {
  const given = props();
  const screen = await render(<ChatSearch {...given} />);
  await fireEvent(screen.getByTestId('chat-search'), 'submitEditing');
  expect(given.onSubmit).toHaveBeenCalledTimes(1);
});

// Command-F, through the store: the cursor goes in the field, every time.
it('focuses the field on each focus request', async () => {
  const focus = jest.spyOn(TextInput.prototype, 'focus');
  await render(<ChatSearch {...props()} />);
  expect(focus).not.toHaveBeenCalled();
  await act(() => useChatSearch.getState().requestFocus());
  await act(() => useChatSearch.getState().requestFocus());
  expect(focus).toHaveBeenCalledTimes(2);
  focus.mockRestore();
});

// Esc, through the store: the list empties the search, the field lets go.
it('empties and leaves the field on a clear request', async () => {
  const blur = jest.spyOn(TextInput.prototype, 'blur');
  const given = props();
  await render(<ChatSearch {...given} />);
  await act(() => useChatSearch.getState().clear());
  expect(given.onEscape).toHaveBeenCalledTimes(1);
  expect(blur).toHaveBeenCalledTimes(1);
  blur.mockRestore();
});

// So Esc is offered only while the search field has focus.
it('says when it has focus', async () => {
  const screen = await render(<ChatSearch {...props()} />);
  await fireEvent(screen.getByTestId('chat-search'), 'focus');
  expect(useChatSearch.getState().focused).toBe(true);
  await fireEvent(screen.getByTestId('chat-search'), 'blur');
  expect(useChatSearch.getState().focused).toBe(false);
});
