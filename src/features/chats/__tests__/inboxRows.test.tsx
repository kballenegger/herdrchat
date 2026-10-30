import { act, fireEvent, render } from '@testing-library/react-native';
import type { ViewProps } from 'react-native';
import { View as MockView } from 'react-native';

import { useUndoNotice } from '@/state/undoNotice';
import { inbox } from '@/theme/tokens';
import { ChatRow } from '../ChatRow';
import { AllClearRow, ShelfHeader, ShowMoreRow } from '../ShelfHeader';
import { SpaceCard } from '../SpaceCard';
import { UndoNotice } from '../UndoNotice';
import type { ChatSummary } from '../useWorkspaces';

jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').darkPalette, reduceMotion: true }),
}));
jest.mock('@/components/Icon', () => ({ Icon: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: ViewProps) => <MockView {...props} />,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const summary: ChatSummary = {
  workspaceId: 'w2', title: 'notes', number: 2, status: 'idle', agents: [], panes: [],
  preview: { text: 'Here is the summary.', timestamp: 1_000, fromUser: false },
  sessionSig: 's', shellPanes: [], tabs: [], layouts: [], activeTabId: null, tabCount: 0, paneCount: 0, restoreError: null,
  sessionTitle: 'Release notes summary', agentName: null,
};

describe('the shelf header', () => {
  it('names the shelf and its count, says whether it is open, and toggles it', async () => {
    const toggle = jest.fn();
    const screen = await render(<ShelfHeader id="working" title="Working" count={2} expanded={false} onPress={toggle} />);
    const header = screen.getByTestId('inbox-shelf-working');
    expect(header).toHaveProp('accessibilityLabel', 'Working · 2');
    expect(header).toHaveProp('accessibilityState', { expanded: false });
    expect(screen.getByText('Working · 2')).toBeOnTheScreen();
    await fireEvent.press(header);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('offers the next page of Settled, and says when the inbox is clear', async () => {
    const more = jest.fn();
    const screen = await render(<><ShowMoreRow count={20} onPress={more} /><AllClearRow /></>);
    await fireEvent.press(screen.getByTestId('inbox-settled-more'));
    expect(more).toHaveBeenCalled();
    expect(screen.getByText('Show 20 more')).toBeOnTheScreen();
    expect(screen.getByTestId('inbox-clear')).toHaveProp('accessibilityLabel', 'All clear');
  });
});

describe('the slim row', () => {
  // A settled or snoozed chat is one line: its title and when, nothing else.
  it('draws one line: the title, and when on the right', async () => {
    const screen = await render(<ChatRow summary={summary} unread={false} onPress={jest.fn()} variant="slim" trailing="3h" />);
    expect(screen.getByText('Release notes summary')).toBeOnTheScreen();
    expect(screen.getByTestId('chat-row-trailing-w2')).toHaveTextContent('3h');
    expect(screen.queryByText('Here is the summary.')).toBeNull();
    expect(screen.getByTestId('chat-row-w2')).toHaveProp('accessibilityLabel', 'Release notes summary, 3h');
  });

  it('marks a card that woke from a snooze where its time goes', async () => {
    const screen = await render(<ChatRow summary={summary} unread={false} onPress={jest.fn()} woke />);
    expect(screen.getByTestId('chat-row-woke-w2')).toHaveTextContent('Woke');
    expect(screen.getByTestId('chat-row-w2').props.accessibilityLabel).toContain('Woke');
  });
});

describe('the undo notice', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    useUndoNotice.setState({ notice: null });
  });

  it('shows the last action with Undo, and undoes it', async () => {
    const undo = jest.fn();
    const screen = await render(<UndoNotice />);
    expect(screen.queryByTestId('undo-notice')).toBeNull();
    await act(async () => useUndoNotice.getState().show('Settled', undo));
    expect(screen.getByTestId('undo-notice-message')).toHaveTextContent('Settled');
    await fireEvent.press(screen.getByTestId('undo-notice-undo'));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('undo-notice')).toBeNull();
  });

  it('goes by itself after a while', async () => {
    const screen = await render(<UndoNotice />);
    await act(async () => useUndoNotice.getState().show('Snoozed until 6:00 PM', jest.fn()));
    expect(screen.getByTestId('undo-notice')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(inbox.undoNotice));
    expect(screen.queryByTestId('undo-notice')).toBeNull();
  });
});

// A space card (a workspace of several agents) that woke from a snooze is
// marked too: it went back to the inbox with no mark before.
describe('a space card that woke', () => {
  const agent = (paneId: string) => ({
    agent: 'claude', agentStatus: 'idle' as const, cwd: '/home/demo/api', foregroundCwd: null, focused: false, paneId, tabId: 't1', terminalId: null,
    workspaceId: 'w6', agentSession: null, stateChangeSeq: null, completionSeq: null, inputPending: false, name: null, title: null,
  });
  const agents = [agent('w6:p1'), agent('w6:p2')];
  const space: ChatSummary = {
    ...summary, workspaceId: 'w6', title: 'api', agents,
    panes: agents.map((item) => ({ paneId: item.paneId, agent: item, sessionSig: `sig-${item.paneId}`, preview: null, status: 'idle' as const, sessionTitle: null, agentName: null })),
  };

  it('says "Woke" under its status mark, and to VoiceOver', async () => {
    const screen = await render(<SpaceCard summary={space} unread={false} onOpenLayout={() => undefined} woke />);
    expect(screen.getByTestId('chat-row-woke-w6')).toHaveTextContent('Woke');
    expect(screen.getByTestId('chat-row-w6')).toHaveProp('accessibilityLabel', expect.stringMatching(/^api, Woke, /));
    const plain = await render(<SpaceCard summary={space} unread={false} onOpenLayout={() => undefined} />);
    expect(plain.queryByTestId('chat-row-woke-w6')).toBeNull();
  });
});
