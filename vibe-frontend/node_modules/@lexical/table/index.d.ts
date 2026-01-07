/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
export type { SerializedTableCellNode } from './LexicalTableCellNode';
export { $createTableCellNode, $isTableCellNode, TableCellHeaderStates, TableCellNode, } from './LexicalTableCellNode';
export type { InsertTableCommandPayload, InsertTableCommandPayloadHeaders, } from './LexicalTableCommands';
export { INSERT_TABLE_COMMAND } from './LexicalTableCommands';
export { type TableConfig, TableExtension } from './LexicalTableExtension';
export type { SerializedTableNode } from './LexicalTableNode';
export { $createTableNode, $getElementForTableNode, $isScrollableTablesActive, $isTableNode, setScrollableTablesActive, TableNode, } from './LexicalTableNode';
export type { TableDOMCell } from './LexicalTableObserver';
export { $getTableAndElementByKey, TableObserver } from './LexicalTableObserver';
export { registerTableCellUnmergeTransform, registerTablePlugin, registerTableSelectionObserver, } from './LexicalTablePluginHelpers';
export type { SerializedTableRowNode } from './LexicalTableRowNode';
export { $createTableRowNode, $isTableRowNode, TableRowNode, } from './LexicalTableRowNode';
export type { TableMapType, TableMapValueType, TableSelection, TableSelectionShape, } from './LexicalTableSelection';
export { $createTableSelection, $createTableSelectionFrom, $isTableSelection, } from './LexicalTableSelection';
export type { HTMLTableElementWithWithTableSelectionState } from './LexicalTableSelectionHelpers';
export { $findCellNode, $findTableNode, applyTableHandlers, getDOMCellFromTarget, getTableElement, getTableObserverFromTableElement, } from './LexicalTableSelectionHelpers';
export { $computeTableMap, $computeTableMapSkipCellCheck, $createTableNodeWithDimensions, $deleteTableColumn, $deleteTableColumn__EXPERIMENTAL, $deleteTableColumnAtSelection, $deleteTableRow__EXPERIMENTAL, $deleteTableRowAtSelection, $getNodeTriplet, $getTableCellNodeFromLexicalNode, $getTableCellNodeRect, $getTableColumnIndexFromTableCellNode, $getTableNodeFromLexicalNodeOrThrow, $getTableRowIndexFromTableCellNode, $getTableRowNodeFromTableCellNodeOrThrow, $insertTableColumn, $insertTableColumn__EXPERIMENTAL, $insertTableColumnAtSelection, $insertTableRow, $insertTableRow__EXPERIMENTAL, $insertTableRowAtSelection, $mergeCells, $removeTableRowAtIndex, $unmergeCell, } from './LexicalTableUtils';
