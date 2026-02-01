import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  PASTE_COMMAND,
  COMMAND_PRIORITY_LOW,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
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
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    // Track Shift key state during paste shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        shiftHeldRef.current = e.shiftKey;
      }
    };

    const handleKeyUp = () => {
      shiftHeldRef.current = false;
    };

    rootElement.addEventListener('keydown', handleKeyDown);
    rootElement.addEventListener('keyup', handleKeyUp);

    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        console.log('[PasteMarkdownPlugin] PASTE_COMMAND received');

        if (!(event instanceof ClipboardEvent)) {
          console.log('[PasteMarkdownPlugin] Not a ClipboardEvent, deferring');
          return false;
        }

        const clipboardData = event.clipboardData;
        if (!clipboardData) {
          console.log('[PasteMarkdownPlugin] No clipboardData, deferring');
          return false;
        }

        const hasHtml = !!clipboardData.getData('text/html');
        const plainText = clipboardData.getData('text/plain');
        console.log('[PasteMarkdownPlugin] hasHtml:', hasHtml, 'plainText length:', plainText?.length);

        // If HTML exists, let default Lexical handling work
        if (hasHtml) {
          console.log('[PasteMarkdownPlugin] HTML detected, deferring to Lexical default');
          return false;
        }

        if (!plainText) {
          console.log('[PasteMarkdownPlugin] No plainText, deferring');
          return false;
        }

        event.preventDefault();
        console.log('[PasteMarkdownPlugin] Handling paste, shiftHeld:', shiftHeldRef.current);

        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            console.log('[PasteMarkdownPlugin] Not a RangeSelection, aborting');
            return;
          }

          console.log('[PasteMarkdownPlugin] Selection isCollapsed:', selection.isCollapsed());

          // CMD+SHIFT+V: Raw paste - insert plain text as-is
          if (shiftHeldRef.current) {
            console.log('[PasteMarkdownPlugin] Raw paste (shift held)');
            selection.insertRawText(plainText);
            return;
          }

          // CMD+V: Convert markdown and insert at cursor
          try {
            console.log('[PasteMarkdownPlugin] Converting markdown...');
            const tempContainer = $createParagraphNode();
            $convertFromMarkdownString(plainText, transformers, tempContainer);

            const nodes = tempContainer.getChildren();
            console.log('[PasteMarkdownPlugin] Converted nodes count:', nodes.length);

            if (nodes.length === 0) {
              console.log('[PasteMarkdownPlugin] No nodes, inserting raw text');
              selection.insertRawText(plainText);
              return;
            }

            // Detach nodes from temporary container before insertion.
            // $convertFromMarkdownString attaches nodes to tempContainer, but
            // insertNodes() works best with orphan nodes to avoid parent conflicts.
            console.log('[PasteMarkdownPlugin] Detaching nodes from temp container...');
            nodes.forEach((node) => node.remove());

            console.log('[PasteMarkdownPlugin] Inserting nodes...');
            selection.insertNodes(nodes);
            console.log('[PasteMarkdownPlugin] Paste complete');
          } catch (err) {
            // Fallback to raw text on error
            console.error('[PasteMarkdownPlugin] Error during paste:', err);
            selection.insertRawText(plainText);
          }
        });

        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      rootElement.removeEventListener('keydown', handleKeyDown);
      rootElement.removeEventListener('keyup', handleKeyUp);
      unregisterPaste();
    };
  }, [editor, transformers]);

  return null;
}
