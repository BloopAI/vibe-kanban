/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalDragon.dev.mjs';
import * as modProd from './LexicalDragon.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const DragonExtension = mod.DragonExtension;
export const registerDragonSupport = mod.registerDragonSupport;