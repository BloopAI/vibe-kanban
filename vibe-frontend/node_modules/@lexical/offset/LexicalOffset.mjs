/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalOffset.dev.mjs';
import * as modProd from './LexicalOffset.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const $createChildrenArray = mod.$createChildrenArray;
export const $createOffsetView = mod.$createOffsetView;
export const OffsetView = mod.OffsetView;
export const createChildrenArray = mod.createChildrenArray;