/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalHorizontalRuleNode.dev.mjs';
import * as modProd from './LexicalHorizontalRuleNode.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const $createHorizontalRuleNode = mod.$createHorizontalRuleNode;
export const $isHorizontalRuleNode = mod.$isHorizontalRuleNode;
export const HorizontalRuleNode = mod.HorizontalRuleNode;
export const INSERT_HORIZONTAL_RULE_COMMAND = mod.INSERT_HORIZONTAL_RULE_COMMAND;