import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createRangeSelection,
  $setSelection,
} from 'lexical';

// Matches bullet prefixes: "- ", "* ", "+ "
const BULLET_PREFIX_RE = /^(\s*)([-*+]) $/;
const BULLET_LINE_RE = /^(\s*)([-*+]) (.+)/;

// Matches numbered prefixes: "1. ", "12. ", etc.
const NUMBER_PREFIX_RE = /^(\s*)(\d+)\. $/;
const NUMBER_LINE_RE = /^(\s*)(\d+)\. (.+)/;

/**
 * Auto-continues markdown lists on Enter, like GitHub's editor.
 *
 * When the cursor is at the end of a line that starts with a list prefix:
 * - If the line has content after the prefix, insert a newline + next prefix
 * - If the line is just the prefix (empty item), remove it to end the list
 */
export function MarkdownListContinuePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregister = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event) return false;
        // Don't interfere with Shift+Enter (line break) or modifier combos
        if (event.shiftKey || event.metaKey || event.ctrlKey) return false;

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        if (!$isTextNode(anchorNode)) return false;

        const text = anchorNode.getTextContent();
        const offset = selection.anchor.offset;

        // Only handle when cursor is at the end of the text node
        if (offset !== text.length) return false;

        // Check for empty bullet prefix (just "- " / "* " / "+ ")
        const emptyBullet = text.match(BULLET_PREFIX_RE);
        if (emptyBullet) {
          event.preventDefault();
          // Remove the prefix to end the list
          anchorNode.setTextContent(emptyBullet[1]); // keep leading whitespace or empty
          const nodeKey = anchorNode.getKey();
          const newSel = $createRangeSelection();
          const newOffset = emptyBullet[1].length;
          newSel.anchor.set(nodeKey, newOffset, 'text');
          newSel.focus.set(nodeKey, newOffset, 'text');
          $setSelection(newSel);
          return true;
        }

        // Check for empty number prefix (just "1. ")
        const emptyNumber = text.match(NUMBER_PREFIX_RE);
        if (emptyNumber) {
          event.preventDefault();
          anchorNode.setTextContent(emptyNumber[1]);
          const nodeKey = anchorNode.getKey();
          const newSel = $createRangeSelection();
          const newOffset = emptyNumber[1].length;
          newSel.anchor.set(nodeKey, newOffset, 'text');
          newSel.focus.set(nodeKey, newOffset, 'text');
          $setSelection(newSel);
          return true;
        }

        // Check for bullet line with content
        const bulletMatch = text.match(BULLET_LINE_RE);
        if (bulletMatch) {
          event.preventDefault();
          const [, indent, marker] = bulletMatch;
          const prefix = `${indent}${marker} `;
          selection.insertRawText(`\n${prefix}`);
          return true;
        }

        // Check for numbered line with content
        const numberMatch = text.match(NUMBER_LINE_RE);
        if (numberMatch) {
          event.preventDefault();
          const [, indent, numStr] = numberMatch;
          const nextNum = parseInt(numStr, 10) + 1;
          const prefix = `${indent}${nextNum}. `;
          selection.insertRawText(`\n${prefix}`);
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );

    return unregister;
  }, [editor]);

  return null;
}
