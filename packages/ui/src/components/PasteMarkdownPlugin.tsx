import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  PASTE_COMMAND,
  COMMAND_PRIORITY_LOW,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $setSelection,
} from 'lexical';
import {
  $convertFromMarkdownString,
  type Transformer,
} from '@lexical/markdown';

type Props = {
  transformers: Transformer[];
};

/**
 * Plugin that handles paste with markdown conversion.
 *
 * Behavior:
 * - CMD+V with HTML: Let default Lexical handling work
 * - CMD+V with plain text: Convert markdown to formatted nodes, insert at cursor
 * - CMD+SHIFT+V: Insert plain text as-is (raw paste)
 */
export function PasteMarkdownPlugin({ transformers }: Props) {
  const [editor] = useLexicalComposerContext();
  const shiftHeldRef = useRef(false);

  useEffect(() => {
    // Track Shift key state during paste shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        shiftHeldRef.current = e.shiftKey;
      }
    };

    const handleKeyUp = () => {
      shiftHeldRef.current = false;
    };

    // Use window capture listeners so Tauri/WebKit shortcut handling does not
    // bypass tracking when the event target is outside the editor root.
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false;

        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const plainText =
          clipboardData.getData('text/plain') || clipboardData.getData('text');

        // CMD+SHIFT+V: Raw paste must win even when HTML data is present.
        if (shiftHeldRef.current) {
          if (!plainText) return false;
          event.preventDefault();

          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            selection.insertRawText(plainText);
          });

          shiftHeldRef.current = false;
          return true;
        }

        // If HTML exists, let default Lexical handling work.
        if (clipboardData.getData('text/html')) return false;

        if (!plainText) return false;

        event.preventDefault();

        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          // CMD+V: Convert markdown and insert at cursor
          // Save selection before any operations that might corrupt it
          const savedSelection = selection.clone();

          try {
            const tempContainer = $createParagraphNode();
            // Note: $convertFromMarkdownString internally calls selectStart() on the container,
            // which corrupts the current selection - that's why we clone it above
            $convertFromMarkdownString(plainText, transformers, tempContainer);

            // Restore selection that was corrupted by $convertFromMarkdownString
            $setSelection(savedSelection);

            const nodes = tempContainer.getChildren();
            if (nodes.length === 0) {
              savedSelection.insertRawText(plainText);
              return;
            }

            savedSelection.insertNodes(nodes);
          } catch {
            // Fallback to raw text on error - restore selection first to ensure
            // we have a valid selection context for the fallback
            $setSelection(savedSelection);
            savedSelection.insertRawText(plainText);
          }
        });

        shiftHeldRef.current = false;
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      unregisterPaste();
    };
  }, [editor, transformers]);

  return null;
}
