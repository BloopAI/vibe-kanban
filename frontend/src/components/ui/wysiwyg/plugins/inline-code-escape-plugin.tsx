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

export function InlineCodeEscapePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_SPACE_COMMAND,
      () => {
        const selection = $getSelection();
        console.log('[ICEP] Space pressed');

        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          console.log(
            '[ICEP] Not range selection or not collapsed, returning false'
          );
          return false;
        }

        const node = selection.anchor.getNode();
        if (!$isTextNode(node)) {
          console.log('[ICEP] Not text node, returning false');
          return false;
        }

        const offset = selection.anchor.offset;
        const nodeLength = node.getTextContent().length;
        const isAtEnd = offset === nodeLength;
        const hasCodeFormat = node.hasFormat('code');
        const nodeText = node.getTextContent();
        const nodeFormat = node.getFormat();

        const prevSibling = node.getPreviousSibling();
        const nextSibling = node.getNextSibling();

        console.log('[ICEP] Node state:', {
          nodeText: JSON.stringify(nodeText),
          nodeFormat,
          hasCodeFormat,
          offset,
          nodeLength,
          isAtEnd,
          prevSiblingType: prevSibling ? prevSibling.getType() : null,
          prevSiblingText:
            prevSibling && $isTextNode(prevSibling)
              ? JSON.stringify(prevSibling.getTextContent())
              : null,
          prevSiblingHasCode:
            prevSibling && $isTextNode(prevSibling)
              ? prevSibling.hasFormat('code')
              : null,
          nextSiblingType: nextSibling ? nextSibling.getType() : null,
          nextSiblingText:
            nextSibling && $isTextNode(nextSibling)
              ? JSON.stringify(nextSibling.getTextContent())
              : null,
          nextSiblingHasCode:
            nextSibling && $isTextNode(nextSibling)
              ? nextSibling.hasFormat('code')
              : null,
        });

        if (hasCodeFormat && isAtEnd) {
          console.log(
            '[ICEP] CASE 1: At end of code node, creating escape space'
          );
          const spaceNode = $createTextNode(' ');
          spaceNode.setFormat(0);
          node.insertAfter(spaceNode);
          spaceNode.select(1, 1);
          return true;
        }

        if (!hasCodeFormat && isAtEnd) {
          if (
            prevSibling &&
            $isTextNode(prevSibling) &&
            prevSibling.hasFormat('code')
          ) {
            console.log(
              '[ICEP] CASE 2: At end of unformatted node after code, appending space'
            );
            const currentText = node.getTextContent();
            node.setTextContent(currentText + ' ');
            node.select(currentText.length + 1, currentText.length + 1);
            return true;
          }
        }

        console.log('[ICEP] No case matched, returning false (default behavior)');
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}
