/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const mod = await (process.env.NODE_ENV !== 'production' ? import('./LexicalMarkdown.dev.mjs') : import('./LexicalMarkdown.prod.mjs'));
export const $convertFromMarkdownString = mod.$convertFromMarkdownString;
export const $convertToMarkdownString = mod.$convertToMarkdownString;
export const BOLD_ITALIC_STAR = mod.BOLD_ITALIC_STAR;
export const BOLD_ITALIC_UNDERSCORE = mod.BOLD_ITALIC_UNDERSCORE;
export const BOLD_STAR = mod.BOLD_STAR;
export const BOLD_UNDERSCORE = mod.BOLD_UNDERSCORE;
export const CHECK_LIST = mod.CHECK_LIST;
export const CODE = mod.CODE;
export const ELEMENT_TRANSFORMERS = mod.ELEMENT_TRANSFORMERS;
export const HEADING = mod.HEADING;
export const HIGHLIGHT = mod.HIGHLIGHT;
export const INLINE_CODE = mod.INLINE_CODE;
export const ITALIC_STAR = mod.ITALIC_STAR;
export const ITALIC_UNDERSCORE = mod.ITALIC_UNDERSCORE;
export const LINK = mod.LINK;
export const MULTILINE_ELEMENT_TRANSFORMERS = mod.MULTILINE_ELEMENT_TRANSFORMERS;
export const ORDERED_LIST = mod.ORDERED_LIST;
export const QUOTE = mod.QUOTE;
export const STRIKETHROUGH = mod.STRIKETHROUGH;
export const TEXT_FORMAT_TRANSFORMERS = mod.TEXT_FORMAT_TRANSFORMERS;
export const TEXT_MATCH_TRANSFORMERS = mod.TEXT_MATCH_TRANSFORMERS;
export const TRANSFORMERS = mod.TRANSFORMERS;
export const UNORDERED_LIST = mod.UNORDERED_LIST;
export const registerMarkdownShortcuts = mod.registerMarkdownShortcuts;