/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const mod = await (process.env.NODE_ENV !== 'production' ? import('./LexicalText.dev.mjs') : import('./LexicalText.prod.mjs'));
export const $canShowPlaceholder = mod.$canShowPlaceholder;
export const $canShowPlaceholderCurry = mod.$canShowPlaceholderCurry;
export const $findTextIntersectionFromCharacters = mod.$findTextIntersectionFromCharacters;
export const $isRootTextContentEmpty = mod.$isRootTextContentEmpty;
export const $isRootTextContentEmptyCurry = mod.$isRootTextContentEmptyCurry;
export const $rootTextContent = mod.$rootTextContent;
export const registerLexicalTextEntity = mod.registerLexicalTextEntity;