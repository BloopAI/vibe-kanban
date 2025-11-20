import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { KEY_MODIFIER_COMMAND, COMMAND_PRIORITY_NORMAL } from 'lexical';

type Props = {
  onCmdEnter?: () => void;
  onShiftCmdEnter?: () => void;
};

export function KeyboardCommandsPlugin({ onCmdEnter, onShiftCmdEnter }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onCmdEnter && !onShiftCmdEnter) return;

    return editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event: KeyboardEvent) => {
        if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.shiftKey && onShiftCmdEnter) {
          onShiftCmdEnter();
          return true;
        }

        if (!event.shiftKey && onCmdEnter) {
          onCmdEnter();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor, onCmdEnter, onShiftCmdEnter]);

  return null;
}
