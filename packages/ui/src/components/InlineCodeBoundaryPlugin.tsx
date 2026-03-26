import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createTextNode,
  KEY_ARROW_RIGHT_COMMAND,
  COMMAND_PRIORITY_NORMAL,
} from 'lexical';

/**
 * Allows users to exit inline code formatting by pressing:
 * - Right arrow at the end of a code-formatted text node
 * - Backtick (`) at the end of a code-formatted text node
 *
 * Without this plugin, Lexical's selection inherits the format of the
 * anchor text node, so the cursor stays "inside" the code format and
 * subsequent characters are also code-formatted.
 *
 * The fix inserts a zero-width space with no formatting as a cursor
 * target after the code node. The zero-width space is cleaned up on
 * the next markdown export/import cycle.
 *
 * Workaround for upstream issues:
 * - https://github.com/facebook/lexical/issues/5518
 * - https://github.com/facebook/lexical/issues/6781
 */
export function InlineCodeBoundaryPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    /** If cursor is at the end of a code-formatted text node, insert a
     *  zero-width space after it with no formatting and move cursor there. */
    function $exitCodeNodeIfAtEnd(): boolean {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return false;
      }

      const node = selection.anchor.getNode();
      if (!$isTextNode(node) || !node.hasFormat('code')) {
        return false;
      }

      if (selection.anchor.offset !== node.getTextContentSize()) {
        return false;
      }

      // If the next sibling is already a non-code text node, just move there
      const next = node.getNextSibling();
      if ($isTextNode(next) && !next.hasFormat('code')) {
        next.select(0, 0);
        return true;
      }

      // Insert a zero-width space as a cursor target outside the code node
      const spacer = $createTextNode('\u200B');
      spacer.setFormat(0);
      node.insertAfter(spacer);
      spacer.select(0, 0);
      return true;
    }

    const unregisterArrowRight = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event) => {
        const handled = $exitCodeNodeIfAtEnd();
        if (handled) {
          event.preventDefault();
        }
        return handled;
      },
      COMMAND_PRIORITY_NORMAL
    );

    // Handle backtick key to exit code formatting
    const rootElement = editor.getRootElement();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== '`' || event.metaKey || event.ctrlKey) return;

      editor.update(() => {
        if ($exitCodeNodeIfAtEnd()) {
          event.preventDefault();
        }
      });
    }

    rootElement?.addEventListener('keydown', handleKeyDown);

    return () => {
      unregisterArrowRight();
      rootElement?.removeEventListener('keydown', handleKeyDown);
    };
  }, [editor]);

  return null;
}
