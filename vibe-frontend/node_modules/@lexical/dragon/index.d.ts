/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { LexicalEditor } from 'lexical';
export declare function registerDragonSupport(editor: LexicalEditor): () => void;
export interface DragonConfig {
    disabled: boolean;
}
/**
 * Add Dragon speech to text input support to the editor, via the
 * \@lexical/dragon module.
 */
export declare const DragonExtension: import("lexical").LexicalExtension<DragonConfig, "@lexical/dragon", import("@lexical/extension").NamedSignalsOutput<DragonConfig>, unknown>;
