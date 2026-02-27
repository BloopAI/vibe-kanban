import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  FORMAT_TEXT_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
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
 * Also handles INSERT_MARKDOWN_LIST_COMMAND for list prefix insertion.
 */
export function MarkdownInsertPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterFormat = editor.registerCommand(
      FORMAT_TEXT_COMMAND,
      (format: string) => {
        const marker = FORMAT_MARKERS[format];
        if (!marker) {
          // Unsupported format (e.g. underline) — block it
          return true;
        }

        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          const selectedText = selection.getTextContent();

          if (selectedText.length > 0) {
            // Wrap selection with markers
            selection.insertRawText(`${marker}${selectedText}${marker}`);
          } else {
            // No selection — insert markers with cursor between
            selection.insertRawText(`${marker}${marker}`);

            // Move cursor between the markers
            const afterInsert = $getSelection();
            if ($isRangeSelection(afterInsert)) {
              const { key, offset, type } = afterInsert.anchor;
              const newOffset = offset - marker.length;
              if (newOffset >= 0) {
                const moved = $createRangeSelection();
                moved.anchor.set(key, newOffset, type);
                moved.focus.set(key, newOffset, type);
                $setSelection(moved);
              }
            }
          }
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    const unregisterList = editor.registerCommand(
      INSERT_MARKDOWN_LIST_COMMAND,
      (listType: MarkdownListType) => {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          const prefix = listType === 'bullet' ? '- ' : '1. ';
          const selectedText = selection.getTextContent();

          if (selectedText.length > 0) {
            // Prefix each line
            const lines = selectedText.split('\n');
            const prefixed = lines
              .map((line, i) => {
                if (listType === 'number') {
                  return `${i + 1}. ${line}`;
                }
                return `- ${line}`;
              })
              .join('\n');
            selection.insertRawText(prefixed);
          } else {
            selection.insertRawText(prefix);
          }
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      unregisterFormat();
      unregisterList();
    };
  }, [editor]);

  return null;
}
