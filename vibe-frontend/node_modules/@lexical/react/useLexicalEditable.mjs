/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './useLexicalEditable.dev.mjs';
import * as modProd from './useLexicalEditable.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const useLexicalEditable = mod.useLexicalEditable;