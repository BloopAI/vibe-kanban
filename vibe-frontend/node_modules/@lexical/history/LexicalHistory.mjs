/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalHistory.dev.mjs';
import * as modProd from './LexicalHistory.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const HistoryExtension = mod.HistoryExtension;
export const SharedHistoryExtension = mod.SharedHistoryExtension;
export const createEmptyHistoryState = mod.createEmptyHistoryState;
export const registerHistory = mod.registerHistory;