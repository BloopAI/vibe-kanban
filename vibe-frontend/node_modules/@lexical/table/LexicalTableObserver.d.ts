/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor, NodeKey, TextFormatType } from 'lexical';
import { TableCellNode } from './LexicalTableCellNode';
import { TableNode } from './LexicalTableNode';
import { type TableSelection } from './LexicalTableSelection';
import { HTMLTableElementWithWithTableSelectionState } from './LexicalTableSelectionHelpers';
export type TableDOMCell = {
    elem: HTMLElement;
    highlighted: boolean;
    hasBackgroundColor: boolean;
    x: number;
    y: number;
};
export type TableDOMRows = Array<Array<TableDOMCell | undefined> | undefined>;
export type TableDOMTable = {
    domRows: TableDOMRows;
    columns: number;
    rows: number;
};
export declare function $getTableAndElementByKey(tableNodeKey: NodeKey, editor?: LexicalEditor): {
    tableNode: TableNode;
    tableElement: HTMLTableElementWithWithTableSelectionState;
};
export declare class TableObserver {
    focusX: number;
    focusY: number;
    listenersToRemove: Set<() => void>;
    table: TableDOMTable;
    isHighlightingCells: boolean;
    anchorX: number;
    anchorY: number;
    tableNodeKey: NodeKey;
    anchorCell: TableDOMCell | null;
    focusCell: TableDOMCell | null;
    anchorCellNodeKey: NodeKey | null;
    focusCellNodeKey: NodeKey | null;
    editor: LexicalEditor;
    tableSelection: TableSelection | null;
    hasHijackedSelectionStyles: boolean;
    isSelecting: boolean;
    pointerType: string | null;
    shouldCheckSelection: boolean;
    abortController: AbortController;
    listenerOptions: {
        signal: AbortSignal;
    };
    nextFocus: {
        focusCell: TableDOMCell;
        override: boolean;
    } | null;
    constructor(editor: LexicalEditor, tableNodeKey: string);
    getTable(): TableDOMTable;
    removeListeners(): void;
    $lookup(): {
        tableNode: TableNode;
        tableElement: HTMLTableElementWithWithTableSelectionState;
    };
    trackTable(): void;
    $clearHighlight(): void;
    $enableHighlightStyle(): void;
    $disableHighlightStyle(): void;
    $updateTableTableSelection(selection: TableSelection | null): void;
    /**
     * @internal
     * Firefox has a strange behavior where pressing the down arrow key from
     * above the table will move the caret after the table and then lexical
     * will select the last cell instead of the first.
     * We do still want to let the browser handle caret movement but we will
     * use this property to "tag" the update so that we can recheck the
     * selection after the event is processed.
     */
    setShouldCheckSelection(): void;
    /**
     * @internal
     */
    getAndClearShouldCheckSelection(): boolean;
    /**
     * @internal
     * When handling mousemove events we track what the focus cell should be, but
     * the DOM selection may end up somewhere else entirely. We don't have an elegant
     * way to handle this after the DOM selection has been resolved in a
     * SELECTION_CHANGE_COMMAND callback.
     */
    setNextFocus(nextFocus: null | {
        focusCell: TableDOMCell;
        override: boolean;
    }): void;
    /** @internal */
    getAndClearNextFocus(): {
        focusCell: TableDOMCell;
        override: boolean;
    } | null;
    /** @internal */
    updateDOMSelection(): void;
    $setFocusCellForSelection(cell: TableDOMCell, ignoreStart?: boolean): boolean;
    $getAnchorTableCell(): TableCellNode | null;
    $getAnchorTableCellOrThrow(): TableCellNode;
    $getFocusTableCell(): TableCellNode | null;
    $getFocusTableCellOrThrow(): TableCellNode;
    $setAnchorCellForSelection(cell: TableDOMCell): void;
    $formatCells(type: TextFormatType): void;
    $clearText(): void;
}
