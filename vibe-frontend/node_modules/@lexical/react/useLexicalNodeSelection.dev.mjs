/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isNodeSelection, $createNodeSelection, $setSelection, $getNodeByKey } from 'lexical';
import { useState, useEffect, useCallback } from 'react';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */


/**
 * A helper function to determine if a specific node is selected in a Lexical editor.
 *
 * @param {LexicalEditor} editor - The LexicalEditor instance.
 * @param {NodeKey} key - The key of the node to check.
 * @returns {boolean} Whether the node is selected.
 */

function isNodeSelected(editor, key) {
  return editor.getEditorState().read(() => {
    const node = $getNodeByKey(key);
    if (node === null) {
      return false; // Node doesn't exist, so it's not selected.
    }
    return node.isSelected(); // Check if the node is selected.
  });
}

/**
 * A custom hook to manage the selection state of a specific node in a Lexical editor.
 *
 * This hook provides utilities to:
 * - Check if a node is selected.
 * - Update its selection state.
 * - Clear the selection.
 *
 * @param {NodeKey} key - The key of the node to track selection for.
 * @returns {[boolean, (selected: boolean) => void, () => void]} A tuple containing:
 * - `isSelected` (boolean): Whether the node is currently selected.
 * - `setSelected` (function): A function to set the selection state of the node.
 * - `clearSelected` (function): A function to clear the selection of the node.
 *
 */

function useLexicalNodeSelection(key) {
  const [editor] = useLexicalComposerContext();

  // State to track whether the node is currently selected.
  const [isSelected, setIsSelected] = useState(() => isNodeSelected(editor, key));
  useEffect(() => {
    let isMounted = true;
    const unregister = editor.registerUpdateListener(() => {
      if (isMounted) {
        setIsSelected(isNodeSelected(editor, key));
      }
    });
    return () => {
      isMounted = false; // Prevent updates after component unmount.
      unregister();
    };
  }, [editor, key]);
  const setSelected = useCallback(selected => {
    editor.update(() => {
      let selection = $getSelection();
      if (!$isNodeSelection(selection)) {
        selection = $createNodeSelection();
        $setSelection(selection);
      }
      if ($isNodeSelection(selection)) {
        if (selected) {
          selection.add(key);
        } else {
          selection.delete(key);
        }
      }
    });
  }, [editor, key]);
  const clearSelected = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isNodeSelection(selection)) {
        selection.clear();
      }
    });
  }, [editor]);
  return [isSelected, setSelected, clearSelected];
}

export { useLexicalNodeSelection };
