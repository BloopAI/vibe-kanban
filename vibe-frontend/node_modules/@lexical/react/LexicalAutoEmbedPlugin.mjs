/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalAutoEmbedPlugin.dev.mjs';
import * as modProd from './LexicalAutoEmbedPlugin.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const AutoEmbedOption = mod.AutoEmbedOption;
export const INSERT_EMBED_COMMAND = mod.INSERT_EMBED_COMMAND;
export const LexicalAutoEmbedPlugin = mod.LexicalAutoEmbedPlugin;
export const URL_MATCHER = mod.URL_MATCHER;