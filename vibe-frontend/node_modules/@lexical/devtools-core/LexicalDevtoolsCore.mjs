/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalDevtoolsCore.dev.mjs';
import * as modProd from './LexicalDevtoolsCore.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const TreeView = mod.TreeView;
export const generateContent = mod.generateContent;
export const registerLexicalCommandLogger = mod.registerLexicalCommandLogger;
export const useLexicalCommandsLog = mod.useLexicalCommandsLog;