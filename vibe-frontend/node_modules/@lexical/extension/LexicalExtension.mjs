/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalExtension.dev.mjs';
import * as modProd from './LexicalExtension.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const $createHorizontalRuleNode = mod.$createHorizontalRuleNode;
export const $isHorizontalRuleNode = mod.$isHorizontalRuleNode;
export const AutoFocusExtension = mod.AutoFocusExtension;
export const ClearEditorExtension = mod.ClearEditorExtension;
export const EditorStateExtension = mod.EditorStateExtension;
export const HorizontalRuleExtension = mod.HorizontalRuleExtension;
export const HorizontalRuleNode = mod.HorizontalRuleNode;
export const INSERT_HORIZONTAL_RULE_COMMAND = mod.INSERT_HORIZONTAL_RULE_COMMAND;
export const InitialStateExtension = mod.InitialStateExtension;
export const LexicalBuilder = mod.LexicalBuilder;
export const NodeSelectionExtension = mod.NodeSelectionExtension;
export const TabIndentationExtension = mod.TabIndentationExtension;
export const batch = mod.batch;
export const buildEditorFromExtensions = mod.buildEditorFromExtensions;
export const computed = mod.computed;
export const configExtension = mod.configExtension;
export const declarePeerDependency = mod.declarePeerDependency;
export const defineExtension = mod.defineExtension;
export const effect = mod.effect;
export const getExtensionDependencyFromEditor = mod.getExtensionDependencyFromEditor;
export const getKnownTypesAndNodes = mod.getKnownTypesAndNodes;
export const getPeerDependencyFromEditor = mod.getPeerDependencyFromEditor;
export const getPeerDependencyFromEditorOrThrow = mod.getPeerDependencyFromEditorOrThrow;
export const namedSignals = mod.namedSignals;
export const registerClearEditor = mod.registerClearEditor;
export const registerTabIndentation = mod.registerTabIndentation;
export const safeCast = mod.safeCast;
export const shallowMergeConfig = mod.shallowMergeConfig;
export const signal = mod.signal;
export const untracked = mod.untracked;
export const watchedSignal = mod.watchedSignal;