import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $getRoot,
  type LexicalNode,
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
 * - CMD+V / CTRL+V with HTML: Let default Lexical HTML handler work
 * - CMD+V / CTRL+V with plain text: Convert markdown to formatted nodes, insert at cursor
 * - CMD+SHIFT+V / CTRL+SHIFT+V: Insert plain text as-is (raw paste)
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

    // Handle paste at DOM level (capture phase) to avoid Lexical command sync issues
    const handlePaste = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      // If HTML exists, let default Lexical HTML handler work
      if (clipboardData.getData('text/html')) return;

      const plainText = clipboardData.getData('text/plain');
      if (!plainText) return;

      // Prevent default and stop propagation to Lexical
      event.preventDefault();
      event.stopPropagation();

      // Use setTimeout to escape Lexical's event handling entirely
      setTimeout(() => {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          // CMD+SHIFT+V: Raw paste - insert plain text as-is
          if (shiftHeldRef.current) {
            selection.insertRawText(plainText);
            return;
          }

          // CMD+V: Convert markdown and insert at cursor
          try {
            const tempContainer = $createParagraphNode();
            $convertFromMarkdownString(plainText, transformers, tempContainer);

            const nodes = tempContainer.getChildren();
            if (nodes.length === 0) {
              selection.insertRawText(plainText);
              return;
            }

            // Get anchor point for insertion
            const anchorNode = selection.anchor.getNode();
            const anchorParent = anchorNode.getTopLevelElement();
            const root = $getRoot();

            // Detach nodes from temp container
            nodes.forEach((node) => node.remove());

            // Insert nodes directly into the tree (bypass selection.insertNodes)
            if (anchorParent) {
              // Insert after current paragraph
              let insertAfter: LexicalNode = anchorParent;
              for (const node of nodes) {
                insertAfter.insertAfter(node);
                insertAfter = node;
              }
            } else {
              // Fallback: append to root
              nodes.forEach((node) => root.append(node));
            }

            // Set selection at end
            root.selectEnd();
          } catch {
            // Fallback to raw text on error
            const currentSelection = $getSelection();
            if ($isRangeSelection(currentSelection)) {
              currentSelection.insertRawText(plainText);
            }
          }
        });
      }, 0);
    };

    rootElement.addEventListener('keydown', handleKeyDown);
    rootElement.addEventListener('keyup', handleKeyUp);
    // Use capture phase to intercept before Lexical's handlers
    rootElement.addEventListener('paste', handlePaste, { capture: true });

    return () => {
      rootElement.removeEventListener('keydown', handleKeyDown);
      rootElement.removeEventListener('keyup', handleKeyUp);
      rootElement.removeEventListener('paste', handlePaste, { capture: true });
    };
  }, [editor, transformers]);

  return null;
}
