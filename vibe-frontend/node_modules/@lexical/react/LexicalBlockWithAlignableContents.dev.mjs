/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isDecoratorBlockNode } from '@lexical/react/LexicalDecoratorBlockNode';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { mergeRegister, $getNearestBlockElementAncestorOrThrow } from '@lexical/utils';
import { FORMAT_ELEMENT_COMMAND, $getSelection, $isNodeSelection, $getNodeByKey, $isRangeSelection, COMMAND_PRIORITY_LOW, CLICK_COMMAND } from 'lexical';
import { useRef, useEffect } from 'react';
import { jsx } from 'react/jsx-runtime';

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
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const ref = useRef(null);
  useEffect(() => {
    return mergeRegister(editor.registerCommand(FORMAT_ELEMENT_COMMAND, formatType => {
      if (isSelected) {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          const node = $getNodeByKey(nodeKey);
          if ($isDecoratorBlockNode(node)) {
            node.setFormat(formatType);
          }
        } else if ($isRangeSelection(selection)) {
          const nodes = selection.getNodes();
          for (const node of nodes) {
            if ($isDecoratorBlockNode(node)) {
              node.setFormat(formatType);
            } else {
              const element = $getNearestBlockElementAncestorOrThrow(node);
              element.setFormat(formatType);
            }
          }
        }
        return true;
      }
      return false;
    }, COMMAND_PRIORITY_LOW), editor.registerCommand(CLICK_COMMAND, event => {
      if (event.target === ref.current) {
        event.preventDefault();
        if (!event.shiftKey) {
          clearSelection();
        }
        setSelected(!isSelected);
        return true;
      }
      return false;
    }, COMMAND_PRIORITY_LOW));
  }, [clearSelection, editor, isSelected, nodeKey, setSelected]);
  return /*#__PURE__*/jsx("div", {
    className: [className.base, isSelected ? className.focus : null].filter(Boolean).join(' '),
    ref: ref,
    style: {
      textAlign: format ? format : undefined
    },
    children: children
  });
}

export { BlockWithAlignableContents };
