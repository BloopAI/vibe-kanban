/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const mod = await (process.env.NODE_ENV !== 'production' ? import('./LexicalClipboard.dev.mjs') : import('./LexicalClipboard.prod.mjs'));
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