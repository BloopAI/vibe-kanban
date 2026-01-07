/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { EditorConfig, LexicalNode, SerializedTextNode } from 'lexical';
import { TextNode } from 'lexical';
/** @noInheritDoc */
export declare class HashtagNode extends TextNode {
    static getType(): string;
    static clone(node: HashtagNode): HashtagNode;
    createDOM(config: EditorConfig): HTMLElement;
    static importJSON(serializedNode: SerializedTextNode): HashtagNode;
    canInsertTextBefore(): boolean;
    isTextEntity(): true;
}
/**
 * Generates a HashtagNode, which is a string following the format of a # followed by some text, eg. #lexical.
 * @param text - The text used inside the HashtagNode.
 * @returns - The HashtagNode with the embedded text.
 */
export declare function $createHashtagNode(text?: string): HashtagNode;
/**
 * Determines if node is a HashtagNode.
 * @param node - The node to be checked.
 * @returns true if node is a HashtagNode, false otherwise.
 */
export declare function $isHashtagNode(node: LexicalNode | null | undefined): node is HashtagNode;
