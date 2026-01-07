/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var table = require('@lexical/table');
var react = require('react');

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
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  react.useEffect(() => {
    const hadHorizontalScroll = table.$isScrollableTablesActive(editor);
    if (hadHorizontalScroll !== hasHorizontalScroll) {
      table.setScrollableTablesActive(editor, hasHorizontalScroll);
      // Registering the transform has the side-effect of marking all existing
      // TableNodes as dirty. The handler is immediately unregistered.
      editor.registerNodeTransform(table.TableNode, () => {})();
    }
  }, [editor, hasHorizontalScroll]);
  react.useEffect(() => table.registerTablePlugin(editor), [editor]);
  react.useEffect(() => table.registerTableSelectionObserver(editor, hasTabHandler), [editor, hasTabHandler]);

  // Unmerge cells when the feature isn't enabled
  react.useEffect(() => {
    if (!hasCellMerge) {
      return table.registerTableCellUnmergeTransform(editor);
    }
  }, [editor, hasCellMerge]);

  // Remove cell background color when feature is disabled
  react.useEffect(() => {
    if (hasCellBackgroundColor) {
      return;
    }
    return editor.registerNodeTransform(table.TableCellNode, node => {
      if (node.getBackgroundColor() !== null) {
        node.setBackgroundColor(null);
      }
    });
  }, [editor, hasCellBackgroundColor, hasCellMerge]);
  return null;
}

exports.TablePlugin = TablePlugin;
