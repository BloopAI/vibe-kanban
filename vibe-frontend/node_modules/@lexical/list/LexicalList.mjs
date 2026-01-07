/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalList.dev.mjs';
import * as modProd from './LexicalList.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const $createListItemNode = mod.$createListItemNode;
export const $createListNode = mod.$createListNode;
export const $getListDepth = mod.$getListDepth;
export const $handleListInsertParagraph = mod.$handleListInsertParagraph;
export const $insertList = mod.$insertList;
export const $isListItemNode = mod.$isListItemNode;
export const $isListNode = mod.$isListNode;
export const $removeList = mod.$removeList;
export const CheckListExtension = mod.CheckListExtension;
export const INSERT_CHECK_LIST_COMMAND = mod.INSERT_CHECK_LIST_COMMAND;
export const INSERT_ORDERED_LIST_COMMAND = mod.INSERT_ORDERED_LIST_COMMAND;
export const INSERT_UNORDERED_LIST_COMMAND = mod.INSERT_UNORDERED_LIST_COMMAND;
export const ListExtension = mod.ListExtension;
export const ListItemNode = mod.ListItemNode;
export const ListNode = mod.ListNode;
export const REMOVE_LIST_COMMAND = mod.REMOVE_LIST_COMMAND;
export const UPDATE_LIST_START_COMMAND = mod.UPDATE_LIST_START_COMMAND;
export const insertList = mod.insertList;
export const registerCheckList = mod.registerCheckList;
export const registerList = mod.registerList;
export const registerListStrictIndentTransform = mod.registerListStrictIndentTransform;
export const removeList = mod.removeList;