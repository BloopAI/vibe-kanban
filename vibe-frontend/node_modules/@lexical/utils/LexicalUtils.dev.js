/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var lexical = require('lexical');
var selection = require('@lexical/selection');

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// Do not require this module directly! Use normal `invariant` calls.

function formatDevErrorMessage(message) {
  throw new Error(message);
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const CAN_USE_DOM$1 = typeof window !== 'undefined' && typeof window.document !== 'undefined' && typeof window.document.createElement !== 'undefined';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const documentMode = CAN_USE_DOM$1 && 'documentMode' in document ? document.documentMode : null;
const IS_APPLE$1 = CAN_USE_DOM$1 && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const IS_FIREFOX$1 = CAN_USE_DOM$1 && /^(?!.*Seamonkey)(?=.*Firefox).*/i.test(navigator.userAgent);
const CAN_USE_BEFORE_INPUT$1 = CAN_USE_DOM$1 && 'InputEvent' in window && !documentMode ? 'getTargetRanges' in new window.InputEvent('input') : false;
const IS_SAFARI$1 = CAN_USE_DOM$1 && /Version\/[\d.]+.*Safari/.test(navigator.userAgent);
const IS_IOS$1 = CAN_USE_DOM$1 && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const IS_ANDROID$1 = CAN_USE_DOM$1 && /Android/.test(navigator.userAgent);

// Keep these in case we need to use them in the future.
// export const IS_WINDOWS: boolean = CAN_USE_DOM && /Win/.test(navigator.platform);
const IS_CHROME$1 = CAN_USE_DOM$1 && /^(?=.*Chrome).*/i.test(navigator.userAgent);
// export const canUseTextInputEvent: boolean = CAN_USE_DOM && 'TextEvent' in window && !documentMode;

const IS_ANDROID_CHROME$1 = CAN_USE_DOM$1 && IS_ANDROID$1 && IS_CHROME$1;
const IS_APPLE_WEBKIT$1 = CAN_USE_DOM$1 && /AppleWebKit\/[\d.]+/.test(navigator.userAgent) && IS_APPLE$1 && !IS_CHROME$1;

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function normalizeClassNames(...classNames) {
  const rval = [];
  for (const className of classNames) {
    if (className && typeof className === 'string') {
      for (const [s] of className.matchAll(/\S+/g)) {
        rval.push(s);
      }
    }
  }
  return rval;
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Returns a function that will execute all functions passed when called. It is generally used
 * to register multiple lexical listeners and then tear them down with a single function call, such
 * as React's useEffect hook.
 * @example
 * ```ts
 * useEffect(() => {
 *   return mergeRegister(
 *     editor.registerCommand(...registerCommand1 logic),
 *     editor.registerCommand(...registerCommand2 logic),
 *     editor.registerCommand(...registerCommand3 logic)
 *   )
 * }, [editor])
 * ```
 * In this case, useEffect is returning the function returned by mergeRegister as a cleanup
 * function to be executed after either the useEffect runs again (due to one of its dependencies
 * updating) or the component it resides in unmounts.
 * Note the functions don't necessarily need to be in an array as all arguments
 * are considered to be the func argument and spread from there.
 * The order of cleanup is the reverse of the argument order. Generally it is
 * expected that the first "acquire" will be "released" last (LIFO order),
 * because a later step may have some dependency on an earlier one.
 * @param func - An array of cleanup functions meant to be executed by the returned function.
 * @returns the function which executes all the passed cleanup functions.
 */
function mergeRegister(...func) {
  return () => {
    for (let i = func.length - 1; i >= 0; i--) {
      func[i]();
    }
    // Clean up the references and make future calls a no-op
    func.length = 0;
  };
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function px(value) {
  return `${value}px`;
}

const mutationObserverConfig = {
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true
};
function prependDOMNode(parent, node) {
  parent.insertBefore(node, parent.firstChild);
}

/**
 * Place one or multiple newly created Nodes at the passed Range's position.
 * Multiple nodes will only be created when the Range spans multiple lines (aka
 * client rects).
 *
 * This function can come particularly useful to highlight particular parts of
 * the text without interfering with the EditorState, that will often replicate
 * the state across collab and clipboard.
 *
 * This function accounts for DOM updates which can modify the passed Range.
 * Hence, the function return to remove the listener.
 */
function mlcPositionNodeOnRange(editor, range, onReposition) {
  let rootDOMNode = null;
  let parentDOMNode = null;
  let observer = null;
  let lastNodes = [];
  const wrapperNode = document.createElement('div');
  wrapperNode.style.position = 'relative';
  function position() {
    if (!(rootDOMNode !== null)) {
      formatDevErrorMessage(`Unexpected null rootDOMNode`);
    }
    if (!(parentDOMNode !== null)) {
      formatDevErrorMessage(`Unexpected null parentDOMNode`);
    }
    const {
      left: parentLeft,
      top: parentTop
    } = parentDOMNode.getBoundingClientRect();
    const rects = selection.createRectsFromDOMRange(editor, range);
    if (!wrapperNode.isConnected) {
      prependDOMNode(parentDOMNode, wrapperNode);
    }
    let hasRepositioned = false;
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      // Try to reuse the previously created Node when possible, no need to
      // remove/create on the most common case reposition case
      const rectNode = lastNodes[i] || document.createElement('div');
      const rectNodeStyle = rectNode.style;
      if (rectNodeStyle.position !== 'absolute') {
        rectNodeStyle.position = 'absolute';
        hasRepositioned = true;
      }
      const left = px(rect.left - parentLeft);
      if (rectNodeStyle.left !== left) {
        rectNodeStyle.left = left;
        hasRepositioned = true;
      }
      const top = px(rect.top - parentTop);
      if (rectNodeStyle.top !== top) {
        rectNode.style.top = top;
        hasRepositioned = true;
      }
      const width = px(rect.width);
      if (rectNodeStyle.width !== width) {
        rectNode.style.width = width;
        hasRepositioned = true;
      }
      const height = px(rect.height);
      if (rectNodeStyle.height !== height) {
        rectNode.style.height = height;
        hasRepositioned = true;
      }
      if (rectNode.parentNode !== wrapperNode) {
        wrapperNode.append(rectNode);
        hasRepositioned = true;
      }
      lastNodes[i] = rectNode;
    }
    while (lastNodes.length > rects.length) {
      lastNodes.pop();
    }
    if (hasRepositioned) {
      onReposition(lastNodes);
    }
  }
  function stop() {
    parentDOMNode = null;
    rootDOMNode = null;
    if (observer !== null) {
      observer.disconnect();
    }
    observer = null;
    wrapperNode.remove();
    for (const node of lastNodes) {
      node.remove();
    }
    lastNodes = [];
  }
  function restart() {
    const currentRootDOMNode = editor.getRootElement();
    if (currentRootDOMNode === null) {
      return stop();
    }
    const currentParentDOMNode = currentRootDOMNode.parentElement;
    if (!lexical.isHTMLElement(currentParentDOMNode)) {
      return stop();
    }
    stop();
    rootDOMNode = currentRootDOMNode;
    parentDOMNode = currentParentDOMNode;
    observer = new MutationObserver(mutations => {
      const nextRootDOMNode = editor.getRootElement();
      const nextParentDOMNode = nextRootDOMNode && nextRootDOMNode.parentElement;
      if (nextRootDOMNode !== rootDOMNode || nextParentDOMNode !== parentDOMNode) {
        return restart();
      }
      for (const mutation of mutations) {
        if (!wrapperNode.contains(mutation.target)) {
          // TODO throttle
          return position();
        }
      }
    });
    observer.observe(currentParentDOMNode, mutationObserverConfig);
    position();
  }
  const removeRootListener = editor.registerRootListener(restart);
  return () => {
    removeRootListener();
    stop();
  };
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function $getOrderedSelectionPoints(selection) {
  const points = selection.getStartEndPoints();
  return selection.isBackward() ? [points[1], points[0]] : points;
}
function rangeTargetFromPoint(point, node, dom) {
  if (point.type === 'text' || !lexical.$isElementNode(node)) {
    const textDOM = lexical.getDOMTextNode(dom) || dom;
    return [textDOM, point.offset];
  } else {
    const slot = node.getDOMSlot(dom);
    return [slot.element, slot.getFirstChildOffset() + point.offset];
  }
}
function rangeFromPoints(editor, start, startNode, startDOM, end, endNode, endDOM) {
  const editorDocument = editor._window ? editor._window.document : document;
  const range = editorDocument.createRange();
  range.setStart(...rangeTargetFromPoint(start, startNode, startDOM));
  range.setEnd(...rangeTargetFromPoint(end, endNode, endDOM));
  return range;
}
/**
 * Place one or multiple newly created Nodes at the current selection. Multiple
 * nodes will only be created when the selection spans multiple lines (aka
 * client rects).
 *
 * This function can come useful when you want to show the selection but the
 * editor has been focused away.
 */
function markSelection(editor, onReposition) {
  let previousAnchorNode = null;
  let previousAnchorNodeDOM = null;
  let previousAnchorOffset = null;
  let previousFocusNode = null;
  let previousFocusNodeDOM = null;
  let previousFocusOffset = null;
  let removeRangeListener = () => {};
  function compute(editorState) {
    editorState.read(() => {
      const selection = lexical.$getSelection();
      if (!lexical.$isRangeSelection(selection)) {
        // TODO
        previousAnchorNode = null;
        previousAnchorOffset = null;
        previousFocusNode = null;
        previousFocusOffset = null;
        removeRangeListener();
        removeRangeListener = () => {};
        return;
      }
      const [start, end] = $getOrderedSelectionPoints(selection);
      const currentStartNode = start.getNode();
      const currentStartNodeKey = currentStartNode.getKey();
      const currentStartOffset = start.offset;
      const currentEndNode = end.getNode();
      const currentEndNodeKey = currentEndNode.getKey();
      const currentEndOffset = end.offset;
      const currentStartNodeDOM = editor.getElementByKey(currentStartNodeKey);
      const currentEndNodeDOM = editor.getElementByKey(currentEndNodeKey);
      const differentStartDOM = previousAnchorNode === null || currentStartNodeDOM !== previousAnchorNodeDOM || currentStartOffset !== previousAnchorOffset || currentStartNodeKey !== previousAnchorNode.getKey();
      const differentEndDOM = previousFocusNode === null || currentEndNodeDOM !== previousFocusNodeDOM || currentEndOffset !== previousFocusOffset || currentEndNodeKey !== previousFocusNode.getKey();
      if ((differentStartDOM || differentEndDOM) && currentStartNodeDOM !== null && currentEndNodeDOM !== null) {
        const range = rangeFromPoints(editor, start, currentStartNode, currentStartNodeDOM, end, currentEndNode, currentEndNodeDOM);
        removeRangeListener();
        removeRangeListener = mlcPositionNodeOnRange(editor, range, domNodes => {
          if (onReposition === undefined) {
            for (const domNode of domNodes) {
              const domNodeStyle = domNode.style;
              if (domNodeStyle.background !== 'Highlight') {
                domNodeStyle.background = 'Highlight';
              }
              if (domNodeStyle.color !== 'HighlightText') {
                domNodeStyle.color = 'HighlightText';
              }
              if (domNodeStyle.marginTop !== px(-1.5)) {
                domNodeStyle.marginTop = px(-1.5);
              }
              if (domNodeStyle.paddingTop !== px(4)) {
                domNodeStyle.paddingTop = px(4);
              }
              if (domNodeStyle.paddingBottom !== px(0)) {
                domNodeStyle.paddingBottom = px(0);
              }
            }
          } else {
            onReposition(domNodes);
          }
        });
      }
      previousAnchorNode = currentStartNode;
      previousAnchorNodeDOM = currentStartNodeDOM;
      previousAnchorOffset = currentStartOffset;
      previousFocusNode = currentEndNode;
      previousFocusNodeDOM = currentEndNodeDOM;
      previousFocusOffset = currentEndOffset;
    });
  }
  compute(editor.getEditorState());
  return mergeRegister(editor.registerUpdateListener(({
    editorState
  }) => compute(editorState)), () => {
    removeRangeListener();
  });
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function selectionAlwaysOnDisplay(editor) {
  let removeSelectionMark = null;
  const onSelectionChange = () => {
    const domSelection = getSelection();
    const domAnchorNode = domSelection && domSelection.anchorNode;
    const editorRootElement = editor.getRootElement();
    const isSelectionInsideEditor = domAnchorNode !== null && editorRootElement !== null && editorRootElement.contains(domAnchorNode);
    if (isSelectionInsideEditor) {
      if (removeSelectionMark !== null) {
        removeSelectionMark();
        removeSelectionMark = null;
      }
    } else {
      if (removeSelectionMark === null) {
        removeSelectionMark = markSelection(editor);
      }
    }
  };
  document.addEventListener('selectionchange', onSelectionChange);
  return () => {
    if (removeSelectionMark !== null) {
      removeSelectionMark();
    }
    document.removeEventListener('selectionchange', onSelectionChange);
  };
}

// Hotfix to export these with inlined types #5918
const CAN_USE_BEFORE_INPUT = CAN_USE_BEFORE_INPUT$1;
const CAN_USE_DOM = CAN_USE_DOM$1;
const IS_ANDROID = IS_ANDROID$1;
const IS_ANDROID_CHROME = IS_ANDROID_CHROME$1;
const IS_APPLE = IS_APPLE$1;
const IS_APPLE_WEBKIT = IS_APPLE_WEBKIT$1;
const IS_CHROME = IS_CHROME$1;
const IS_FIREFOX = IS_FIREFOX$1;
const IS_IOS = IS_IOS$1;
const IS_SAFARI = IS_SAFARI$1;

/**
 * Takes an HTML element and adds the classNames passed within an array,
 * ignoring any non-string types. A space can be used to add multiple classes
 * eg. addClassNamesToElement(element, ['element-inner active', true, null])
 * will add both 'element-inner' and 'active' as classes to that element.
 * @param element - The element in which the classes are added
 * @param classNames - An array defining the class names to add to the element
 */
function addClassNamesToElement(element, ...classNames) {
  const classesToAdd = normalizeClassNames(...classNames);
  if (classesToAdd.length > 0) {
    element.classList.add(...classesToAdd);
  }
}

/**
 * Takes an HTML element and removes the classNames passed within an array,
 * ignoring any non-string types. A space can be used to remove multiple classes
 * eg. removeClassNamesFromElement(element, ['active small', true, null])
 * will remove both the 'active' and 'small' classes from that element.
 * @param element - The element in which the classes are removed
 * @param classNames - An array defining the class names to remove from the element
 */
function removeClassNamesFromElement(element, ...classNames) {
  const classesToRemove = normalizeClassNames(...classNames);
  if (classesToRemove.length > 0) {
    element.classList.remove(...classesToRemove);
  }
}

/**
 * Returns true if the file type matches the types passed within the acceptableMimeTypes array, false otherwise.
 * The types passed must be strings and are CASE-SENSITIVE.
 * eg. if file is of type 'text' and acceptableMimeTypes = ['TEXT', 'IMAGE'] the function will return false.
 * @param file - The file you want to type check.
 * @param acceptableMimeTypes - An array of strings of types which the file is checked against.
 * @returns true if the file is an acceptable mime type, false otherwise.
 */
function isMimeType(file, acceptableMimeTypes) {
  for (const acceptableType of acceptableMimeTypes) {
    if (file.type.startsWith(acceptableType)) {
      return true;
    }
  }
  return false;
}

/**
 * Lexical File Reader with:
 *  1. MIME type support
 *  2. batched results (HistoryPlugin compatibility)
 *  3. Order aware (respects the order when multiple Files are passed)
 *
 * const filesResult = await mediaFileReader(files, ['image/']);
 * filesResult.forEach(file => editor.dispatchCommand('INSERT_IMAGE', \\{
 *   src: file.result,
 * \\}));
 */
function mediaFileReader(files, acceptableMimeTypes) {
  const filesIterator = files[Symbol.iterator]();
  return new Promise((resolve, reject) => {
    const processed = [];
    const handleNextFile = () => {
      const {
        done,
        value: file
      } = filesIterator.next();
      if (done) {
        return resolve(processed);
      }
      const fileReader = new FileReader();
      fileReader.addEventListener('error', reject);
      fileReader.addEventListener('load', () => {
        const result = fileReader.result;
        if (typeof result === 'string') {
          processed.push({
            file,
            result
          });
        }
        handleNextFile();
      });
      if (isMimeType(file, acceptableMimeTypes)) {
        fileReader.readAsDataURL(file);
      } else {
        handleNextFile();
      }
    };
    handleNextFile();
  });
}
/**
 * "Depth-First Search" starts at the root/top node of a tree and goes as far as it can down a branch end
 * before backtracking and finding a new path. Consider solving a maze by hugging either wall, moving down a
 * branch until you hit a dead-end (leaf) and backtracking to find the nearest branching path and repeat.
 * It will then return all the nodes found in the search in an array of objects.
 * @param startNode - The node to start the search, if omitted, it will start at the root node.
 * @param endNode - The node to end the search, if omitted, it will find all descendants of the startingNode.
 * @returns An array of objects of all the nodes found by the search, including their depth into the tree.
 * \\{depth: number, node: LexicalNode\\} It will always return at least 1 node (the start node).
 */
function $dfs(startNode, endNode) {
  return Array.from($dfsIterator(startNode, endNode));
}

/**
 * Get the adjacent caret in the same direction
 *
 * @param caret A caret or null
 * @returns `caret.getAdjacentCaret()` or `null`
 */
function $getAdjacentCaret(caret) {
  return caret ? caret.getAdjacentCaret() : null;
}

/**
 * $dfs iterator (right to left). Tree traversal is done on the fly as new values are requested with O(1) memory.
 * @param startNode - The node to start the search, if omitted, it will start at the root node.
 * @param endNode - The node to end the search, if omitted, it will find all descendants of the startingNode.
 * @returns An iterator, each yielded value is a DFSNode. It will always return at least 1 node (the start node).
 */
function $reverseDfs(startNode, endNode) {
  return Array.from($reverseDfsIterator(startNode, endNode));
}

/**
 * $dfs iterator (left to right). Tree traversal is done on the fly as new values are requested with O(1) memory.
 * @param startNode - The node to start the search, if omitted, it will start at the root node.
 * @param endNode - The node to end the search, if omitted, it will find all descendants of the startingNode.
 * @returns An iterator, each yielded value is a DFSNode. It will always return at least 1 node (the start node).
 */
function $dfsIterator(startNode, endNode) {
  return $dfsCaretIterator('next', startNode, endNode);
}
function $getEndCaret(startNode, direction) {
  const rval = lexical.$getAdjacentSiblingOrParentSiblingCaret(lexical.$getSiblingCaret(startNode, direction));
  return rval && rval[0];
}
function $dfsCaretIterator(direction, startNode, endNode) {
  const root = lexical.$getRoot();
  const start = startNode || root;
  const startCaret = lexical.$isElementNode(start) ? lexical.$getChildCaret(start, direction) : lexical.$getSiblingCaret(start, direction);
  const startDepth = $getDepth(start);
  const endCaret = endNode ? lexical.$getAdjacentChildCaret(lexical.$getChildCaretOrSelf(lexical.$getSiblingCaret(endNode, direction))) : $getEndCaret(start, direction);
  let depth = startDepth;
  return lexical.makeStepwiseIterator({
    hasNext: state => state !== null,
    initial: startCaret,
    map: state => ({
      depth,
      node: state.origin
    }),
    step: state => {
      if (state.isSameNodeCaret(endCaret)) {
        return null;
      }
      if (lexical.$isChildCaret(state)) {
        depth++;
      }
      const rval = lexical.$getAdjacentSiblingOrParentSiblingCaret(state);
      if (!rval || rval[0].isSameNodeCaret(endCaret)) {
        return null;
      }
      depth += rval[1];
      return rval[0];
    }
  });
}

/**
 * Returns the Node sibling when this exists, otherwise the closest parent sibling. For example
 * R -> P -> T1, T2
 *   -> P2
 * returns T2 for node T1, P2 for node T2, and null for node P2.
 * @param node LexicalNode.
 * @returns An array (tuple) containing the found Lexical node and the depth difference, or null, if this node doesn't exist.
 */
function $getNextSiblingOrParentSibling(node) {
  const rval = lexical.$getAdjacentSiblingOrParentSiblingCaret(lexical.$getSiblingCaret(node, 'next'));
  return rval && [rval[0].origin, rval[1]];
}
function $getDepth(node) {
  let depth = -1;
  for (let innerNode = node; innerNode !== null; innerNode = innerNode.getParent()) {
    depth++;
  }
  return depth;
}

/**
 * Performs a right-to-left preorder tree traversal.
 * From the starting node it goes to the rightmost child, than backtracks to parent and finds new rightmost path.
 * It will return the next node in traversal sequence after the startingNode.
 * The traversal is similar to $dfs functions above, but the nodes are visited right-to-left, not left-to-right.
 * @param startingNode - The node to start the search.
 * @returns The next node in pre-order right to left traversal sequence or `null`, if the node does not exist
 */
function $getNextRightPreorderNode(startingNode) {
  const startCaret = lexical.$getChildCaretOrSelf(lexical.$getSiblingCaret(startingNode, 'previous'));
  const next = lexical.$getAdjacentSiblingOrParentSiblingCaret(startCaret, 'root');
  return next && next[0].origin;
}

/**
 * $dfs iterator (right to left). Tree traversal is done on the fly as new values are requested with O(1) memory.
 * @param startNode - The node to start the search, if omitted, it will start at the root node.
 * @param endNode - The node to end the search, if omitted, it will find all descendants of the startingNode.
 * @returns An iterator, each yielded value is a DFSNode. It will always return at least 1 node (the start node).
 */
function $reverseDfsIterator(startNode, endNode) {
  return $dfsCaretIterator('previous', startNode, endNode);
}

/**
 * Takes a node and traverses up its ancestors (toward the root node)
 * in order to find a specific type of node.
 * @param node - the node to begin searching.
 * @param klass - an instance of the type of node to look for.
 * @returns the node of type klass that was passed, or null if none exist.
 */
function $getNearestNodeOfType(node, klass) {
  let parent = node;
  while (parent != null) {
    if (parent instanceof klass) {
      return parent;
    }
    parent = parent.getParent();
  }
  return null;
}

/**
 * Returns the element node of the nearest ancestor, otherwise throws an error.
 * @param startNode - The starting node of the search
 * @returns The ancestor node found
 */
function $getNearestBlockElementAncestorOrThrow(startNode) {
  const blockNode = lexical.$findMatchingParent(startNode, node => lexical.$isElementNode(node) && !node.isInline());
  if (!lexical.$isElementNode(blockNode)) {
    {
      formatDevErrorMessage(`Expected node ${startNode.__key} to have closest block element node.`);
    }
  }
  return blockNode;
}
/**
 * Attempts to resolve nested element nodes of the same type into a single node of that type.
 * It is generally used for marks/commenting
 * @param editor - The lexical editor
 * @param targetNode - The target for the nested element to be extracted from.
 * @param cloneNode - See {@link $createMarkNode}
 * @param handleOverlap - Handles any overlap between the node to extract and the targetNode
 * @returns The lexical editor
 */
function registerNestedElementResolver(editor, targetNode, cloneNode, handleOverlap) {
  const $isTargetNode = node => {
    return node instanceof targetNode;
  };
  const $findMatch = node => {
    // First validate we don't have any children that are of the target,
    // as we need to handle them first.
    const children = node.getChildren();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if ($isTargetNode(child)) {
        return null;
      }
    }
    let parentNode = node;
    let childNode = node;
    while (parentNode !== null) {
      childNode = parentNode;
      parentNode = parentNode.getParent();
      if ($isTargetNode(parentNode)) {
        return {
          child: childNode,
          parent: parentNode
        };
      }
    }
    return null;
  };
  const $elementNodeTransform = node => {
    const match = $findMatch(node);
    if (match !== null) {
      const {
        child,
        parent
      } = match;

      // Simple path, we can move child out and siblings into a new parent.

      if (child.is(node)) {
        handleOverlap(parent, node);
        const nextSiblings = child.getNextSiblings();
        const nextSiblingsLength = nextSiblings.length;
        parent.insertAfter(child);
        if (nextSiblingsLength !== 0) {
          const newParent = cloneNode(parent);
          child.insertAfter(newParent);
          for (let i = 0; i < nextSiblingsLength; i++) {
            newParent.append(nextSiblings[i]);
          }
        }
        if (!parent.canBeEmpty() && parent.getChildrenSize() === 0) {
          parent.remove();
        }
      }
    }
  };
  return editor.registerNodeTransform(targetNode, $elementNodeTransform);
}

/**
 * Clones the editor and marks it as dirty to be reconciled. If there was a selection,
 * it would be set back to its previous state, or null otherwise.
 * @param editor - The lexical editor
 * @param editorState - The editor's state
 */
function $restoreEditorState(editor, editorState) {
  const FULL_RECONCILE = 2;
  const nodeMap = new Map();
  const activeEditorState = editor._pendingEditorState;
  for (const [key, node] of editorState._nodeMap) {
    nodeMap.set(key, lexical.$cloneWithProperties(node));
  }
  if (activeEditorState) {
    activeEditorState._nodeMap = nodeMap;
  }
  editor._dirtyType = FULL_RECONCILE;
  const selection = editorState._selection;
  lexical.$setSelection(selection === null ? null : selection.clone());
}

/**
 * If the selected insertion area is the root/shadow root node (see {@link lexical!$isRootOrShadowRoot}),
 * the node will be appended there, otherwise, it will be inserted before the insertion area.
 * If there is no selection where the node is to be inserted, it will be appended after any current nodes
 * within the tree, as a child of the root node. A paragraph will then be added after the inserted node and selected.
 * @param node - The node to be inserted
 * @returns The node after its insertion
 */
function $insertNodeToNearestRoot(node) {
  const selection = lexical.$getSelection() || lexical.$getPreviousSelection();
  let initialCaret;
  if (lexical.$isRangeSelection(selection)) {
    initialCaret = lexical.$caretFromPoint(selection.focus, 'next');
  } else {
    if (selection != null) {
      const nodes = selection.getNodes();
      const lastNode = nodes[nodes.length - 1];
      if (lastNode) {
        initialCaret = lexical.$getSiblingCaret(lastNode, 'next');
      }
    }
    initialCaret = initialCaret || lexical.$getChildCaret(lexical.$getRoot(), 'previous').getFlipped().insert(lexical.$createParagraphNode());
  }
  const insertCaret = $insertNodeToNearestRootAtCaret(node, initialCaret);
  const adjacent = lexical.$getAdjacentChildCaret(insertCaret);
  const selectionCaret = lexical.$isChildCaret(adjacent) ? lexical.$normalizeCaret(adjacent) : insertCaret;
  lexical.$setSelectionFromCaretRange(lexical.$getCollapsedCaretRange(selectionCaret));
  return node.getLatest();
}

/**
 * If the insertion caret is the root/shadow root node (see {@link lexical!$isRootOrShadowRoot}),
 * the node will be inserted there, otherwise the parent nodes will be split according to the
 * given options.
 * @param node - The node to be inserted
 * @param caret - The location to insert or split from
 * @returns The node after its insertion
 */
function $insertNodeToNearestRootAtCaret(node, caret, options) {
  let insertCaret = lexical.$getCaretInDirection(caret, 'next');
  for (let nextCaret = insertCaret; nextCaret; nextCaret = lexical.$splitAtPointCaretNext(nextCaret, options)) {
    insertCaret = nextCaret;
  }
  if (!!lexical.$isTextPointCaret(insertCaret)) {
    formatDevErrorMessage(`$insertNodeToNearestRootAtCaret: An unattached TextNode can not be split`);
  }
  insertCaret.insert(node.isInline() ? lexical.$createParagraphNode().append(node) : node);
  return lexical.$getCaretInDirection(lexical.$getSiblingCaret(node.getLatest(), 'next'), caret.direction);
}

/**
 * Wraps the node into another node created from a createElementNode function, eg. $createParagraphNode
 * @param node - Node to be wrapped.
 * @param createElementNode - Creates a new lexical element to wrap the to-be-wrapped node and returns it.
 * @returns A new lexical element with the previous node appended within (as a child, including its children).
 */
function $wrapNodeInElement(node, createElementNode) {
  const elementNode = createElementNode();
  node.replace(elementNode);
  elementNode.append(node);
  return elementNode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any

/**
 * @param object = The instance of the type
 * @param objectClass = The class of the type
 * @returns Whether the object is has the same Klass of the objectClass, ignoring the difference across window (e.g. different iframes)
 */
function objectKlassEquals(object, objectClass) {
  return object !== null ? Object.getPrototypeOf(object).constructor.name === objectClass.name : false;
}

/**
 * Filter the nodes
 * @param nodes Array of nodes that needs to be filtered
 * @param filterFn A filter function that returns node if the current node satisfies the condition otherwise null
 * @returns Array of filtered nodes
 */

function $filter(nodes, filterFn) {
  const result = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = filterFn(nodes[i]);
    if (node !== null) {
      result.push(node);
    }
  }
  return result;
}
/**
 * Appends the node before the first child of the parent node
 * @param parent A parent node
 * @param node Node that needs to be appended
 */
function $insertFirst(parent, node) {
  lexical.$getChildCaret(parent, 'next').insert(node);
}
let NEEDS_MANUAL_ZOOM = IS_FIREFOX || !CAN_USE_DOM ? false : undefined;
function needsManualZoom() {
  if (NEEDS_MANUAL_ZOOM === undefined) {
    // If the browser implements standardized CSS zoom, then the client rect
    // will be wider after zoom is applied
    // https://chromestatus.com/feature/5198254868529152
    // https://github.com/facebook/lexical/issues/6863
    const div = document.createElement('div');
    div.style.cssText = 'position: absolute; opacity: 0; width: 100px; left: -1000px;';
    document.body.appendChild(div);
    const noZoom = div.getBoundingClientRect();
    div.style.setProperty('zoom', '2');
    NEEDS_MANUAL_ZOOM = div.getBoundingClientRect().width === noZoom.width;
    document.body.removeChild(div);
  }
  return NEEDS_MANUAL_ZOOM;
}

/**
 * Calculates the zoom level of an element as a result of using
 * css zoom property. For browsers that implement standardized CSS
 * zoom (Firefox, Chrome >= 128), this will always return 1.
 * @param element
 */
function calculateZoomLevel(element) {
  let zoom = 1;
  if (needsManualZoom()) {
    while (element) {
      zoom *= Number(window.getComputedStyle(element).getPropertyValue('zoom'));
      element = element.parentElement;
    }
  }
  return zoom;
}

/**
 * Checks if the editor is a nested editor created by LexicalNestedComposer
 */
function $isEditorIsNestedEditor(editor) {
  return editor._parentEditor !== null;
}

/**
 * A depth first last-to-first traversal of root that stops at each node that matches
 * $predicate and ensures that its parent is root. This is typically used to discard
 * invalid or unsupported wrapping nodes. For example, a TableNode must only have
 * TableRowNode as children, but an importer might add invalid nodes based on
 * caption, tbody, thead, etc. and this will unwrap and discard those.
 *
 * @param root The root to start the traversal
 * @param $predicate Should return true for nodes that are permitted to be children of root
 * @returns true if this unwrapped or removed any nodes
 */
function $unwrapAndFilterDescendants(root, $predicate) {
  return $unwrapAndFilterDescendantsImpl(root, $predicate, null);
}
function $unwrapAndFilterDescendantsImpl(root, $predicate, $onSuccess) {
  let didMutate = false;
  for (const node of $lastToFirstIterator(root)) {
    if ($predicate(node)) {
      if ($onSuccess !== null) {
        $onSuccess(node);
      }
      continue;
    }
    didMutate = true;
    if (lexical.$isElementNode(node)) {
      $unwrapAndFilterDescendantsImpl(node, $predicate, $onSuccess || (child => node.insertAfter(child)));
    }
    node.remove();
  }
  return didMutate;
}

/**
 * A depth first traversal of the children array that stops at and collects
 * each node that `$predicate` matches. This is typically used to discard
 * invalid or unsupported wrapping nodes on a children array in the `after`
 * of an {@link lexical!DOMConversionOutput}. For example, a TableNode must only have
 * TableRowNode as children, but an importer might add invalid nodes based on
 * caption, tbody, thead, etc. and this will unwrap and discard those.
 *
 * This function is read-only and performs no mutation operations, which makes
 * it suitable for import and export purposes but likely not for any in-place
 * mutation. You should use {@link $unwrapAndFilterDescendants} for in-place
 * mutations such as node transforms.
 *
 * @param children The children to traverse
 * @param $predicate Should return true for nodes that are permitted to be children of root
 * @returns The children or their descendants that match $predicate
 */

function $descendantsMatching(children, $predicate) {
  const result = [];
  const stack = Array.from(children).reverse();
  for (let child = stack.pop(); child !== undefined; child = stack.pop()) {
    if ($predicate(child)) {
      result.push(child);
    } else if (lexical.$isElementNode(child)) {
      for (const grandchild of $lastToFirstIterator(child)) {
        stack.push(grandchild);
      }
    }
  }
  return result;
}

/**
 * Return an iterator that yields each child of node from first to last, taking
 * care to preserve the next sibling before yielding the value in case the caller
 * removes the yielded node.
 *
 * @param node The node whose children to iterate
 * @returns An iterator of the node's children
 */
function $firstToLastIterator(node) {
  return $childIterator(lexical.$getChildCaret(node, 'next'));
}

/**
 * Return an iterator that yields each child of node from last to first, taking
 * care to preserve the previous sibling before yielding the value in case the caller
 * removes the yielded node.
 *
 * @param node The node whose children to iterate
 * @returns An iterator of the node's children
 */
function $lastToFirstIterator(node) {
  return $childIterator(lexical.$getChildCaret(node, 'previous'));
}
function $childIterator(startCaret) {
  const seen = new Set() ;
  return lexical.makeStepwiseIterator({
    hasNext: lexical.$isSiblingCaret,
    initial: startCaret.getAdjacentCaret(),
    map: caret => {
      const origin = caret.origin.getLatest();
      if (seen !== null) {
        const key = origin.getKey();
        if (!!seen.has(key)) {
          formatDevErrorMessage(`$childIterator: Cycle detected, node with key ${String(key)} has already been traversed`);
        }
        seen.add(key);
      }
      return origin;
    },
    step: caret => caret.getAdjacentCaret()
  });
}

/**
 * Replace this node with its children
 *
 * @param node The ElementNode to unwrap and remove
 */
function $unwrapNode(node) {
  lexical.$rewindSiblingCaret(lexical.$getSiblingCaret(node, 'next')).splice(1, node.getChildren());
}

/**
 * A wrapper that creates bound functions and methods for the
 * StateConfig to save some boilerplate when defining methods
 * or exporting only the accessors from your modules rather
 * than exposing the StateConfig directly.
 */

/**
 * EXPERIMENTAL
 *
 * A convenience interface for working with {@link $getState} and
 * {@link $setState}.
 *
 * @param stateConfig The stateConfig to wrap with convenience functionality
 * @returns a StateWrapper
 */
function makeStateWrapper(stateConfig) {
  const $get = node => lexical.$getState(node, stateConfig);
  const $set = (node, valueOrUpdater) => lexical.$setState(node, stateConfig, valueOrUpdater);
  return {
    $get,
    $set,
    accessors: [$get, $set],
    makeGetterMethod: () => function $getter() {
      return $get(this);
    },
    makeSetterMethod: () => function $setter(valueOrUpdater) {
      return $set(this, valueOrUpdater);
    },
    stateConfig
  };
}

exports.$findMatchingParent = lexical.$findMatchingParent;
exports.$getAdjacentSiblingOrParentSiblingCaret = lexical.$getAdjacentSiblingOrParentSiblingCaret;
exports.$splitNode = lexical.$splitNode;
exports.isBlockDomNode = lexical.isBlockDomNode;
exports.isHTMLAnchorElement = lexical.isHTMLAnchorElement;
exports.isHTMLElement = lexical.isHTMLElement;
exports.isInlineDomNode = lexical.isInlineDomNode;
exports.$descendantsMatching = $descendantsMatching;
exports.$dfs = $dfs;
exports.$dfsIterator = $dfsIterator;
exports.$filter = $filter;
exports.$firstToLastIterator = $firstToLastIterator;
exports.$getAdjacentCaret = $getAdjacentCaret;
exports.$getDepth = $getDepth;
exports.$getNearestBlockElementAncestorOrThrow = $getNearestBlockElementAncestorOrThrow;
exports.$getNearestNodeOfType = $getNearestNodeOfType;
exports.$getNextRightPreorderNode = $getNextRightPreorderNode;
exports.$getNextSiblingOrParentSibling = $getNextSiblingOrParentSibling;
exports.$insertFirst = $insertFirst;
exports.$insertNodeToNearestRoot = $insertNodeToNearestRoot;
exports.$insertNodeToNearestRootAtCaret = $insertNodeToNearestRootAtCaret;
exports.$isEditorIsNestedEditor = $isEditorIsNestedEditor;
exports.$lastToFirstIterator = $lastToFirstIterator;
exports.$restoreEditorState = $restoreEditorState;
exports.$reverseDfs = $reverseDfs;
exports.$reverseDfsIterator = $reverseDfsIterator;
exports.$unwrapAndFilterDescendants = $unwrapAndFilterDescendants;
exports.$unwrapNode = $unwrapNode;
exports.$wrapNodeInElement = $wrapNodeInElement;
exports.CAN_USE_BEFORE_INPUT = CAN_USE_BEFORE_INPUT;
exports.CAN_USE_DOM = CAN_USE_DOM;
exports.IS_ANDROID = IS_ANDROID;
exports.IS_ANDROID_CHROME = IS_ANDROID_CHROME;
exports.IS_APPLE = IS_APPLE;
exports.IS_APPLE_WEBKIT = IS_APPLE_WEBKIT;
exports.IS_CHROME = IS_CHROME;
exports.IS_FIREFOX = IS_FIREFOX;
exports.IS_IOS = IS_IOS;
exports.IS_SAFARI = IS_SAFARI;
exports.addClassNamesToElement = addClassNamesToElement;
exports.calculateZoomLevel = calculateZoomLevel;
exports.isMimeType = isMimeType;
exports.makeStateWrapper = makeStateWrapper;
exports.markSelection = markSelection;
exports.mediaFileReader = mediaFileReader;
exports.mergeRegister = mergeRegister;
exports.objectKlassEquals = objectKlassEquals;
exports.positionNodeOnRange = mlcPositionNodeOnRange;
exports.registerNestedElementResolver = registerNestedElementResolver;
exports.removeClassNamesFromElement = removeClassNamesFromElement;
exports.selectionAlwaysOnDisplay = selectionAlwaysOnDisplay;
