/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
export type DefaultSelection = 'rootStart' | 'rootEnd';
export interface AutoFocusConfig {
    /**
     * Where to move the selection when the editor is focused and there is no
     * existing selection. Can be "rootStart" or "rootEnd" (the default).
     */
    defaultSelection: DefaultSelection;
    /**
     * The initial state of disabled
     */
    disabled: boolean;
}
/**
 * An Extension to focus the LexicalEditor when the root element is set
 * (typically only when the editor is first created).
 */
export declare const AutoFocusExtension: import("lexical").LexicalExtension<AutoFocusConfig, "@lexical/extension/AutoFocus", import("./namedSignals").NamedSignalsOutput<AutoFocusConfig>, unknown>;
