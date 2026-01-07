/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { BaseSelection, DOMConversionMap, EditorConfig, LexicalCommand, LexicalNode, LexicalUpdateJSON, NodeKey, RangeSelection, SerializedElementNode } from 'lexical';
import { ElementNode, Spread } from 'lexical';
export type LinkAttributes = {
    rel?: null | string;
    target?: null | string;
    title?: null | string;
};
export type AutoLinkAttributes = Partial<Spread<LinkAttributes, {
    isUnlinked?: boolean;
}>>;
export type SerializedLinkNode = Spread<{
    url: string;
}, Spread<LinkAttributes, SerializedElementNode>>;
type LinkHTMLElementType = HTMLAnchorElement | HTMLSpanElement;
/** @noInheritDoc */
export declare class LinkNode extends ElementNode {
    /** @internal */
    __url: string;
    /** @internal */
    __target: null | string;
    /** @internal */
    __rel: null | string;
    /** @internal */
    __title: null | string;
    static getType(): string;
    static clone(node: LinkNode): LinkNode;
    constructor(url?: string, attributes?: LinkAttributes, key?: NodeKey);
    createDOM(config: EditorConfig): LinkHTMLElementType;
    updateLinkDOM(prevNode: this | null, anchor: LinkHTMLElementType, config: EditorConfig): void;
    updateDOM(prevNode: this, anchor: LinkHTMLElementType, config: EditorConfig): boolean;
    static importDOM(): DOMConversionMap | null;
    static importJSON(serializedNode: SerializedLinkNode): LinkNode;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedLinkNode>): this;
    sanitizeUrl(url: string): string;
    exportJSON(): SerializedLinkNode | SerializedAutoLinkNode;
    getURL(): string;
    setURL(url: string): this;
    getTarget(): null | string;
    setTarget(target: null | string): this;
    getRel(): null | string;
    setRel(rel: null | string): this;
    getTitle(): null | string;
    setTitle(title: null | string): this;
    insertNewAfter(_: RangeSelection, restoreSelection?: boolean): null | ElementNode;
    canInsertTextBefore(): false;
    canInsertTextAfter(): false;
    canBeEmpty(): false;
    isInline(): true;
    extractWithChild(child: LexicalNode, selection: BaseSelection, destination: 'clone' | 'html'): boolean;
    isEmailURI(): boolean;
    isWebSiteURI(): boolean;
}
/**
 * Takes a URL and creates a LinkNode.
 * @param url - The URL the LinkNode should direct to.
 * @param attributes - Optional HTML a tag attributes \\{ target, rel, title \\}
 * @returns The LinkNode.
 */
export declare function $createLinkNode(url?: string, attributes?: LinkAttributes): LinkNode;
/**
 * Determines if node is a LinkNode.
 * @param node - The node to be checked.
 * @returns true if node is a LinkNode, false otherwise.
 */
export declare function $isLinkNode(node: LexicalNode | null | undefined): node is LinkNode;
export type SerializedAutoLinkNode = Spread<{
    isUnlinked: boolean;
}, SerializedLinkNode>;
export declare class AutoLinkNode extends LinkNode {
    /** @internal */
    /** Indicates whether the autolink was ever unlinked. **/
    __isUnlinked: boolean;
    constructor(url?: string, attributes?: AutoLinkAttributes, key?: NodeKey);
    static getType(): string;
    static clone(node: AutoLinkNode): AutoLinkNode;
    getIsUnlinked(): boolean;
    setIsUnlinked(value: boolean): this;
    createDOM(config: EditorConfig): LinkHTMLElementType;
    updateDOM(prevNode: this, anchor: LinkHTMLElementType, config: EditorConfig): boolean;
    static importJSON(serializedNode: SerializedAutoLinkNode): AutoLinkNode;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedAutoLinkNode>): this;
    static importDOM(): null;
    exportJSON(): SerializedAutoLinkNode;
    insertNewAfter(selection: RangeSelection, restoreSelection?: boolean): null | ElementNode;
}
/**
 * Takes a URL and creates an AutoLinkNode. AutoLinkNodes are generally automatically generated
 * during typing, which is especially useful when a button to generate a LinkNode is not practical.
 * @param url - The URL the LinkNode should direct to.
 * @param attributes - Optional HTML a tag attributes. \\{ target, rel, title \\}
 * @returns The LinkNode.
 */
export declare function $createAutoLinkNode(url?: string, attributes?: AutoLinkAttributes): AutoLinkNode;
/**
 * Determines if node is an AutoLinkNode.
 * @param node - The node to be checked.
 * @returns true if node is an AutoLinkNode, false otherwise.
 */
export declare function $isAutoLinkNode(node: LexicalNode | null | undefined): node is AutoLinkNode;
export declare const TOGGLE_LINK_COMMAND: LexicalCommand<string | ({
    url: string;
} & LinkAttributes) | null>;
/**
 * Generates or updates a LinkNode. It can also delete a LinkNode if the URL is null,
 * but saves any children and brings them up to the parent node.
 * @param urlOrAttributes - The URL the link directs to, or an attributes object with an url property
 * @param attributes - Optional HTML a tag attributes. \\{ target, rel, title \\}
 */
export declare function $toggleLink(urlOrAttributes: null | string | (LinkAttributes & {
    url: null | string;
}), attributes?: LinkAttributes): void;
/**
 * Formats a URL string by adding appropriate protocol if missing
 *
 * @param url - URL to format
 * @returns Formatted URL with appropriate protocol
 */
export declare function formatUrl(url: string): string;
export {};
