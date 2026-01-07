/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { BaseSelection, LexicalNode, NodeKey, PointType, TextFormatType } from 'lexical';
import { TableCellNode } from './LexicalTableCellNode';
import { TableNode } from './LexicalTableNode';
export type TableSelectionShape = {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
};
export type TableMapValueType = {
    cell: TableCellNode;
    startRow: number;
    startColumn: number;
};
export type TableMapType = Array<Array<TableMapValueType>>;
export declare class TableSelection implements BaseSelection {
    tableKey: NodeKey;
    anchor: PointType;
    focus: PointType;
    _cachedNodes: Array<LexicalNode> | null;
    dirty: boolean;
    constructor(tableKey: NodeKey, anchor: PointType, focus: PointType);
    getStartEndPoints(): [PointType, PointType];
    /**
     * {@link $createTableSelection} unfortunately makes it very easy to create
     * nonsense selections, so we have a method to see if the selection probably
     * makes sense.
     *
     * @returns true if the TableSelection is (probably) valid
     */
    isValid(): boolean;
    /**
     * Returns whether the Selection is "backwards", meaning the focus
     * logically precedes the anchor in the EditorState.
     * @returns true if the Selection is backwards, false otherwise.
     */
    isBackward(): boolean;
    getCachedNodes(): LexicalNode[] | null;
    setCachedNodes(nodes: LexicalNode[] | null): void;
    is(selection: null | BaseSelection): boolean;
    set(tableKey: NodeKey, anchorCellKey: NodeKey, focusCellKey: NodeKey): void;
    clone(): TableSelection;
    isCollapsed(): boolean;
    extract(): Array<LexicalNode>;
    insertRawText(text: string): void;
    insertText(): void;
    /**
     * Returns whether the provided TextFormatType is present on the Selection.
     * This will be true if any paragraph in table cells has the specified format.
     *
     * @param type the TextFormatType to check for.
     * @returns true if the provided format is currently toggled on on the Selection, false otherwise.
     */
    hasFormat(type: TextFormatType): boolean;
    insertNodes(nodes: Array<LexicalNode>): void;
    getShape(): TableSelectionShape;
    getNodes(): Array<LexicalNode>;
    getTextContent(): string;
}
export declare function $isTableSelection(x: unknown): x is TableSelection;
export declare function $createTableSelection(): TableSelection;
export declare function $createTableSelectionFrom(tableNode: TableNode, anchorCell: TableCellNode, focusCell: TableCellNode): TableSelection;
/**
 * Depth first visitor
 * @param node The starting node
 * @param $visit The function to call for each node. If the function returns false, then children of this node will not be explored
 */
export declare function $visitRecursively(node: LexicalNode, $visit: (childNode: LexicalNode) => boolean | undefined | void): void;
