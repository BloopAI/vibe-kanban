import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';

/**
 * Prevents inline code format from "leaking" to text typed after a
 * code-formatted node.
 *
 * Lexical's selection inherits the format of the adjacent text node,
 * so when the cursor is at the end of a code-formatted node the next
 * character typed will also be code-formatted. This plugin clears
 * the code format when the cursor sits at a code-node boundary.
 *
 * Workaround for upstream issues:
 * - https://github.com/facebook/lexical/issues/5518
 * - https://github.com/facebook/lexical/issues/6781
 */
export function InlineCodeBoundaryPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        if (!selection.hasFormat('code')) {
          return false;
        }

        const node = selection.anchor.getNode();
        if (!$isTextNode(node)) {
          return false;
        }

        const offset = selection.anchor.offset;
        const textLength = node.getTextContentSize();

        // Cursor at the end of a code-formatted node → clear code format
        // so the next typed character is plain text
        if (node.hasFormat('code') && offset === textLength) {
          selection.format &= ~(1 << 4); // bit 4 = code format
          return false;
        }

        // Cursor at the start of a non-code node preceded by a code node
        if (offset === 0 && !node.hasFormat('code')) {
          const prev = node.getPreviousSibling();
          if ($isTextNode(prev) && prev.hasFormat('code')) {
            selection.format &= ~(1 << 4);
          }
        }

        return false; // Don't block other handlers
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}
