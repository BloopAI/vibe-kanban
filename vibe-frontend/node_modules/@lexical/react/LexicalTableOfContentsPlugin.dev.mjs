/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HeadingNode, $isHeadingNode } from '@lexical/rich-text';
import { $getNextRightPreorderNode } from '@lexical/utils';
import { $getRoot, $isElementNode, $getNodeByKey, TextNode } from 'lexical';
import { useState, useEffect } from 'react';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function toEntry(heading) {
  return [heading.getKey(), heading.getTextContent(), heading.getTag()];
}
function $insertHeadingIntoTableOfContents(prevHeading, newHeading, currentTableOfContents) {
  if (newHeading === null) {
    return currentTableOfContents;
  }
  const newEntry = toEntry(newHeading);
  let newTableOfContents = [];
  if (prevHeading === null) {
    // check if key already exists
    if (currentTableOfContents.length > 0 && currentTableOfContents[0][0] === newHeading.__key) {
      return currentTableOfContents;
    }
    newTableOfContents = [newEntry, ...currentTableOfContents];
  } else {
    for (let i = 0; i < currentTableOfContents.length; i++) {
      const key = currentTableOfContents[i][0];
      newTableOfContents.push(currentTableOfContents[i]);
      if (key === prevHeading.getKey() && key !== newHeading.getKey()) {
        // check if key already exists
        if (i + 1 < currentTableOfContents.length && currentTableOfContents[i + 1][0] === newHeading.__key) {
          return currentTableOfContents;
        }
        newTableOfContents.push(newEntry);
      }
    }
  }
  return newTableOfContents;
}
function $deleteHeadingFromTableOfContents(key, currentTableOfContents) {
  const newTableOfContents = [];
  for (const heading of currentTableOfContents) {
    if (heading[0] !== key) {
      newTableOfContents.push(heading);
    }
  }
  return newTableOfContents;
}
function $updateHeadingInTableOfContents(heading, currentTableOfContents) {
  const newTableOfContents = [];
  for (const oldHeading of currentTableOfContents) {
    if (oldHeading[0] === heading.getKey()) {
      newTableOfContents.push(toEntry(heading));
    } else {
      newTableOfContents.push(oldHeading);
    }
  }
  return newTableOfContents;
}

/**
 * Returns the updated table of contents, placing the given `heading` before the given `prevHeading`. If `prevHeading`
 * is undefined, `heading` is placed at the start of table of contents
 */
function $updateHeadingPosition(prevHeading, heading, currentTableOfContents) {
  const newTableOfContents = [];
  const newEntry = toEntry(heading);
  if (!prevHeading) {
    newTableOfContents.push(newEntry);
  }
  for (const oldHeading of currentTableOfContents) {
    if (oldHeading[0] === heading.getKey()) {
      continue;
    }
    newTableOfContents.push(oldHeading);
    if (prevHeading && oldHeading[0] === prevHeading.getKey()) {
      newTableOfContents.push(newEntry);
    }
  }
  return newTableOfContents;
}
function $getPreviousHeading(node) {
  let prevHeading = $getNextRightPreorderNode(node);
  while (prevHeading !== null && !$isHeadingNode(prevHeading)) {
    prevHeading = $getNextRightPreorderNode(prevHeading);
  }
  return prevHeading;
}
function TableOfContentsPlugin({
  children
}) {
  const [tableOfContents, setTableOfContents] = useState([]);
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    // Set table of contents initial state
    let currentTableOfContents = [];
    editor.getEditorState().read(() => {
      const updateCurrentTableOfContents = node => {
        for (const child of node.getChildren()) {
          if ($isHeadingNode(child)) {
            currentTableOfContents.push([child.getKey(), child.getTextContent(), child.getTag()]);
          } else if ($isElementNode(child)) {
            updateCurrentTableOfContents(child);
          }
        }
      };
      updateCurrentTableOfContents($getRoot());
      setTableOfContents(currentTableOfContents);
    });
    const removeRootUpdateListener = editor.registerUpdateListener(({
      editorState,
      dirtyElements
    }) => {
      editorState.read(() => {
        const updateChildHeadings = node => {
          for (const child of node.getChildren()) {
            if ($isHeadingNode(child)) {
              const prevHeading = $getPreviousHeading(child);
              currentTableOfContents = $updateHeadingPosition(prevHeading, child, currentTableOfContents);
              setTableOfContents(currentTableOfContents);
            } else if ($isElementNode(child)) {
              updateChildHeadings(child);
            }
          }
        };

        // If a node is changes, all child heading positions need to be updated
        $getRoot().getChildren().forEach(node => {
          if ($isElementNode(node) && dirtyElements.get(node.__key)) {
            updateChildHeadings(node);
          }
        });
      });
    });

    // Listen to updates to heading mutations and update state
    const removeHeaderMutationListener = editor.registerMutationListener(HeadingNode, mutatedNodes => {
      editor.getEditorState().read(() => {
        for (const [nodeKey, mutation] of mutatedNodes) {
          if (mutation === 'created') {
            const newHeading = $getNodeByKey(nodeKey);
            if (newHeading !== null) {
              const prevHeading = $getPreviousHeading(newHeading);
              currentTableOfContents = $insertHeadingIntoTableOfContents(prevHeading, newHeading, currentTableOfContents);
            }
          } else if (mutation === 'destroyed') {
            currentTableOfContents = $deleteHeadingFromTableOfContents(nodeKey, currentTableOfContents);
          } else if (mutation === 'updated') {
            const newHeading = $getNodeByKey(nodeKey);
            if (newHeading !== null) {
              const prevHeading = $getPreviousHeading(newHeading);
              currentTableOfContents = $updateHeadingPosition(prevHeading, newHeading, currentTableOfContents);
            }
          }
        }
        setTableOfContents(currentTableOfContents);
      });
    },
    // Initialization is handled separately
    {
      skipInitialization: true
    });

    // Listen to text node mutation updates
    const removeTextNodeMutationListener = editor.registerMutationListener(TextNode, mutatedNodes => {
      editor.getEditorState().read(() => {
        for (const [nodeKey, mutation] of mutatedNodes) {
          if (mutation === 'updated') {
            const currNode = $getNodeByKey(nodeKey);
            if (currNode !== null) {
              const parentNode = currNode.getParentOrThrow();
              if ($isHeadingNode(parentNode)) {
                currentTableOfContents = $updateHeadingInTableOfContents(parentNode, currentTableOfContents);
                setTableOfContents(currentTableOfContents);
              }
            }
          }
        }
      });
    },
    // Initialization is handled separately
    {
      skipInitialization: true
    });
    return () => {
      removeHeaderMutationListener();
      removeTextNodeMutationListener();
      removeRootUpdateListener();
    };
  }, [editor]);
  return children(tableOfContents, editor);
}

export { TableOfContentsPlugin };
