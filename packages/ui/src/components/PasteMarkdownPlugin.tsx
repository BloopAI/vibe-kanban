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

  const isDebugPasteEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    const globalFlag = Boolean(
      (window as Window & { __VIBE_DEBUG_PASTE__?: boolean })
        .__VIBE_DEBUG_PASTE__
    );
    const storageFlag =
      window.localStorage?.getItem('vibe.debug.paste') === '1';
    return globalFlag || storageFlag;
  };

  useEffect(() => {
    // Track Shift key state during paste shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        const isRawPasteCombo = e.shiftKey;
        shiftHeldRef.current = e.shiftKey;
        if (isDebugPasteEnabled()) {
          console.log('[PasteMarkdownPlugin] keydown paste combo', {
            key: e.key,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            shiftHeldRef: shiftHeldRef.current,
          });
        }

        // Tauri/WebKit may not dispatch a paste ClipboardEvent for Cmd+Shift+V.
        // Fallback: handle raw paste directly from clipboard on keydown.
        if (isRawPasteCombo) {
          const rootElement = editor.getRootElement();
          const activeEl = document.activeElement;
          const isEditorFocused =
            !!rootElement && !!activeEl && rootElement.contains(activeEl);

          if (!isEditorFocused) {
            if (isDebugPasteEnabled()) {
              console.log(
                '[PasteMarkdownPlugin] raw paste combo ignored (editor not focused)'
              );
            }
            return;
          }

          e.preventDefault();
          e.stopPropagation();

          void navigator.clipboard
            .readText()
            .then((text) => {
              if (!text) {
                if (isDebugPasteEnabled()) {
                  console.log(
                    '[PasteMarkdownPlugin] raw paste keydown fallback got empty clipboard text'
                  );
                }
                return;
              }

              editor.update(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) return;
                selection.insertRawText(text);
              });

              if (isDebugPasteEnabled()) {
                console.log(
                  '[PasteMarkdownPlugin] handled raw paste via keydown fallback',
                  { plainLength: text.length }
                );
              }
            })
            .catch((err: unknown) => {
              if (isDebugPasteEnabled()) {
                console.log(
                  '[PasteMarkdownPlugin] raw paste keydown fallback failed',
                  err
                );
              }
            });
        }
      }
    };

    const handleKeyUp = () => {
      if (isDebugPasteEnabled() && shiftHeldRef.current) {
        console.log('[PasteMarkdownPlugin] keyup reset shift state');
      }
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

        if (isDebugPasteEnabled()) {
          console.log('[PasteMarkdownPlugin] paste event received', {
            shiftHeldRef: shiftHeldRef.current,
            hasHtml: Boolean(htmlText),
            htmlLength: htmlText.length,
            plainLength: plainText.length,
            types: clipboardData.types ? Array.from(clipboardData.types) : [],
          });
        }

        // CMD+SHIFT+V: Raw paste must win even when HTML data is present.
        if (shiftHeldRef.current) {
          if (!plainText) return false;
          event.preventDefault();

          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            selection.insertRawText(plainText);
          });

          if (isDebugPasteEnabled()) {
            console.log('[PasteMarkdownPlugin] handled raw paste');
          }
          shiftHeldRef.current = false;
          return true;
        }

        // If HTML exists, let default Lexical handling work.
        if (htmlText) {
          if (isDebugPasteEnabled()) {
            console.log(
              '[PasteMarkdownPlugin] skipping markdown conversion because HTML is present'
            );
          }
          return false;
        }

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
            if (isDebugPasteEnabled()) {
              console.log(
                '[PasteMarkdownPlugin] markdown conversion failed, used raw text fallback'
              );
            }
          }
        });

        if (isDebugPasteEnabled()) {
          console.log('[PasteMarkdownPlugin] handled markdown/plain paste');
        }
        shiftHeldRef.current = false;
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    if (isDebugPasteEnabled()) {
      console.log('[PasteMarkdownPlugin] debug logging enabled');
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      unregisterPaste();
    };
  }, [editor, transformers]);

  return null;
}
