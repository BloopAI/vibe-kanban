/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { type EditorSetOptions, type EditorUpdateOptions } from 'lexical';
export interface InitialStateConfig {
    updateOptions: EditorUpdateOptions;
    setOptions: EditorSetOptions;
}
/**
 * An extension to set the initial state of the editor from
 * a function or serialized JSON EditorState. This is
 * implicitly included with all editors built with
 * Lexical Extension. This happens in the `afterRegistration`
 * phase so your initial state may depend on registered commands,
 * but you should not call `editor.setRootElement` earlier than
 * this phase to avoid rendering an empty editor first.
 */
export declare const InitialStateExtension: import("lexical").LexicalExtension<InitialStateConfig, "@lexical/extension/InitialState", unknown, {
    $initialEditorState: import("lexical").InitialEditorStateType;
    initialized: boolean;
}>;
