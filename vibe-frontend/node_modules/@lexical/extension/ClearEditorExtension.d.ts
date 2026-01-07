/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { LexicalEditor } from 'lexical';
export interface ClearEditorConfig {
    $onClear: () => void;
}
export declare function registerClearEditor(editor: LexicalEditor, $onClear?: () => void): () => void;
/**
 * An extension to provide an implementation of {@link CLEAR_EDITOR_COMMAND}
 */
export declare const ClearEditorExtension: import("lexical").LexicalExtension<ClearEditorConfig, "@lexical/extension/ClearEditor", import("./namedSignals").NamedSignalsOutput<ClearEditorConfig>, unknown>;
