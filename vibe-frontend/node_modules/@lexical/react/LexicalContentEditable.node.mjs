/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const mod = await (process.env.NODE_ENV !== 'production' ? import('./LexicalContentEditable.dev.mjs') : import('./LexicalContentEditable.prod.mjs'));
export const ContentEditable = mod.ContentEditable;
export const ContentEditableElement = mod.ContentEditableElement;