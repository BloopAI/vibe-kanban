/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor } from 'lexical';
import { type ReadonlySignal } from './signals';
export declare function registerTabIndentation(editor: LexicalEditor, maxIndent?: number | ReadonlySignal<null | number>): () => void;
export interface TabIndentationConfig {
    disabled: boolean;
    maxIndent: null | number;
}
/**
 * This extension adds the ability to indent content using the tab key. Generally, we don't
 * recommend using this plugin as it could negatively affect accessibility for keyboard
 * users, causing focus to become trapped within the editor.
 */
export declare const TabIndentationExtension: import("lexical").LexicalExtension<TabIndentationConfig, "@lexical/extension/TabIndentation", import("./namedSignals").NamedSignalsOutput<TabIndentationConfig>, unknown>;
