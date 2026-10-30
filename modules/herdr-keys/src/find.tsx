import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, View, type ViewProps } from 'react-native';

export interface FindShortcutViewProps extends ViewProps {
  /** While true, Command-F on a hardware keyboard calls `onFind`. */
  active: boolean;
  /** While true and a text field inside has focus, Esc calls `onEscape`. */
  escape: boolean;
  onFind: () => void;
  onEscape: () => void;
}

type NativeProps = ViewProps & { active: boolean; escape: boolean; onFind: () => void; onEscape: () => void };

// iOS only, and only in a build that contains the module: Android, Jest and
// an older dev client have no native side, and get a plain view (Command-F
// then does nothing; the search field is still a tap away).
const Native: ComponentType<NativeProps> | null =
  Platform.OS === 'ios' && requireOptionalNativeModule('HerdrFind') !== null
    ? requireNativeView<NativeProps>('HerdrFind')
    : null;

/**
 * A container that turns Command-F into `onFind` while `active`, whether a
 * field inside it has focus or nothing does, and Esc into `onEscape` while
 * `escape` and a field inside it has focus. With nothing focused it holds
 * keyboard focus itself to hear the key, but never takes it from a field.
 */
export function FindShortcutView({ active, escape, onFind, onEscape, ...props }: FindShortcutViewProps) {
  if (Native === null) return <View {...props} />;
  return <Native {...props} active={active} escape={escape} onFind={() => onFind()} onEscape={() => onEscape()} />;
}
