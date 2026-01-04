import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  KEY_MODIFIER_COMMAND,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  COMMAND_PRIORITY_HIGH,
} from 'lexical';
import { $convertToMarkdownString, type Transformer } from '@lexical/markdown';

type Props = {
  onCmdEnter?: () => void;
  onShiftCmdEnter?: () => void;
  onChange?: (markdown: string) => void;
  transformers?: Transformer[];
};

export function KeyboardCommandsPlugin({
  onCmdEnter,
  onShiftCmdEnter,
  onChange,
  transformers,
}: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onCmdEnter && !onShiftCmdEnter) return;

    // Handle the modifier command to trigger the callbacks
    const unregisterModifier = editor.registerCommand(
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
          // Flush current state synchronously to ensure onChange has latest content
          // This fixes race condition where Cmd+Enter fires before Lexical's update listener
          if (onChange && transformers) {
            const markdown = editor
              .getEditorState()
              .read(() => $convertToMarkdownString(transformers));
            flushSync(() => {
              onChange(markdown);
            });
          }
          onCmdEnter();
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
  }, [editor, onCmdEnter, onShiftCmdEnter, onChange, transformers]);

  return null;
}
