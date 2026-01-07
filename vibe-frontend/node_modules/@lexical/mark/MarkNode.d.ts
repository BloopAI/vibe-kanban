/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { BaseSelection, EditorConfig, LexicalNode, LexicalUpdateJSON, NodeKey, RangeSelection, SerializedElementNode, Spread } from 'lexical';
import { ElementNode } from 'lexical';
export type SerializedMarkNode = Spread<{
    ids: Array<string>;
}, SerializedElementNode>;
/** @noInheritDoc */
export declare class MarkNode extends ElementNode {
    /** @internal */
    __ids: readonly string[];
    static getType(): string;
    static clone(node: MarkNode): MarkNode;
    static importDOM(): null;
    static importJSON(serializedNode: SerializedMarkNode): MarkNode;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedMarkNode>): this;
    exportJSON(): SerializedMarkNode;
    constructor(ids?: readonly string[], key?: NodeKey);
    createDOM(config: EditorConfig): HTMLElement;
    updateDOM(prevNode: this, element: HTMLElement, config: EditorConfig): boolean;
    hasID(id: string): boolean;
    getIDs(): Array<string>;
    setIDs(ids: readonly string[]): this;
    addID(id: string): this;
    deleteID(id: string): this;
    insertNewAfter(selection: RangeSelection, restoreSelection?: boolean): null | ElementNode;
    canInsertTextBefore(): false;
    canInsertTextAfter(): false;
    canBeEmpty(): false;
    isInline(): true;
    extractWithChild(child: LexicalNode, selection: BaseSelection, destination: 'clone' | 'html'): boolean;
    excludeFromCopy(destination: 'clone' | 'html'): boolean;
}
export declare function $createMarkNode(ids?: readonly string[]): MarkNode;
export declare function $isMarkNode(node: LexicalNode | null): node is MarkNode;
