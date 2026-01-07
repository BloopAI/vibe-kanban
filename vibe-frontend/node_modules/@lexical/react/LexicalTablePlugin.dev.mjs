/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isScrollableTablesActive, setScrollableTablesActive, TableNode, registerTablePlugin, registerTableSelectionObserver, registerTableCellUnmergeTransform, TableCellNode } from '@lexical/table';
import { useEffect } from 'react';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * A plugin to enable all of the features of Lexical's TableNode.
 *
 * @param props - See type for documentation
 * @returns An element to render in your LexicalComposer
 */
function TablePlugin({
  hasCellMerge = true,
  hasCellBackgroundColor = true,
  hasTabHandler = true,
  hasHorizontalScroll = false
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const hadHorizontalScroll = $isScrollableTablesActive(editor);
    if (hadHorizontalScroll !== hasHorizontalScroll) {
      setScrollableTablesActive(editor, hasHorizontalScroll);
      // Registering the transform has the side-effect of marking all existing
      // TableNodes as dirty. The handler is immediately unregistered.
      editor.registerNodeTransform(TableNode, () => {})();
    }
  }, [editor, hasHorizontalScroll]);
  useEffect(() => registerTablePlugin(editor), [editor]);
  useEffect(() => registerTableSelectionObserver(editor, hasTabHandler), [editor, hasTabHandler]);

  // Unmerge cells when the feature isn't enabled
  useEffect(() => {
    if (!hasCellMerge) {
      return registerTableCellUnmergeTransform(editor);
    }
  }, [editor, hasCellMerge]);

  // Remove cell background color when feature is disabled
  useEffect(() => {
    if (hasCellBackgroundColor) {
      return;
    }
    return editor.registerNodeTransform(TableCellNode, node => {
      if (node.getBackgroundColor() !== null) {
        node.setBackgroundColor(null);
      }
    });
  }, [editor, hasCellBackgroundColor, hasCellMerge]);
  return null;
}

export { TablePlugin };
