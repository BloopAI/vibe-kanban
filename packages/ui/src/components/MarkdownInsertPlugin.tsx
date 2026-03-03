import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  FORMAT_TEXT_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createRangeSelection,
  $setSelection,
  createCommand,
  type LexicalCommand,
} from 'lexical';

export type MarkdownListType = 'bullet' | 'number';

export const INSERT_MARKDOWN_LIST_COMMAND: LexicalCommand<MarkdownListType> =
  createCommand('INSERT_MARKDOWN_LIST');

const FORMAT_MARKERS: Record<string, string> = {
  bold: '**',
  italic: '*',
  strikethrough: '~~',
  code: '`',
};

/**
 * Intercepts FORMAT_TEXT_COMMAND and inserts markdown syntax as literal text
 * instead of applying Lexical rich text formatting.
 *
 * Also handles INSERT_MARKDOWN_LIST_COMMAND for inserting list prefixes.
 */
export function MarkdownInsertPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterFormat = editor.registerCommand(
      FORMAT_TEXT_COMMAND,
      (format: string) => {
        const marker = FORMAT_MARKERS[format];
        if (!marker) return true; // block unsupported formats (e.g. underline)

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const selectedText = selection.getTextContent();

        if (selectedText.length > 0) {
          // Wrap selection with markers
          selection.insertRawText(`${marker}${selectedText}${marker}`);
        } else {
          // Insert markers with cursor between them
          const anchorNode = selection.anchor.getNode();
          const anchorOffset = selection.anchor.offset;

          if ($isTextNode(anchorNode)) {
            const currentText = anchorNode.getTextContent();
            const before = currentText.slice(0, anchorOffset);
            const after = currentText.slice(anchorOffset);
            anchorNode.setTextContent(`${before}${marker}${marker}${after}`);

            const newOffset = anchorOffset + marker.length;
            const nodeKey = anchorNode.getKey();
            const moved = $createRangeSelection();
            moved.anchor.set(nodeKey, newOffset, 'text');
            moved.focus.set(nodeKey, newOffset, 'text');
            $setSelection(moved);
          } else {
            selection.insertRawText(`${marker}${marker}`);
          }
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterList = editor.registerCommand(
      INSERT_MARKDOWN_LIST_COMMAND,
      (listType: MarkdownListType) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const prefix = listType === 'bullet' ? '- ' : '1. ';
        const selectedText = selection.getTextContent();

        if (selectedText.length > 0) {
          const lines = selectedText.split('\n');
          const prefixed = lines
            .map((line, i) =>
              listType === 'number' ? `${i + 1}. ${line}` : `- ${line}`,
            )
            .join('\n');
          selection.insertRawText(prefixed);
        } else {
          selection.insertRawText(prefix);
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      unregisterFormat();
      unregisterList();
    };
  }, [editor]);

  return null;
}
