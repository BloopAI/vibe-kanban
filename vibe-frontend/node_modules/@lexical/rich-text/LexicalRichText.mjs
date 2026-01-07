/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalRichText.dev.mjs';
import * as modProd from './LexicalRichText.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const $createHeadingNode = mod.$createHeadingNode;
export const $createQuoteNode = mod.$createQuoteNode;
export const $isHeadingNode = mod.$isHeadingNode;
export const $isQuoteNode = mod.$isQuoteNode;
export const DRAG_DROP_PASTE = mod.DRAG_DROP_PASTE;
export const HeadingNode = mod.HeadingNode;
export const QuoteNode = mod.QuoteNode;
export const RichTextExtension = mod.RichTextExtension;
export const eventFiles = mod.eventFiles;
export const registerRichText = mod.registerRichText;