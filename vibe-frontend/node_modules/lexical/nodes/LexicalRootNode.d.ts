/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalNode, SerializedLexicalNode } from '../LexicalNode';
import type { SerializedElementNode } from './LexicalElementNode';
import { ElementNode } from './LexicalElementNode';
export type SerializedRootNode<T extends SerializedLexicalNode = SerializedLexicalNode> = SerializedElementNode<T>;
/** @noInheritDoc */
export declare class RootNode extends ElementNode {
    /** @internal */
    __cachedText: null | string;
    static getType(): string;
    static clone(): RootNode;
    constructor();
    getTopLevelElementOrThrow(): never;
    getTextContent(): string;
    remove(): never;
    replace<N = LexicalNode>(node: N): never;
    insertBefore(nodeToInsert: LexicalNode): LexicalNode;
    insertAfter(nodeToInsert: LexicalNode): LexicalNode;
    updateDOM(prevNode: this, dom: HTMLElement): false;
    splice(start: number, deleteCount: number, nodesToInsert: LexicalNode[]): this;
    static importJSON(serializedNode: SerializedRootNode): RootNode;
    collapseAtStart(): true;
}
export declare function $createRootNode(): RootNode;
export declare function $isRootNode(node: RootNode | LexicalNode | null | undefined): node is RootNode;
