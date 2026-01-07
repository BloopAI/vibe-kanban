/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { NamedSignalsOutput } from '@lexical/extension';
import { LexicalEditor } from 'lexical';
import { LinkAttributes } from './LexicalLinkNode';
export interface LinkConfig {
    /**
     * If this function is specified a {@link PASTE_COMMAND}
     * listener will be registered to wrap selected nodes
     * when a URL is pasted and `validateUrl(url)` returns true.
     * The default of `undefined` will not register this listener.
     *
     * In the implementation of {@link TOGGLE_LINK_COMMAND}
     * it will reject URLs that return false when specified.
     * The default of `undefined` will always accept URLs.
     */
    validateUrl: undefined | ((url: string) => boolean);
    /**
     * The default anchor tag attributes to use for
     * {@link TOGGLE_LINK_COMMAND}
     */
    attributes: undefined | LinkAttributes;
}
/** @internal */
export declare function registerLink(editor: LexicalEditor, stores: NamedSignalsOutput<LinkConfig>): () => void;
/**
 * Provides {@link LinkNode}, an implementation of
 * {@link TOGGLE_LINK_COMMAND}, and a {@link PASTE_COMMAND}
 * listener to wrap selected nodes in a link when a
 * URL is pasted and `validateUrl` is defined.
 */
export declare const LinkExtension: import("lexical").LexicalExtension<LinkConfig, "@lexical/link/Link", NamedSignalsOutput<LinkConfig>, unknown>;
