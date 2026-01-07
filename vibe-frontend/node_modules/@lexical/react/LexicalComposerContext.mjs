/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalComposerContext.dev.mjs';
import * as modProd from './LexicalComposerContext.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const LexicalComposerContext = mod.LexicalComposerContext;
export const createLexicalComposerContext = mod.createLexicalComposerContext;
export const useLexicalComposerContext = mod.useLexicalComposerContext;