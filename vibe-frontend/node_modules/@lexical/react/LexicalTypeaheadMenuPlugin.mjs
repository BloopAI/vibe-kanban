/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalTypeaheadMenuPlugin.dev.mjs';
import * as modProd from './LexicalTypeaheadMenuPlugin.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const LexicalTypeaheadMenuPlugin = mod.LexicalTypeaheadMenuPlugin;
export const MenuOption = mod.MenuOption;
export const PUNCTUATION = mod.PUNCTUATION;
export const SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND = mod.SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND;
export const getScrollParent = mod.getScrollParent;
export const useBasicTypeaheadTriggerMatch = mod.useBasicTypeaheadTriggerMatch;
export const useDynamicPositioning = mod.useDynamicPositioning;