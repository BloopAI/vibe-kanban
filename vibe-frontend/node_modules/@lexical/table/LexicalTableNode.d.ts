/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { BaseSelection, DOMConversionMap, DOMConversionOutput, DOMExportOutput, EditorConfig, ElementDOMSlot, ElementNode, LexicalEditor, LexicalNode, LexicalUpdateJSON, NodeKey, SerializedElementNode, Spread } from 'lexical';
import { type TableCellNode } from './LexicalTableCellNode';
import { TableDOMCell, TableDOMTable } from './LexicalTableObserver';
export type SerializedTableNode = Spread<{
    colWidths?: readonly number[];
    rowStriping?: boolean;
    frozenColumnCount?: number;
    frozenRowCount?: number;
}, SerializedElementNode>;
export declare function $isScrollableTablesActive(editor?: LexicalEditor): boolean;
export declare function setScrollableTablesActive(editor: LexicalEditor, active: boolean): void;
/** @noInheritDoc */
export declare class TableNode extends ElementNode {
    /** @internal */
    __rowStriping: boolean;
    __frozenColumnCount: number;
    __frozenRowCount: number;
    __colWidths?: readonly number[];
    static getType(): string;
    getColWidths(): readonly number[] | undefined;
    setColWidths(colWidths: readonly number[] | undefined): this;
    static clone(node: TableNode): TableNode;
    afterCloneFrom(prevNode: this): void;
    static importDOM(): DOMConversionMap | null;
    static importJSON(serializedNode: SerializedTableNode): TableNode;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedTableNode>): this;
    constructor(key?: NodeKey);
    exportJSON(): SerializedTableNode;
    extractWithChild(child: LexicalNode, selection: BaseSelection | null, destination: 'clone' | 'html'): boolean;
    getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLTableElement>;
    createDOM(config: EditorConfig, editor?: LexicalEditor): HTMLElement;
    updateTableWrapper(prevNode: this | null, tableWrapper: HTMLDivElement, tableElement: HTMLTableElement, config: EditorConfig): void;
    updateTableElement(prevNode: this | null, tableElement: HTMLTableElement, config: EditorConfig): void;
    updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean;
    exportDOM(editor: LexicalEditor): DOMExportOutput;
    canBeEmpty(): false;
    isShadowRoot(): boolean;
    getCordsFromCellNode(tableCellNode: TableCellNode, table: TableDOMTable): {
        x: number;
        y: number;
    };
    getDOMCellFromCords(x: number, y: number, table: TableDOMTable): null | TableDOMCell;
    getDOMCellFromCordsOrThrow(x: number, y: number, table: TableDOMTable): TableDOMCell;
    getCellNodeFromCords(x: number, y: number, table: TableDOMTable): null | TableCellNode;
    getCellNodeFromCordsOrThrow(x: number, y: number, table: TableDOMTable): TableCellNode;
    getRowStriping(): boolean;
    setRowStriping(newRowStriping: boolean): this;
    setFrozenColumns(columnCount: number): this;
    getFrozenColumns(): number;
    setFrozenRows(rowCount: number): this;
    getFrozenRows(): number;
    canSelectBefore(): true;
    canIndent(): false;
    getColumnCount(): number;
}
export declare function $getElementForTableNode(editor: LexicalEditor, tableNode: TableNode): TableDOMTable;
export declare function $convertTableElement(domNode: HTMLElement): DOMConversionOutput;
export declare function $createTableNode(): TableNode;
export declare function $isTableNode(node: LexicalNode | null | undefined): node is TableNode;
