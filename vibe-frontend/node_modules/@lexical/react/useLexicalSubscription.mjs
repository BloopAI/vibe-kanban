/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './useLexicalSubscription.dev.mjs';
import * as modProd from './useLexicalSubscription.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const useLexicalSubscription = mod.useLexicalSubscription;