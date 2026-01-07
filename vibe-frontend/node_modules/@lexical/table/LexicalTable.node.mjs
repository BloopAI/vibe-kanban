/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const mod = await (process.env.NODE_ENV !== 'production' ? import('./LexicalTable.dev.mjs') : import('./LexicalTable.prod.mjs'));
export const $computeTableMap = mod.$computeTableMap;
export const $computeTableMapSkipCellCheck = mod.$computeTableMapSkipCellCheck;
export const $createTableCellNode = mod.$createTableCellNode;
export const $createTableNode = mod.$createTableNode;
export const $createTableNodeWithDimensions = mod.$createTableNodeWithDimensions;
export const $createTableRowNode = mod.$createTableRowNode;
export const $createTableSelection = mod.$createTableSelection;
export const $createTableSelectionFrom = mod.$createTableSelectionFrom;
export const $deleteTableColumn = mod.$deleteTableColumn;
export const $deleteTableColumnAtSelection = mod.$deleteTableColumnAtSelection;
export const $deleteTableColumn__EXPERIMENTAL = mod.$deleteTableColumn__EXPERIMENTAL;
export const $deleteTableRowAtSelection = mod.$deleteTableRowAtSelection;
export const $deleteTableRow__EXPERIMENTAL = mod.$deleteTableRow__EXPERIMENTAL;
export const $findCellNode = mod.$findCellNode;
export const $findTableNode = mod.$findTableNode;
export const $getElementForTableNode = mod.$getElementForTableNode;
export const $getNodeTriplet = mod.$getNodeTriplet;
export const $getTableAndElementByKey = mod.$getTableAndElementByKey;
export const $getTableCellNodeFromLexicalNode = mod.$getTableCellNodeFromLexicalNode;
export const $getTableCellNodeRect = mod.$getTableCellNodeRect;
export const $getTableColumnIndexFromTableCellNode = mod.$getTableColumnIndexFromTableCellNode;
export const $getTableNodeFromLexicalNodeOrThrow = mod.$getTableNodeFromLexicalNodeOrThrow;
export const $getTableRowIndexFromTableCellNode = mod.$getTableRowIndexFromTableCellNode;
export const $getTableRowNodeFromTableCellNodeOrThrow = mod.$getTableRowNodeFromTableCellNodeOrThrow;
export const $insertTableColumn = mod.$insertTableColumn;
export const $insertTableColumnAtSelection = mod.$insertTableColumnAtSelection;
export const $insertTableColumn__EXPERIMENTAL = mod.$insertTableColumn__EXPERIMENTAL;
export const $insertTableRow = mod.$insertTableRow;
export const $insertTableRowAtSelection = mod.$insertTableRowAtSelection;
export const $insertTableRow__EXPERIMENTAL = mod.$insertTableRow__EXPERIMENTAL;
export const $isScrollableTablesActive = mod.$isScrollableTablesActive;
export const $isTableCellNode = mod.$isTableCellNode;
export const $isTableNode = mod.$isTableNode;
export const $isTableRowNode = mod.$isTableRowNode;
export const $isTableSelection = mod.$isTableSelection;
export const $mergeCells = mod.$mergeCells;
export const $removeTableRowAtIndex = mod.$removeTableRowAtIndex;
export const $unmergeCell = mod.$unmergeCell;
export const INSERT_TABLE_COMMAND = mod.INSERT_TABLE_COMMAND;
export const TableCellHeaderStates = mod.TableCellHeaderStates;
export const TableCellNode = mod.TableCellNode;
export const TableExtension = mod.TableExtension;
export const TableNode = mod.TableNode;
export const TableObserver = mod.TableObserver;
export const TableRowNode = mod.TableRowNode;
export const applyTableHandlers = mod.applyTableHandlers;
export const getDOMCellFromTarget = mod.getDOMCellFromTarget;
export const getTableElement = mod.getTableElement;
export const getTableObserverFromTableElement = mod.getTableObserverFromTableElement;
export const registerTableCellUnmergeTransform = mod.registerTableCellUnmergeTransform;
export const registerTablePlugin = mod.registerTablePlugin;
export const registerTableSelectionObserver = mod.registerTableSelectionObserver;
export const setScrollableTablesActive = mod.setScrollableTablesActive;