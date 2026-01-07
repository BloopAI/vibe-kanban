/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalHistoryPlugin.dev.mjs';
import * as modProd from './LexicalHistoryPlugin.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const HistoryPlugin = mod.HistoryPlugin;
export const createEmptyHistoryState = mod.createEmptyHistoryState;