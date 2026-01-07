/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalUtils.dev.mjs';
import * as modProd from './LexicalUtils.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const $descendantsMatching = mod.$descendantsMatching;
export const $dfs = mod.$dfs;
export const $dfsIterator = mod.$dfsIterator;
export const $filter = mod.$filter;
export const $findMatchingParent = mod.$findMatchingParent;
export const $firstToLastIterator = mod.$firstToLastIterator;
export const $getAdjacentCaret = mod.$getAdjacentCaret;
export const $getAdjacentSiblingOrParentSiblingCaret = mod.$getAdjacentSiblingOrParentSiblingCaret;
export const $getDepth = mod.$getDepth;
export const $getNearestBlockElementAncestorOrThrow = mod.$getNearestBlockElementAncestorOrThrow;
export const $getNearestNodeOfType = mod.$getNearestNodeOfType;
export const $getNextRightPreorderNode = mod.$getNextRightPreorderNode;
export const $getNextSiblingOrParentSibling = mod.$getNextSiblingOrParentSibling;
export const $insertFirst = mod.$insertFirst;
export const $insertNodeToNearestRoot = mod.$insertNodeToNearestRoot;
export const $insertNodeToNearestRootAtCaret = mod.$insertNodeToNearestRootAtCaret;
export const $isEditorIsNestedEditor = mod.$isEditorIsNestedEditor;
export const $lastToFirstIterator = mod.$lastToFirstIterator;
export const $restoreEditorState = mod.$restoreEditorState;
export const $reverseDfs = mod.$reverseDfs;
export const $reverseDfsIterator = mod.$reverseDfsIterator;
export const $splitNode = mod.$splitNode;
export const $unwrapAndFilterDescendants = mod.$unwrapAndFilterDescendants;
export const $unwrapNode = mod.$unwrapNode;
export const $wrapNodeInElement = mod.$wrapNodeInElement;
export const CAN_USE_BEFORE_INPUT = mod.CAN_USE_BEFORE_INPUT;
export const CAN_USE_DOM = mod.CAN_USE_DOM;
export const IS_ANDROID = mod.IS_ANDROID;
export const IS_ANDROID_CHROME = mod.IS_ANDROID_CHROME;
export const IS_APPLE = mod.IS_APPLE;
export const IS_APPLE_WEBKIT = mod.IS_APPLE_WEBKIT;
export const IS_CHROME = mod.IS_CHROME;
export const IS_FIREFOX = mod.IS_FIREFOX;
export const IS_IOS = mod.IS_IOS;
export const IS_SAFARI = mod.IS_SAFARI;
export const addClassNamesToElement = mod.addClassNamesToElement;
export const calculateZoomLevel = mod.calculateZoomLevel;
export const isBlockDomNode = mod.isBlockDomNode;
export const isHTMLAnchorElement = mod.isHTMLAnchorElement;
export const isHTMLElement = mod.isHTMLElement;
export const isInlineDomNode = mod.isInlineDomNode;
export const isMimeType = mod.isMimeType;
export const makeStateWrapper = mod.makeStateWrapper;
export const markSelection = mod.markSelection;
export const mediaFileReader = mod.mediaFileReader;
export const mergeRegister = mod.mergeRegister;
export const objectKlassEquals = mod.objectKlassEquals;
export const positionNodeOnRange = mod.positionNodeOnRange;
export const registerNestedElementResolver = mod.registerNestedElementResolver;
export const removeClassNamesFromElement = mod.removeClassNamesFromElement;
export const selectionAlwaysOnDisplay = mod.selectionAlwaysOnDisplay;