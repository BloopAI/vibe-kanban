/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalMarkdownShortcutPlugin.dev.mjs';
import * as modProd from './LexicalMarkdownShortcutPlugin.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const DEFAULT_TRANSFORMERS = mod.DEFAULT_TRANSFORMERS;
export const MarkdownShortcutPlugin = mod.MarkdownShortcutPlugin;