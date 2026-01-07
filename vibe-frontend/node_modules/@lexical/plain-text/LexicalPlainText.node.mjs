/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const mod = await (process.env.NODE_ENV !== 'production' ? import('./LexicalPlainText.dev.mjs') : import('./LexicalPlainText.prod.mjs'));
export const PlainTextExtension = mod.PlainTextExtension;
export const registerPlainText = mod.registerPlainText;