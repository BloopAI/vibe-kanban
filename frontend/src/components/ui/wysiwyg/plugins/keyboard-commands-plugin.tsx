import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  KEY_MODIFIER_COMMAND,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  COMMAND_PRIORITY_HIGH,
} from 'lexical';

type Props = {
  onCmdEnter?: () => void;
  onShiftCmdEnter?: () => void;
  onCmdPeriod?: () => void;
};

export function KeyboardCommandsPlugin({
  onCmdEnter,
  onShiftCmdEnter,
  onCmdPeriod,
}: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onCmdEnter && !onShiftCmdEnter && !onCmdPeriod) return;

    // Handle the modifier command to trigger the callbacks
    const unregisterModifier = editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event: KeyboardEvent) => {
        if (!(event.metaKey || event.ctrlKey)) {
          return false;
        }

        // Determine which handler to call based on the key
        let handler: (() => void) | undefined;

        if (event.key === '.' && onCmdPeriod) {
          handler = onCmdPeriod;
        } else if (event.key === 'Enter') {
          if (event.shiftKey && onShiftCmdEnter) {
            handler = onShiftCmdEnter;
          } else if (!event.shiftKey && onCmdEnter) {
            handler = onCmdEnter;
          }
        }

        if (handler) {
          event.preventDefault();
          event.stopPropagation();
          handler();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );

    // Block KEY_ENTER_COMMAND when CMD/Ctrl is pressed to prevent
    // RichTextPlugin from inserting a new line
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (event && (event.metaKey || event.ctrlKey)) {
          return true; // Mark as handled, preventing line break insertion
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      unregisterModifier();
      unregisterEnter();
    };
  }, [editor, onCmdEnter, onShiftCmdEnter, onCmdPeriod]);

  return null;
}
