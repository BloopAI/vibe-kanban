/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { NamedSignalsOutput } from '@lexical/extension';
import { LexicalEditor } from 'lexical';
export interface ClickableLinkConfig {
    /** Open clicked links in a new tab when true (default false) */
    newTab: boolean;
    /** Disable this extension when true (default false) */
    disabled: boolean;
}
export declare function registerClickableLink(editor: LexicalEditor, stores: NamedSignalsOutput<ClickableLinkConfig>, eventOptions?: Pick<AddEventListenerOptions, 'signal'>): () => void;
/**
 * Normally in a Lexical editor the `CLICK_COMMAND` on a LinkNode will cause the
 * selection to change instead of opening a link. This extension can be used to
 * restore the default behavior, e.g. when the editor is not editable.
 */
export declare const ClickableLinkExtension: import("lexical").LexicalExtension<ClickableLinkConfig, "@lexical/link/ClickableLink", NamedSignalsOutput<ClickableLinkConfig>, unknown>;
