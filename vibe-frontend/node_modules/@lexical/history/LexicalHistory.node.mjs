/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const mod = await (process.env.NODE_ENV !== 'production' ? import('./LexicalHistory.dev.mjs') : import('./LexicalHistory.prod.mjs'));
export const HistoryExtension = mod.HistoryExtension;
export const SharedHistoryExtension = mod.SharedHistoryExtension;
export const createEmptyHistoryState = mod.createEmptyHistoryState;
export const registerHistory = mod.registerHistory;