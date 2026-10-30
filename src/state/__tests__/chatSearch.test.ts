import { useChatSearch } from '../chatSearch';

beforeEach(() => useChatSearch.setState({ focusRequests: 0, clearRequests: 0, focused: false }));

it('counts each request, so asking twice is heard twice', () => {
  const heard: string[] = [];
  const stop = useChatSearch.subscribe((state, before) => {
    if (state.focusRequests !== before.focusRequests) heard.push('focus');
    if (state.clearRequests !== before.clearRequests) heard.push('clear');
  });
  useChatSearch.getState().requestFocus();
  useChatSearch.getState().requestFocus();
  useChatSearch.getState().clear();
  stop();
  expect(heard).toEqual(['focus', 'focus', 'clear']);
});

it('keeps whether the field has focus', () => {
  useChatSearch.getState().setFocused(true);
  expect(useChatSearch.getState().focused).toBe(true);
  useChatSearch.getState().setFocused(false);
  expect(useChatSearch.getState().focused).toBe(false);
});
