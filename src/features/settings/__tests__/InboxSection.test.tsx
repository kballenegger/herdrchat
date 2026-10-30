import { fireEvent, render } from '@testing-library/react-native';

import { InboxSection } from '../InboxSection';

const mockSave = jest.fn();
const mockSheet = jest.fn();
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => ({}) }));
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').darkPalette }),
}));
jest.mock('@/components/Icon', () => ({ Icon: () => null }));
jest.mock('@/components/ActionSheet', () => ({ showActionSheet: (options: unknown) => mockSheet(options) }));
jest.mock('@/state/saveSetting', () => ({ saveSetting: (...args: unknown[]) => mockSave(...args) }));
const mockSettings = { inbox: true, hideWorking: true, settleAfterDays: 3, haptics: false };
jest.mock('@/state/settings', () => ({
  useSettings: (select: (state: typeof mockSettings) => unknown) => select(mockSettings),
  settingsSnapshot: () => mockSettings,
}));

beforeEach(() => {
  mockSave.mockClear();
  mockSheet.mockClear();
  mockSettings.inbox = true;
});

it('is off by default and shows only its switch until it is turned on', async () => {
  mockSettings.inbox = false;
  const screen = await render(<InboxSection />);
  expect(screen.getByText('Sort chats as an inbox')).toBeOnTheScreen();
  expect(screen.getByText('Settle what is done, snooze what can wait. Working chats wait under the list and come back when they finish.')).toBeOnTheScreen();
  expect(screen.queryByTestId('toggle-hide-working')).toBeNull();
  expect(screen.queryByTestId('settle-after')).toBeNull();
  await fireEvent(screen.getByTestId('toggle-inbox'), 'valueChange', true);
  expect(mockSave).toHaveBeenCalledWith({}, 'inbox', true);
});

it('turns hiding working chats off', async () => {
  const screen = await render(<InboxSection />);
  expect(screen.getByText('Working chats wait under the list and come back to the top when they finish.')).toBeOnTheScreen();
  await fireEvent(screen.getByTestId('toggle-hide-working'), 'valueChange', false);
  expect(mockSave).toHaveBeenCalledWith({}, 'hideWorking', false);
});

it('picks when an untouched chat settles, from Off to two weeks', async () => {
  const screen = await render(<InboxSection />);
  expect(screen.getByText('After 3 days')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('settle-after'));
  const { actions } = mockSheet.mock.calls[0]?.[0] as { actions: { label: string; onPress: () => void }[] };
  expect(actions.map((action) => action.label)).toEqual(['Off', 'After 1 day', 'After 3 days ✓', 'After a week', 'After two weeks']);
  actions[0]?.onPress();
  expect(mockSave).toHaveBeenCalledWith({}, 'settleAfterDays', 0);
});
