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
import { getTauriInvoke, isTauriRuntime } from '../lib/platform';

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

  const readRawClipboardText = async (): Promise<string> => {
    const tauriInvoke = getTauriInvoke();

    if (tauriInvoke) {
      try {
        const text = await tauriInvoke('read_clipboard_text');
        if (typeof text === 'string') {
          return text;
        }
      } catch {
        // Fall back to navigator clipboard below.
      }
    }

    return navigator.clipboard.readText();
  };

  useEffect(() => {
    // Track Shift key state during paste shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        const isRawPasteCombo = e.shiftKey;
        shiftHeldRef.current = e.shiftKey;

        // Tauri/WebKit may not dispatch a paste ClipboardEvent for Cmd+Shift+V.
        // Fallback: handle raw paste directly from clipboard on keydown.
        if (isRawPasteCombo) {
          // Browser should use native paste event path (no clipboard-read
          // permission prompts). Tauri may not emit paste events, so keep
          // fallback there only.
          if (!isTauriRuntime()) {
            return;
          }

          const rootElement = editor.getRootElement();
          const activeEl = document.activeElement;
          const domSelection = window.getSelection();
          const hasSelectionInsideEditor =
            !!rootElement &&
            !!domSelection?.anchorNode &&
            rootElement.contains(domSelection.anchorNode);
          const isEditorFocused =
            !!rootElement && !!activeEl && rootElement.contains(activeEl);
          const shouldHandleRawPaste =
            isEditorFocused || hasSelectionInsideEditor;

          if (!shouldHandleRawPaste) {
            return;
          }

          e.preventDefault();
          e.stopPropagation();

          void readRawClipboardText()
            .then((text) => {
              if (!text) return;

              editor.update(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) return;
                selection.insertRawText(text);
              });
            })
            .catch(() => {});
        }
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
        const htmlText = clipboardData.getData('text/html');

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
        if (htmlText) return false;

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
