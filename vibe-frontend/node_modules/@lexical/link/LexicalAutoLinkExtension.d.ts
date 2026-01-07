/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor } from 'lexical';
import { type AutoLinkAttributes } from './LexicalLinkNode';
export type ChangeHandler = (url: string | null, prevUrl: string | null) => void;
export interface LinkMatcherResult {
    attributes?: AutoLinkAttributes;
    index: number;
    length: number;
    text: string;
    url: string;
}
export type LinkMatcher = (text: string) => LinkMatcherResult | null;
export declare function createLinkMatcherWithRegExp(regExp: RegExp, urlTransformer?: (text: string) => string): (text: string) => {
    index: number;
    length: number;
    text: string;
    url: string;
} | null;
export interface AutoLinkConfig {
    matchers: LinkMatcher[];
    changeHandlers: ChangeHandler[];
}
export declare function registerAutoLink(editor: LexicalEditor, config?: AutoLinkConfig): () => void;
/**
 * An extension to automatically create AutoLinkNode from text
 * that matches the configured matchers. No default implementation
 * is provided for any matcher, see {@link createLinkMatcherWithRegExp}
 * for a helper function to create a matcher from a RegExp, and the
 * Playground's [AutoLinkPlugin](https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/AutoLinkPlugin/index.tsx)
 * for some example RegExps that could be used.
 *
 * The given `matchers` and `changeHandlers` will be merged by
 * concatenating the configured arrays.
 */
export declare const AutoLinkExtension: import("lexical").LexicalExtension<AutoLinkConfig, "@lexical/link/AutoLink", unknown, unknown>;
