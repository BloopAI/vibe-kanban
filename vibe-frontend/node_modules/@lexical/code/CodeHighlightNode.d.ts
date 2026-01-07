/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { EditorConfig, LexicalNode, LexicalUpdateJSON, NodeKey, SerializedTextNode, Spread } from 'lexical';
import { ElementNode, TextNode } from 'lexical';
type SerializedCodeHighlightNode = Spread<{
    highlightType: string | null | undefined;
}, SerializedTextNode>;
/** @noInheritDoc */
export declare class CodeHighlightNode extends TextNode {
    /** @internal */
    __highlightType: string | null | undefined;
    constructor(text?: string, highlightType?: string | null | undefined, key?: NodeKey);
    static getType(): string;
    static clone(node: CodeHighlightNode): CodeHighlightNode;
    getHighlightType(): string | null | undefined;
    setHighlightType(highlightType?: string | null | undefined): this;
    canHaveFormat(): boolean;
    createDOM(config: EditorConfig): HTMLElement;
    updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean;
    static importJSON(serializedNode: SerializedCodeHighlightNode): CodeHighlightNode;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedCodeHighlightNode>): this;
    exportJSON(): SerializedCodeHighlightNode;
    setFormat(format: number): this;
    isParentRequired(): true;
    createParentElementNode(): ElementNode;
}
export declare function $createCodeHighlightNode(text?: string, highlightType?: string | null | undefined): CodeHighlightNode;
export declare function $isCodeHighlightNode(node: LexicalNode | CodeHighlightNode | null | undefined): node is CodeHighlightNode;
export {};
