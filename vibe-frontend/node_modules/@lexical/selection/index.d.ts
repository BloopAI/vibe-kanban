/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { $trimTextContentFromAnchor } from './lexical-node';
export { $addNodeStyle, $ensureForwardRangeSelection, $forEachSelectedTextNode, $isAtNodeEnd, $patchStyleText, $sliceSelectedTextNodeContent, $trimTextContentFromAnchor, } from './lexical-node';
export { $copyBlockFormatIndent, $getSelectionStyleValueForProperty, $isParentElementRTL, $moveCaretSelection, $moveCharacter, $setBlocksType, $shouldOverrideDefaultCharacterSelection, $wrapNodes, } from './range-selection';
export { $getComputedStyleForElement, $getComputedStyleForParent, $isParentRTL, createDOMRange, createRectsFromDOMRange, getCSSFromStyleObject, getStyleObjectFromCSS, } from './utils';
/** @deprecated renamed to {@link $trimTextContentFromAnchor} by @lexical/eslint-plugin rules-of-lexical */
export declare const trimTextContentFromAnchor: typeof $trimTextContentFromAnchor;
export { 
/** @deprecated moved to the lexical package */ $cloneWithProperties, 
/** @deprecated moved to the lexical package */ $selectAll, } from 'lexical';
