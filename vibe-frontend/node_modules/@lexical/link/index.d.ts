/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { $toggleLink } from './LexicalLinkNode';
export { type ClickableLinkConfig, ClickableLinkExtension, registerClickableLink, } from './ClickableLinkExtension';
export { type AutoLinkConfig, AutoLinkExtension, type ChangeHandler, createLinkMatcherWithRegExp, type LinkMatcher, registerAutoLink, } from './LexicalAutoLinkExtension';
export { LinkExtension, registerLink } from './LexicalLinkExtension';
export { $createAutoLinkNode, $createLinkNode, $isAutoLinkNode, $isLinkNode, $toggleLink, type AutoLinkAttributes, AutoLinkNode, formatUrl, type LinkAttributes, LinkNode, type SerializedAutoLinkNode, type SerializedLinkNode, TOGGLE_LINK_COMMAND, } from './LexicalLinkNode';
/** @deprecated renamed to {@link $toggleLink} by @lexical/eslint-plugin rules-of-lexical */
export declare const toggleLink: typeof $toggleLink;
