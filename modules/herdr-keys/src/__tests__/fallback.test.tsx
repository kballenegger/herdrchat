import { render } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';

import { EscapeKeyView } from '../escape';
import { FindShortcutView } from '../find';

// Jest has no native side, as Android and an older dev client have none.
// `FindShortcutView` wraps the whole chats screen, so its plain view must
// still draw what it holds, laid out as asked.
it('draws what it holds as a plain view without the native side', async () => {
  expect(Platform.OS).toBe('ios');
  const screen = await render(
    <FindShortcutView testID="find" style={{ flex: 1 }} active escape={false} onFind={jest.fn()} onEscape={jest.fn()}>
      <Text>chats</Text>
    </FindShortcutView>
  );
  expect(screen.getByText('chats')).toBeOnTheScreen();
  expect(screen.getByTestId('find')).toHaveStyle({ flex: 1 });
  expect(screen.getByTestId('find')).not.toHaveProp('active');
});

it('draws the layout card the same way, with or without Command-F', async () => {
  const screen = await render(
    <EscapeKeyView testID="escape" style={{ width: 10 }} active onEscape={jest.fn()} onFind={jest.fn()}>
      <Text>card</Text>
    </EscapeKeyView>
  );
  expect(screen.getByText('card')).toBeOnTheScreen();
  expect(screen.getByTestId('escape')).toHaveStyle({ width: 10 });
  expect(screen.getByTestId('escape')).not.toHaveProp('onFind');
});
