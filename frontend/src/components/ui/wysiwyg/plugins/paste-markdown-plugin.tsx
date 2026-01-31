import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  PASTE_COMMAND,
  COMMAND_PRIORITY_LOW,
  $getSelection,
  $isRangeSelection,
  $getRoot,
  $isElementNode,
} from 'lexical';
import {
  $convertFromMarkdownString,
  type Transformer,
} from '@lexical/markdown';

type Props = {
  transformers: Transformer[];
};

/**
 * Plugin that converts pasted plain text as markdown.
 * Handles PASTE_COMMAND events and converts markdown syntax to Lexical nodes.
 */
export function PasteMarkdownPlugin({ transformers }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false;

        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // If rich HTML exists, let default handling work
        if (clipboardData.getData('text/html')) return false;

        const plainText = clipboardData.getData('text/plain');
        if (!plainText) return false;

        event.preventDefault();

        editor.update(() => {
          const selection = $getSelection();

          // Delete selected content first
          if ($isRangeSelection(selection) && !selection.isCollapsed()) {
            selection.removeText();
          }

          // Get anchor node's top-level element for targeted conversion
          const anchorNode = selection?.getNodes()?.[0];
          const topLevel = anchorNode?.getTopLevelElement?.();
          const targetElement =
            topLevel && $isElementNode(topLevel) ? topLevel : $getRoot();

          // Convert markdown and insert at target element
          // Using the optional 3rd parameter to target specific element
          $convertFromMarkdownString(plainText, transformers, targetElement);
        });

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, transformers]);

  return null;
}
