/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var utils = require('@lexical/utils');
var lexical = require('lexical');
var react = require('react');

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const capturedEvents = new Set(['mouseenter', 'mouseleave']);
function NodeEventPlugin({
  nodeType,
  eventType,
  eventListener
}) {
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  const listenerRef = react.useRef(eventListener);
  listenerRef.current = eventListener;
  react.useEffect(() => {
    const isCaptured = capturedEvents.has(eventType);
    const onEvent = event => {
      editor.update(() => {
        const nearestNode = lexical.$getNearestNodeFromDOMNode(event.target);
        if (nearestNode !== null) {
          const targetNode = isCaptured ? nearestNode instanceof nodeType ? nearestNode : null : utils.$findMatchingParent(nearestNode, node => node instanceof nodeType);
          if (targetNode !== null) {
            listenerRef.current(event, editor, targetNode.getKey());
            return;
          }
        }
      });
    };
    return editor.registerRootListener((rootElement, prevRootElement) => {
      if (rootElement) {
        rootElement.addEventListener(eventType, onEvent, isCaptured);
      }
      if (prevRootElement) {
        prevRootElement.removeEventListener(eventType, onEvent, isCaptured);
      }
    });
    // We intentionally don't respect changes to eventType.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, nodeType]);
  return null;
}

exports.NodeEventPlugin = NodeEventPlugin;
