/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalClipboard.dev.mjs';
import * as modProd from './LexicalClipboard.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const $generateJSONFromSelectedNodes = mod.$generateJSONFromSelectedNodes;
export const $generateNodesFromSerializedNodes = mod.$generateNodesFromSerializedNodes;
export const $getClipboardDataFromSelection = mod.$getClipboardDataFromSelection;
export const $getHtmlContent = mod.$getHtmlContent;
export const $getLexicalContent = mod.$getLexicalContent;
export const $insertDataTransferForPlainText = mod.$insertDataTransferForPlainText;
export const $insertDataTransferForRichText = mod.$insertDataTransferForRichText;
export const $insertGeneratedNodes = mod.$insertGeneratedNodes;
export const copyToClipboard = mod.copyToClipboard;
export const setLexicalClipboardDataTransfer = mod.setLexicalClipboardDataTransfer;