/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $findMatchingParent } from '@lexical/utils';
import { $getNearestNodeFromDOMNode } from 'lexical';
import { useRef, useEffect } from 'react';

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
  const [editor] = useLexicalComposerContext();
  const listenerRef = useRef(eventListener);
  listenerRef.current = eventListener;
  useEffect(() => {
    const isCaptured = capturedEvents.has(eventType);
    const onEvent = event => {
      editor.update(() => {
        const nearestNode = $getNearestNodeFromDOMNode(event.target);
        if (nearestNode !== null) {
          const targetNode = isCaptured ? nearestNode instanceof nodeType ? nearestNode : null : $findMatchingParent(nearestNode, node => node instanceof nodeType);
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

export { NodeEventPlugin };
