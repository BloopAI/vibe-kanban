/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var react = require('react');
var overflow = require('@lexical/overflow');
var text = require('@lexical/text');
var utils = require('@lexical/utils');
var lexical = require('lexical');
var jsxRuntime = require('react/jsx-runtime');

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

function useCharacterLimit(editor, maxCharacters, optional = Object.freeze({})) {
  const {
    strlen = input => input.length,
    // UTF-16
    remainingCharacters = () => {
      return;
    }
  } = optional;
  react.useEffect(() => {
    if (!editor.hasNodes([overflow.OverflowNode])) {
      {
        formatDevErrorMessage(`useCharacterLimit: OverflowNode not registered on editor`);
      }
    }
  }, [editor]);
  react.useEffect(() => {
    let text$1 = editor.getEditorState().read(text.$rootTextContent);
    let lastComputedTextLength = 0;
    return utils.mergeRegister(editor.registerTextContentListener(currentText => {
      text$1 = currentText;
    }), editor.registerUpdateListener(({
      dirtyLeaves,
      dirtyElements
    }) => {
      const isComposing = editor.isComposing();
      const hasContentChanges = dirtyLeaves.size > 0 || dirtyElements.size > 0;
      if (isComposing || !hasContentChanges) {
        return;
      }
      const textLength = strlen(text$1);
      const textLengthAboveThreshold = textLength > maxCharacters || lastComputedTextLength !== null && lastComputedTextLength > maxCharacters;
      const diff = maxCharacters - textLength;
      remainingCharacters(diff);
      if (lastComputedTextLength === null || textLengthAboveThreshold) {
        const offset = findOffset(text$1, maxCharacters, strlen);
        editor.update(() => {
          $wrapOverflowedNodes(offset);
        }, {
          tag: lexical.HISTORY_MERGE_TAG
        });
      }
      lastComputedTextLength = textLength;
    }), editor.registerCommand(lexical.DELETE_CHARACTER_COMMAND, isBackward => {
      const selection = lexical.$getSelection();
      if (!lexical.$isRangeSelection(selection)) {
        return false;
      }
      const anchorNode = selection.anchor.getNode();
      const overflow = anchorNode.getParent();
      const overflowParent = overflow ? overflow.getParent() : null;
      const parentNext = overflowParent ? overflowParent.getNextSibling() : null;
      selection.deleteCharacter(isBackward);
      if (overflowParent && overflowParent.isEmpty()) {
        overflowParent.remove();
      } else if (lexical.$isElementNode(parentNext) && parentNext.isEmpty()) {
        parentNext.remove();
      }
      return true;
    }, lexical.COMMAND_PRIORITY_LOW));
  }, [editor, maxCharacters, remainingCharacters, strlen]);
}
function findOffset(text, maxCharacters, strlen) {
  const Segmenter = Intl.Segmenter;
  let offsetUtf16 = 0;
  let offset = 0;
  if (typeof Segmenter === 'function') {
    const segmenter = new Segmenter();
    const graphemes = segmenter.segment(text);
    for (const {
      segment: grapheme
    } of graphemes) {
      const nextOffset = offset + strlen(grapheme);
      if (nextOffset > maxCharacters) {
        break;
      }
      offset = nextOffset;
      offsetUtf16 += grapheme.length;
    }
  } else {
    const codepoints = Array.from(text);
    const codepointsLength = codepoints.length;
    for (let i = 0; i < codepointsLength; i++) {
      const codepoint = codepoints[i];
      const nextOffset = offset + strlen(codepoint);
      if (nextOffset > maxCharacters) {
        break;
      }
      offset = nextOffset;
      offsetUtf16 += codepoint.length;
    }
  }
  return offsetUtf16;
}
function $wrapOverflowedNodes(offset) {
  const dfsNodes = utils.$dfs();
  const dfsNodesLength = dfsNodes.length;
  let accumulatedLength = 0;
  for (let i = 0; i < dfsNodesLength; i += 1) {
    const {
      node
    } = dfsNodes[i];
    const needsOverflowParent = lexical.$isLeafNode(node) && !utils.$findMatchingParent(node, overflow.$isOverflowNode);
    if (overflow.$isOverflowNode(node)) {
      const previousLength = accumulatedLength;
      const nextLength = accumulatedLength + node.getTextContentSize();
      if (nextLength <= offset) {
        const parent = node.getParent();
        const previousSibling = node.getPreviousSibling();
        const nextSibling = node.getNextSibling();
        utils.$unwrapNode(node);
        const selection = lexical.$getSelection();

        // Restore selection when the overflow children are removed
        if (lexical.$isRangeSelection(selection) && (!selection.anchor.getNode().isAttached() || !selection.focus.getNode().isAttached())) {
          if (lexical.$isTextNode(previousSibling)) {
            previousSibling.select();
          } else if (lexical.$isTextNode(nextSibling)) {
            nextSibling.select();
          } else if (parent !== null) {
            parent.select();
          }
        }
      } else if (previousLength < offset) {
        const descendant = node.getFirstDescendant();
        const descendantLength = descendant !== null ? descendant.getTextContentSize() : 0;
        const previousPlusDescendantLength = previousLength + descendantLength;
        // For simple text we can redimension the overflow into a smaller and more accurate
        // container
        const firstDescendantIsSimpleText = lexical.$isTextNode(descendant) && descendant.isSimpleText();
        const firstDescendantDoesNotOverflow = previousPlusDescendantLength <= offset;
        if (firstDescendantIsSimpleText || firstDescendantDoesNotOverflow) {
          utils.$unwrapNode(node);
        }
      }
    } else if (needsOverflowParent) {
      const previousAccumulatedLength = accumulatedLength;
      accumulatedLength += node.getTextContentSize();
      if (accumulatedLength > offset && !overflow.$isOverflowNode(node.getParent())) {
        const previousSelection = lexical.$getSelection();
        let overflowNode;

        // For simple text we can improve the limit accuracy by splitting the TextNode
        // on the split point
        if (previousAccumulatedLength < offset && lexical.$isTextNode(node) && node.isSimpleText()) {
          const [, overflowedText] = node.splitText(offset - previousAccumulatedLength);
          overflowNode = $wrapNode(overflowedText);
        } else {
          overflowNode = $wrapNode(node);
        }
        if (previousSelection !== null) {
          lexical.$setSelection(previousSelection);
        }
        $mergePrevious(overflowNode);
      }
    }
  }
}
function $wrapNode(node) {
  const overflowNode = overflow.$createOverflowNode();
  node.replace(overflowNode);
  overflowNode.append(node);
  return overflowNode;
}
function $mergePrevious(overflowNode) {
  const previousNode = overflowNode.getPreviousSibling();
  if (!overflow.$isOverflowNode(previousNode)) {
    return;
  }
  const firstChild = overflowNode.getFirstChild();
  const previousNodeChildren = previousNode.getChildren();
  const previousNodeChildrenLength = previousNodeChildren.length;
  if (firstChild === null) {
    overflowNode.append(...previousNodeChildren);
  } else {
    for (let i = 0; i < previousNodeChildrenLength; i++) {
      firstChild.insertBefore(previousNodeChildren[i]);
    }
  }
  const selection = lexical.$getSelection();
  if (lexical.$isRangeSelection(selection)) {
    const anchor = selection.anchor;
    const anchorNode = anchor.getNode();
    const focus = selection.focus;
    const focusNode = anchor.getNode();
    if (anchorNode.is(previousNode)) {
      anchor.set(overflowNode.getKey(), anchor.offset, 'element');
    } else if (anchorNode.is(overflowNode)) {
      anchor.set(overflowNode.getKey(), previousNodeChildrenLength + anchor.offset, 'element');
    }
    if (focusNode.is(previousNode)) {
      focus.set(overflowNode.getKey(), focus.offset, 'element');
    } else if (focusNode.is(overflowNode)) {
      focus.set(overflowNode.getKey(), previousNodeChildrenLength + focus.offset, 'element');
    }
  }
  previousNode.remove();
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const CHARACTER_LIMIT = 5;
let textEncoderInstance = null;
function textEncoder() {
  if (window.TextEncoder === undefined) {
    return null;
  }
  if (textEncoderInstance === null) {
    textEncoderInstance = new window.TextEncoder();
  }
  return textEncoderInstance;
}
function utf8Length(text) {
  const currentTextEncoder = textEncoder();
  if (currentTextEncoder === null) {
    // http://stackoverflow.com/a/5515960/210370
    const m = encodeURIComponent(text).match(/%[89ABab]/g);
    return text.length + (m ? m.length : 0);
  }
  return currentTextEncoder.encode(text).length;
}
function DefaultRenderer({
  remainingCharacters
}) {
  return /*#__PURE__*/jsxRuntime.jsx("span", {
    className: `characters-limit ${remainingCharacters < 0 ? 'characters-limit-exceeded' : ''}`,
    children: remainingCharacters
  });
}
function CharacterLimitPlugin({
  charset = 'UTF-16',
  maxLength = CHARACTER_LIMIT,
  renderer = DefaultRenderer
}) {
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  const [remainingCharacters, setRemainingCharacters] = react.useState(maxLength);
  const characterLimitProps = react.useMemo(() => ({
    remainingCharacters: setRemainingCharacters,
    strlen: text => {
      if (charset === 'UTF-8') {
        return utf8Length(text);
      } else if (charset === 'UTF-16') {
        return text.length;
      } else {
        throw new Error('Unrecognized charset');
      }
    }
  }), [charset]);
  useCharacterLimit(editor, maxLength, characterLimitProps);
  return renderer({
    remainingCharacters
  });
}

exports.CharacterLimitPlugin = CharacterLimitPlugin;
