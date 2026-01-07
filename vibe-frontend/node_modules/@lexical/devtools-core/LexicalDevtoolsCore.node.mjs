/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const mod = await (process.env.NODE_ENV !== 'production' ? import('./LexicalDevtoolsCore.dev.mjs') : import('./LexicalDevtoolsCore.prod.mjs'));
export const TreeView = mod.TreeView;
export const generateContent = mod.generateContent;
export const registerLexicalCommandLogger = mod.registerLexicalCommandLogger;
export const useLexicalCommandsLog = mod.useLexicalCommandsLog;