/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { DOMExportOutput, EditorConfig, ElementNode, LexicalEditor, LexicalNode, LexicalUpdateJSON, NodeKey, SerializedElementNode, Spread } from 'lexical';
export type SerializedListNode = Spread<{
    listType: ListType;
    start: number;
    tag: ListNodeTagType;
}, SerializedElementNode>;
export type ListType = 'number' | 'bullet' | 'check';
export type ListNodeTagType = 'ul' | 'ol';
/** @noInheritDoc */
export declare class ListNode extends ElementNode {
    /** @internal */
    __tag: ListNodeTagType;
    /** @internal */
    __start: number;
    /** @internal */
    __listType: ListType;
    /** @internal */
    $config(): import("lexical").StaticNodeConfigRecord<"list", {
        $transform: (node: ListNode) => void;
        extends: typeof ElementNode;
        importDOM: import("lexical").DOMConversionMap<HTMLElement>;
    }>;
    constructor(listType?: ListType, start?: number, key?: NodeKey);
    afterCloneFrom(prevNode: this): void;
    getTag(): ListNodeTagType;
    setListType(type: ListType): this;
    getListType(): ListType;
    getStart(): number;
    setStart(start: number): this;
    createDOM(config: EditorConfig, _editor?: LexicalEditor): HTMLElement;
    updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedListNode>): this;
    exportDOM(editor: LexicalEditor): DOMExportOutput;
    exportJSON(): SerializedListNode;
    canBeEmpty(): false;
    canIndent(): false;
    splice(start: number, deleteCount: number, nodesToInsert: LexicalNode[]): this;
    extractWithChild(child: LexicalNode): boolean;
}
/**
 * Creates a ListNode of listType.
 * @param listType - The type of list to be created. Can be 'number', 'bullet', or 'check'.
 * @param start - Where an ordered list starts its count, start = 1 if left undefined.
 * @returns The new ListNode
 */
export declare function $createListNode(listType?: ListType, start?: number): ListNode;
/**
 * Checks to see if the node is a ListNode.
 * @param node - The node to be checked.
 * @returns true if the node is a ListNode, false otherwise.
 */
export declare function $isListNode(node: LexicalNode | null | undefined): node is ListNode;
