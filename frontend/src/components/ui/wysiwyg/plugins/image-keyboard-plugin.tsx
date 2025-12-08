import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  COMMAND_PRIORITY_LOW,
  $getSelection,
  $isNodeSelection,
} from 'lexical';
import { $isImageNode } from '../nodes/image-node';

export function ImageKeyboardPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const deleteSelectedImages = (): boolean => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return false;

      const nodes = selection.getNodes();
      const imageNodes = nodes.filter($isImageNode);

      if (imageNodes.length === 0) return false;

      for (const imageNode of imageNodes) {
        imageNode.remove();
      }

      return true;
    };

    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      () => deleteSelectedImages(),
      COMMAND_PRIORITY_LOW
    );

    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      () => deleteSelectedImages(),
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregisterBackspace();
      unregisterDelete();
    };
  }, [editor]);

  return null;
}
