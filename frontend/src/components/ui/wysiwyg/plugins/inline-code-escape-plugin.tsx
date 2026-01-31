import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createTextNode,
  KEY_SPACE_COMMAND,
  COMMAND_PRIORITY_HIGH,
} from 'lexical';

/**
 * Plugin that helps users escape from inline code formatting.
 * When pressing space at the end of a code-formatted text node,
 * inserts a space with cleared formatting.
 *
 * This works around known Lexical issues where format state is not
 * properly cleared at text node boundaries:
 * - https://github.com/facebook/lexical/issues/5518
 * - https://github.com/facebook/lexical/issues/6781
 */
export function InlineCodeEscapePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_SPACE_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const node = selection.anchor.getNode();
        if (!$isTextNode(node)) return false;

        const offset = selection.anchor.offset;
        const nodeLength = node.getTextContent().length;
        const isAtEnd = offset === nodeLength;
        const hasCodeFormat = node.hasFormat('code');

        if (hasCodeFormat && isAtEnd) {
          // First escape: create a new unformatted space node
          const spaceNode = $createTextNode(' ');
          spaceNode.setFormat(0);
          node.insertAfter(spaceNode);
          spaceNode.select(1, 1);
          return true;
        }

        // Check if we're in an unformatted node right after a code node
        // and at the end - append to this node instead of creating a new one
        if (!hasCodeFormat && isAtEnd) {
          const prevSibling = node.getPreviousSibling();
          if (
            prevSibling &&
            $isTextNode(prevSibling) &&
            prevSibling.hasFormat('code')
          ) {
            // We're in the escape node, append the space here
            const currentText = node.getTextContent();
            node.setTextContent(currentText + ' ');
            node.select(currentText.length + 1, currentText.length + 1);
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}
