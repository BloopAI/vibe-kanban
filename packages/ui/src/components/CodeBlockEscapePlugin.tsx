import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isCodeNode } from '@lexical/code';
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $isLineBreakNode,
  KEY_ENTER_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  COMMAND_PRIORITY_NORMAL,
} from 'lexical';

/**
 * Allows users to escape/exit a code block by:
 * 1. Pressing Enter when the last two lines are empty (double-empty-line exit)
 * 2. Pressing ArrowDown at the very end of a code block
 *
 * Lexical's built-in CodeNode.insertNewAfter has a similar mechanism but only
 * triggers for element-level selection which rarely occurs with
 * CodeHighlightNode children.
 */
export function CodeBlockEscapePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event) return false;
        if (event.shiftKey || event.metaKey || event.ctrlKey) return false;

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        const codeNode = $isCodeNode(anchorNode)
          ? anchorNode
          : anchorNode.getParent();
        if (!$isCodeNode(codeNode)) return false;

        const children = codeNode.getChildren();
        const lastChild = children[children.length - 1];
        if (!lastChild) return false;

        // Check if cursor is at the very end of the code block
        const isAtEnd =
          ($isCodeNode(anchorNode) &&
            selection.anchor.offset === children.length) ||
          (anchorNode.is(lastChild) &&
            selection.anchor.offset === lastChild.getTextContentSize());

        if (!isAtEnd) return false;

        // Need at least two trailing newlines (empty lines) to exit
        if (children.length < 2) return false;

        const secondToLast = children[children.length - 2];
        const last = children[children.length - 1];

        const isNewline = (node: typeof last) =>
          $isLineBreakNode(node) || node.getTextContent() === '\n';

        if (!isNewline(last) || !isNewline(secondToLast)) return false;

        event.preventDefault();
        last.remove();
        secondToLast.remove();
        const paragraph = $createParagraphNode();
        codeNode.insertAfter(paragraph);
        paragraph.selectStart();
        return true;
      },
      COMMAND_PRIORITY_NORMAL
    );

    const unregisterArrowDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        const codeNode = $isCodeNode(anchorNode)
          ? anchorNode
          : anchorNode.getParent();
        if (!$isCodeNode(codeNode)) return false;

        const children = codeNode.getChildren();
        const lastChild = children[children.length - 1];
        if (!lastChild) return false;

        const isAtEnd =
          ($isCodeNode(anchorNode) &&
            selection.anchor.offset === children.length) ||
          (anchorNode.is(lastChild) &&
            selection.anchor.offset === lastChild.getTextContentSize());

        if (!isAtEnd) return false;

        const nextSibling = codeNode.getNextSibling();
        if (nextSibling) {
          event.preventDefault();
          nextSibling.selectStart();
          return true;
        }

        event.preventDefault();
        const paragraph = $createParagraphNode();
        codeNode.insertAfter(paragraph);
        paragraph.selectStart();
        return true;
      },
      COMMAND_PRIORITY_NORMAL
    );

    return () => {
      unregisterEnter();
      unregisterArrowDown();
    };
  }, [editor]);

  return null;
}
