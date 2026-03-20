import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $isElementNode,
  $createRangeSelection,
  $setSelection,
} from 'lexical';
import { useTypeaheadOpen } from './TypeaheadOpenContext';

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
 *
 * Uses the full paragraph text (not just the anchor text node) to detect
 * list prefixes, so that formatted inline content (e.g. code-formatted
 * file references inserted via typeahead) doesn't break list continuation.
 */
export function MarkdownListContinuePlugin() {
  const [editor] = useLexicalComposerContext();
  const { isOpen: isTypeaheadOpen } = useTypeaheadOpen();

  useEffect(() => {
    const unregister = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event) return false;
        // Let typeahead handle Enter when it's open
        if (isTypeaheadOpen) return false;
        // Don't interfere with Shift+Enter (line break) or modifier combos
        if (event.shiftKey || event.metaKey || event.ctrlKey) return false;

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        if (!$isTextNode(anchorNode)) return false;

        const anchorText = anchorNode.getTextContent();
        const offset = selection.anchor.offset;

        // Only handle when cursor is at the end of the anchor text node
        if (offset !== anchorText.length) return false;

        // Get the parent element (paragraph) and its full text content.
        // A paragraph may contain multiple text nodes when inline formatting
        // is present (e.g. code-formatted file names from typeahead).
        const parent = anchorNode.getParent();
        if (!parent || !$isElementNode(parent)) return false;

        // Cursor must be at the very end of the paragraph
        const lastChild = parent.getLastChild();
        if (!lastChild || lastChild.getKey() !== anchorNode.getKey()) {
          return false;
        }

        const text = parent.getTextContent();
        const currentLineStart = text.lastIndexOf('\n') + 1;
        const currentLine = text.slice(currentLineStart);
        const anchorLineStart = anchorText.lastIndexOf('\n') + 1;

        const replaceAnchorCurrentLine = (replacement: string) => {
          const nextText = `${anchorText.slice(0, anchorLineStart)}${replacement}`;
          anchorNode.setTextContent(nextText);
          const newSel = $createRangeSelection();

          // Keep caret visually on the blank line when text ends with '\n'.
          if (nextText.endsWith('\n')) {
            const parentKey = parent.getKey();
            const childCount = parent.getChildrenSize();
            newSel.anchor.set(parentKey, childCount, 'element');
            newSel.focus.set(parentKey, childCount, 'element');
          } else {
            const nodeKey = anchorNode.getKey();
            const newOffset = nextText.length;
            newSel.anchor.set(nodeKey, newOffset, 'text');
            newSel.focus.set(nodeKey, newOffset, 'text');
          }

          $setSelection(newSel);
        };

        // Check for empty bullet prefix (just "- " / "* " / "+ ")
        const emptyBullet = currentLine.match(BULLET_PREFIX_RE);
        if (emptyBullet) {
          event.preventDefault();
          replaceAnchorCurrentLine(emptyBullet[1]);
          return true;
        }

        // Check for empty number prefix (just "1. ")
        const emptyNumber = currentLine.match(NUMBER_PREFIX_RE);
        if (emptyNumber) {
          event.preventDefault();
          replaceAnchorCurrentLine(emptyNumber[1]);
          return true;
        }

        // Check for bullet line with content
        const bulletMatch = currentLine.match(BULLET_LINE_RE);
        if (bulletMatch) {
          event.preventDefault();
          const [, indent, marker] = bulletMatch;
          const prefix = `${indent}${marker} `;
          selection.insertRawText(`\n${prefix}`);
          return true;
        }

        // Check for numbered line with content
        const numberMatch = currentLine.match(NUMBER_LINE_RE);
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
  }, [editor, isTypeaheadOpen]);

  return null;
}
