/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var LexicalDecoratorBlockNode = require('@lexical/react/LexicalDecoratorBlockNode');
var useLexicalNodeSelection = require('@lexical/react/useLexicalNodeSelection');
var utils = require('@lexical/utils');
var lexical = require('lexical');
var react = require('react');
var jsxRuntime = require('react/jsx-runtime');

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function BlockWithAlignableContents({
  children,
  format,
  nodeKey,
  className
}) {
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection.useLexicalNodeSelection(nodeKey);
  const ref = react.useRef(null);
  react.useEffect(() => {
    return utils.mergeRegister(editor.registerCommand(lexical.FORMAT_ELEMENT_COMMAND, formatType => {
      if (isSelected) {
        const selection = lexical.$getSelection();
        if (lexical.$isNodeSelection(selection)) {
          const node = lexical.$getNodeByKey(nodeKey);
          if (LexicalDecoratorBlockNode.$isDecoratorBlockNode(node)) {
            node.setFormat(formatType);
          }
        } else if (lexical.$isRangeSelection(selection)) {
          const nodes = selection.getNodes();
          for (const node of nodes) {
            if (LexicalDecoratorBlockNode.$isDecoratorBlockNode(node)) {
              node.setFormat(formatType);
            } else {
              const element = utils.$getNearestBlockElementAncestorOrThrow(node);
              element.setFormat(formatType);
            }
          }
        }
        return true;
      }
      return false;
    }, lexical.COMMAND_PRIORITY_LOW), editor.registerCommand(lexical.CLICK_COMMAND, event => {
      if (event.target === ref.current) {
        event.preventDefault();
        if (!event.shiftKey) {
          clearSelection();
        }
        setSelected(!isSelected);
        return true;
      }
      return false;
    }, lexical.COMMAND_PRIORITY_LOW));
  }, [clearSelection, editor, isSelected, nodeKey, setSelected]);
  return /*#__PURE__*/jsxRuntime.jsx("div", {
    className: [className.base, isSelected ? className.focus : null].filter(Boolean).join(' '),
    ref: ref,
    style: {
      textAlign: format ? format : undefined
    },
    children: children
  });
}

exports.BlockWithAlignableContents = BlockWithAlignableContents;
