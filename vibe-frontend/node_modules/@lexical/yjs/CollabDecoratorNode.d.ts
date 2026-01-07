/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Binding } from '.';
import type { CollabElementNode } from './CollabElementNode';
import type { DecoratorNode, NodeKey, NodeMap } from 'lexical';
import type { XmlElement } from 'yjs';
export declare class CollabDecoratorNode {
    _xmlElem: XmlElement;
    _key: NodeKey;
    _parent: CollabElementNode;
    _type: string;
    constructor(xmlElem: XmlElement, parent: CollabElementNode, type: string);
    getPrevNode(nodeMap: null | NodeMap): null | DecoratorNode<unknown>;
    getNode(): null | DecoratorNode<unknown>;
    getSharedType(): XmlElement;
    getType(): string;
    getKey(): NodeKey;
    getSize(): number;
    getOffset(): number;
    syncPropertiesFromLexical(binding: Binding, nextLexicalNode: DecoratorNode<unknown>, prevNodeMap: null | NodeMap): void;
    syncPropertiesFromYjs(binding: Binding, keysChanged: null | Set<string>): void;
    destroy(binding: Binding): void;
}
export declare function $createCollabDecoratorNode(xmlElem: XmlElement, parent: CollabElementNode, type: string): CollabDecoratorNode;
