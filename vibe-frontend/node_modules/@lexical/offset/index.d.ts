/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { EditorState, ElementNode, LexicalEditor, NodeKey, NodeMap, RangeSelection } from 'lexical';
type OffsetElementNode = {
    child: null | OffsetNode;
    end: number;
    key: NodeKey;
    next: null | OffsetNode;
    parent: null | OffsetElementNode;
    prev: null | OffsetNode;
    start: number;
    type: 'element';
};
type OffsetTextNode = {
    child: null;
    end: number;
    key: NodeKey;
    next: null | OffsetNode;
    parent: null | OffsetElementNode;
    prev: null | OffsetNode;
    start: number;
    type: 'text';
};
type OffsetInlineNode = {
    child: null;
    end: number;
    key: NodeKey;
    next: null | OffsetNode;
    parent: null | OffsetElementNode;
    prev: null | OffsetNode;
    start: number;
    type: 'inline';
};
type OffsetNode = OffsetElementNode | OffsetTextNode | OffsetInlineNode;
type OffsetMap = Map<NodeKey, OffsetNode>;
export declare class OffsetView {
    _offsetMap: OffsetMap;
    _firstNode: null | OffsetNode;
    _blockOffsetSize: number;
    constructor(offsetMap: OffsetMap, firstNode: null | OffsetNode, blockOffsetSize?: number);
    createSelectionFromOffsets(originalStart: number, originalEnd: number, diffOffsetView?: OffsetView): null | RangeSelection;
    getOffsetsFromSelection(selection: RangeSelection): [number, number];
}
export declare function $createChildrenArray(element: ElementNode, nodeMap: null | NodeMap): Array<NodeKey>;
/** @deprecated renamed to {@link $createChildrenArray} by @lexical/eslint-plugin rules-of-lexical */
export declare const createChildrenArray: typeof $createChildrenArray;
export declare function $createOffsetView(editor: LexicalEditor, blockOffsetSize?: number, editorState?: EditorState | null): OffsetView;
export {};
