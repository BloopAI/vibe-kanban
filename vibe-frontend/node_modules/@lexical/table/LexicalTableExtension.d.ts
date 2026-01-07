/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
export interface TableConfig {
    /**
     * When `false` (default `true`), merged cell support (colspan and rowspan) will be disabled and all
     * tables will be forced into a regular grid with 1x1 table cells.
     */
    hasCellMerge: boolean;
    /**
     * When `false` (default `true`), the background color of TableCellNode will always be removed.
     */
    hasCellBackgroundColor: boolean;
    /**
     * When `true` (default `true`), the tab key can be used to navigate table cells.
     */
    hasTabHandler: boolean;
    /**
     * When `true` (default `true`), tables will be wrapped in a `<div>` to enable horizontal scrolling
     */
    hasHorizontalScroll: boolean;
}
/**
 * Configures {@link TableNode}, {@link TableRowNode}, {@link TableCellNode} and
 * registers table behaviors (see {@link TableConfig})
 */
export declare const TableExtension: import("lexical").LexicalExtension<TableConfig, "@lexical/table/Table", import("@lexical/extension").NamedSignalsOutput<TableConfig>, unknown>;
