/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalOnChangePlugin.dev.mjs';
import * as modProd from './LexicalOnChangePlugin.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const OnChangePlugin = mod.OnChangePlugin;