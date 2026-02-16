import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  COMMAND_PRIORITY_LOW,
  $getSelection,
  $isNodeSelection,
} from 'lexical';
import { $isComponentInfoNode } from '../nodes/component-info-node';

export function ComponentInfoKeyboardPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const deleteSelectedNodes = (): boolean => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return false;

      const nodes = selection.getNodes();
      const componentInfoNodes = nodes.filter($isComponentInfoNode);

      if (componentInfoNodes.length === 0) return false;

      for (const node of componentInfoNodes) {
        node.remove();
      }

      return true;
    };

    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      () => deleteSelectedNodes(),
      COMMAND_PRIORITY_LOW
    );

    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      () => deleteSelectedNodes(),
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregisterBackspace();
      unregisterDelete();
    };
  }, [editor]);

  return null;
}
