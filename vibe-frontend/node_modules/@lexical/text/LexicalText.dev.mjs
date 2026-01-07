/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { $getRoot, $isDecoratorNode, $isElementNode, $isParagraphNode, $isTextNode, TextNode, $createTextNode } from 'lexical';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Returns the root's text content.
 * @returns The root's text content.
 */
function $rootTextContent() {
  const root = $getRoot();
  return root.getTextContent();
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Determines if the root has any text content and can trim any whitespace if it does.
 * @param isEditorComposing - Is the editor in composition mode due to an active Input Method Editor?
 * @param trim - Should the root text have its whitespaced trimmed? Defaults to true.
 * @returns true if text content is empty, false if there is text or isEditorComposing is true.
 */
function $isRootTextContentEmpty(isEditorComposing, trim = true) {
  if (isEditorComposing) {
    return false;
  }
  let text = $rootTextContent();
  if (trim) {
    text = text.trim();
  }
  return text === '';
}

/**
 * Returns a function that executes {@link $isRootTextContentEmpty}
 * @param isEditorComposing - Is the editor in composition mode due to an active Input Method Editor?
 * @param trim - Should the root text have its whitespaced trimmed? Defaults to true.
 * @returns A function that executes $isRootTextContentEmpty based on arguments.
 */
function $isRootTextContentEmptyCurry(isEditorComposing, trim) {
  return () => $isRootTextContentEmpty(isEditorComposing, trim);
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Determines if the input should show the placeholder. If anything is in
 * in the root the placeholder should not be shown.
 * @param isComposing - Is the editor in composition mode due to an active Input Method Editor?
 * @returns true if the input should show the placeholder, false otherwise.
 */
function $canShowPlaceholder(isComposing) {
  if (!$isRootTextContentEmpty(isComposing, false)) {
    return false;
  }
  const root = $getRoot();
  const children = root.getChildren();
  const childrenLength = children.length;
  if (childrenLength > 1) {
    return false;
  }
  for (let i = 0; i < childrenLength; i++) {
    const topBlock = children[i];
    if ($isDecoratorNode(topBlock)) {
      return false;
    }
    if ($isElementNode(topBlock)) {
      if (!$isParagraphNode(topBlock)) {
        return false;
      }
      if (topBlock.__indent !== 0) {
        return false;
      }
      const topBlockChildren = topBlock.getChildren();
      const topBlockChildrenLength = topBlockChildren.length;
      for (let s = 0; s < topBlockChildrenLength; s++) {
        const child = topBlockChildren[i];
        if (!$isTextNode(child)) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Returns a function that executes {@link $canShowPlaceholder}
 * @param isEditorComposing - Is the editor in composition mode due to an active Input Method Editor?
 * @returns A function that executes $canShowPlaceholder with arguments.
 */
function $canShowPlaceholderCurry(isEditorComposing) {
  return () => $canShowPlaceholder(isEditorComposing);
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Finds a TextNode with a size larger than targetCharacters and returns
 * the node along with the remaining length of the text.
 * @param root - The RootNode.
 * @param targetCharacters - The number of characters whose TextNode must be larger than.
 * @returns The TextNode and the intersections offset, or null if no TextNode is found.
 */
function $findTextIntersectionFromCharacters(root, targetCharacters) {
  let node = root.getFirstChild();
  let currentCharacters = 0;
  mainLoop: while (node !== null) {
    if ($isElementNode(node)) {
      const child = node.getFirstChild();
      if (child !== null) {
        node = child;
        continue;
      }
    } else if ($isTextNode(node)) {
      const characters = node.getTextContentSize();
      if (currentCharacters + characters > targetCharacters) {
        return {
          node,
          offset: targetCharacters - currentCharacters
        };
      }
      currentCharacters += characters;
    }
    const sibling = node.getNextSibling();
    if (sibling !== null) {
      node = sibling;
      continue;
    }
    let parent = node.getParent();
    while (parent !== null) {
      const parentSibling = parent.getNextSibling();
      if (parentSibling !== null) {
        node = parentSibling;
        continue mainLoop;
      }
      parent = parent.getParent();
    }
    break;
  }
  return null;
}

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
 * Returns a tuple that can be rested (...) into mergeRegister to clean up
 * node transforms listeners that transforms text into another node, eg. a HashtagNode.
 * @example
 * ```ts
 *   useEffect(() => {
    return mergeRegister(
      ...registerLexicalTextEntity(editor, getMatch, targetNode, createNode),
    );
  }, [createNode, editor, getMatch, targetNode]);
 * ```
 * Where targetNode is the type of node containing the text you want to transform (like a text input),
 * then getMatch uses a regex to find a matching text and creates the proper node to include the matching text.
 * @param editor - The lexical editor.
 * @param getMatch - Finds a matching string that satisfies a regex expression.
 * @param targetNode - The node type that contains text to match with. eg. HashtagNode
 * @param createNode - A function that creates a new node to contain the matched text. eg createHashtagNode
 * @returns An array containing the plain text and reverse node transform listeners.
 */
function registerLexicalTextEntity(editor, getMatch, targetNode, createNode) {
  const isTargetNode = node => {
    return node instanceof targetNode;
  };
  const $replaceWithSimpleText = node => {
    const textNode = $createTextNode(node.getTextContent());
    textNode.setFormat(node.getFormat());
    node.replace(textNode);
  };
  const getMode = node => {
    return node.getLatest().__mode;
  };
  const $textNodeTransform = node => {
    if (!node.isSimpleText()) {
      return;
    }
    let prevSibling = node.getPreviousSibling();
    let text = node.getTextContent();
    let currentNode = node;
    let match;
    if ($isTextNode(prevSibling)) {
      const previousText = prevSibling.getTextContent();
      const combinedText = previousText + text;
      const prevMatch = getMatch(combinedText);
      if (isTargetNode(prevSibling)) {
        if (prevMatch === null || getMode(prevSibling) !== 0) {
          $replaceWithSimpleText(prevSibling);
          return;
        } else {
          const diff = prevMatch.end - previousText.length;
          if (diff > 0) {
            const concatText = text.slice(0, diff);
            const newTextContent = previousText + concatText;
            prevSibling.select();
            prevSibling.setTextContent(newTextContent);
            if (diff === text.length) {
              node.remove();
            } else {
              const remainingText = text.slice(diff);
              node.setTextContent(remainingText);
            }
            return;
          }
        }
      } else if (prevMatch === null || prevMatch.start < previousText.length) {
        return;
      }
    }
    let prevMatchLengthToSkip = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      match = getMatch(text);
      let nextText = match === null ? '' : text.slice(match.end);
      text = nextText;
      if (nextText === '') {
        const nextSibling = currentNode.getNextSibling();
        if ($isTextNode(nextSibling)) {
          nextText = currentNode.getTextContent() + nextSibling.getTextContent();
          const nextMatch = getMatch(nextText);
          if (nextMatch === null) {
            if (isTargetNode(nextSibling)) {
              $replaceWithSimpleText(nextSibling);
            } else {
              nextSibling.markDirty();
            }
            return;
          } else if (nextMatch.start !== 0) {
            return;
          }
        }
      }
      if (match === null) {
        return;
      }
      if (match.start === 0 && $isTextNode(prevSibling) && prevSibling.isTextEntity()) {
        prevMatchLengthToSkip += match.end;
        continue;
      }
      let nodeToReplace;
      if (match.start === 0) {
        [nodeToReplace, currentNode] = currentNode.splitText(match.end);
      } else {
        [, nodeToReplace, currentNode] = currentNode.splitText(match.start + prevMatchLengthToSkip, match.end + prevMatchLengthToSkip);
      }
      if (!(nodeToReplace !== undefined)) {
        formatDevErrorMessage(`${'nodeToReplace'} should not be undefined. You may want to check splitOffsets passed to the splitText.`);
      }
      const replacementNode = createNode(nodeToReplace);
      replacementNode.setFormat(nodeToReplace.getFormat());
      nodeToReplace.replace(replacementNode);
      if (currentNode == null) {
        return;
      }
      prevMatchLengthToSkip = 0;
      prevSibling = replacementNode;
    }
  };
  const $reverseNodeTransform = node => {
    const text = node.getTextContent();
    const match = getMatch(text);
    if (match === null || match.start !== 0) {
      $replaceWithSimpleText(node);
      return;
    }
    if (text.length > match.end) {
      // This will split out the rest of the text as simple text
      node.splitText(match.end);
      return;
    }
    const prevSibling = node.getPreviousSibling();
    if ($isTextNode(prevSibling) && prevSibling.isTextEntity()) {
      $replaceWithSimpleText(prevSibling);
      $replaceWithSimpleText(node);
    }
    const nextSibling = node.getNextSibling();
    if ($isTextNode(nextSibling) && nextSibling.isTextEntity()) {
      $replaceWithSimpleText(nextSibling);

      // This may have already been converted in the previous block
      if (isTargetNode(node)) {
        $replaceWithSimpleText(node);
      }
    }
  };
  const removePlainTextTransform = editor.registerNodeTransform(TextNode, $textNodeTransform);
  const removeReverseNodeTransform = editor.registerNodeTransform(targetNode, $reverseNodeTransform);
  return [removePlainTextTransform, removeReverseNodeTransform];
}

export { $canShowPlaceholder, $canShowPlaceholderCurry, $findTextIntersectionFromCharacters, $isRootTextContentEmpty, $isRootTextContentEmptyCurry, $rootTextContent, registerLexicalTextEntity };
