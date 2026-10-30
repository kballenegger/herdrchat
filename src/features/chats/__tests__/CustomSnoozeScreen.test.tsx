import { fireEvent, render } from '@testing-library/react-native';
import { View as MockView, type ViewProps } from 'react-native';

import { useCustomSnooze } from '@/state/customSnooze';
import CustomSnoozeScreen from '../CustomSnoozeScreen';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: ViewProps) => <MockView {...props} />,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').darkPalette, reduceMotion: true }),
}));

beforeEach(() => mockBack.mockClear());

it('snoozes until the picked day at the typed time, and hands it back through the store', async () => {
  const apply = jest.fn();
  useCustomSnooze.getState().open({ title: 'notes', apply });
  const screen = await render(<CustomSnoozeScreen />);
  expect(screen.getByText('Snooze notes')).toBeOnTheScreen();
  // Nothing typed yet: nothing to snooze until.
  expect(screen.getByTestId('snooze-save')).toHaveProp('accessibilityState', { disabled: true });
  await fireEvent.press(screen.getByTestId('snooze-day-1'));
  await fireEvent.changeText(screen.getByTestId('snooze-time'), '9am');
  await fireEvent.press(screen.getByTestId('snooze-save'));
  const until = new Date(apply.mock.calls[0]?.[0] as number);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  expect([until.getDate(), until.getHours(), until.getMinutes()]).toEqual([tomorrow.getDate(), 9, 0]);
  expect(mockBack).toHaveBeenCalled();
});

it('cancels without snoozing', async () => {
  const apply = jest.fn();
  useCustomSnooze.getState().open({ title: 'notes', apply });
  const screen = await render(<CustomSnoozeScreen />);
  await fireEvent.press(screen.getByTestId('snooze-cancel'));
  expect(useCustomSnooze.getState().request).toBeNull();
  expect(apply).not.toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalled();
});
