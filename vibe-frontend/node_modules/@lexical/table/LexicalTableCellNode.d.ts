/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { DOMConversionMap, DOMConversionOutput, DOMExportOutput, EditorConfig, LexicalEditor, LexicalNode, LexicalUpdateJSON, NodeKey, SerializedElementNode, Spread } from 'lexical';
import { ElementNode } from 'lexical';
export declare const TableCellHeaderStates: {
    BOTH: number;
    COLUMN: number;
    NO_STATUS: number;
    ROW: number;
};
export type TableCellHeaderState = (typeof TableCellHeaderStates)[keyof typeof TableCellHeaderStates];
export type SerializedTableCellNode = Spread<{
    colSpan?: number;
    rowSpan?: number;
    headerState: TableCellHeaderState;
    width?: number;
    backgroundColor?: null | string;
    verticalAlign?: string;
}, SerializedElementNode>;
/** @noInheritDoc */
export declare class TableCellNode extends ElementNode {
    /** @internal */
    __colSpan: number;
    /** @internal */
    __rowSpan: number;
    /** @internal */
    __headerState: TableCellHeaderState;
    /** @internal */
    __width?: number | undefined;
    /** @internal */
    __backgroundColor: null | string;
    /** @internal */
    __verticalAlign?: undefined | string;
    static getType(): string;
    static clone(node: TableCellNode): TableCellNode;
    afterCloneFrom(node: this): void;
    static importDOM(): DOMConversionMap | null;
    static importJSON(serializedNode: SerializedTableCellNode): TableCellNode;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedTableCellNode>): this;
    constructor(headerState?: number, colSpan?: number, width?: number, key?: NodeKey);
    createDOM(config: EditorConfig): HTMLTableCellElement;
    exportDOM(editor: LexicalEditor): DOMExportOutput;
    exportJSON(): SerializedTableCellNode;
    getColSpan(): number;
    setColSpan(colSpan: number): this;
    getRowSpan(): number;
    setRowSpan(rowSpan: number): this;
    getTag(): 'th' | 'td';
    setHeaderStyles(headerState: TableCellHeaderState, mask?: TableCellHeaderState): this;
    getHeaderStyles(): TableCellHeaderState;
    setWidth(width: number | undefined): this;
    getWidth(): number | undefined;
    getBackgroundColor(): null | string;
    setBackgroundColor(newBackgroundColor: null | string): this;
    getVerticalAlign(): undefined | string;
    setVerticalAlign(newVerticalAlign: null | undefined | string): this;
    toggleHeaderStyle(headerStateToToggle: TableCellHeaderState): this;
    hasHeaderState(headerState: TableCellHeaderState): boolean;
    hasHeader(): boolean;
    updateDOM(prevNode: this): boolean;
    isShadowRoot(): boolean;
    collapseAtStart(): true;
    canBeEmpty(): false;
    canIndent(): false;
}
export declare function $convertTableCellNodeElement(domNode: Node): DOMConversionOutput;
export declare function $createTableCellNode(headerState?: TableCellHeaderState, colSpan?: number, width?: number): TableCellNode;
export declare function $isTableCellNode(node: LexicalNode | null | undefined): node is TableCellNode;
