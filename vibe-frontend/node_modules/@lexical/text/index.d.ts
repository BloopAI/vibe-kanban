/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { TextNode } from 'lexical';
export type TextNodeWithOffset = {
    node: TextNode;
    offset: number;
};
export { $canShowPlaceholder, $canShowPlaceholderCurry, } from './canShowPlaceholder';
export { $findTextIntersectionFromCharacters } from './findTextIntersectionFromCharacters';
export { $isRootTextContentEmpty, $isRootTextContentEmptyCurry, } from './isRootTextContentEmpty';
export type { EntityMatch } from './registerLexicalTextEntity';
export { registerLexicalTextEntity } from './registerLexicalTextEntity';
export { $rootTextContent } from './rootTextContent';
