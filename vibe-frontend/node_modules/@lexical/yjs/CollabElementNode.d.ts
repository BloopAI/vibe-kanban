/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Binding } from '.';
import type { ElementNode, NodeKey, NodeMap } from 'lexical';
import type { AbstractType, XmlText } from 'yjs';
import { CollabDecoratorNode } from './CollabDecoratorNode';
import { CollabLineBreakNode } from './CollabLineBreakNode';
import { CollabTextNode } from './CollabTextNode';
type IntentionallyMarkedAsDirtyElement = boolean;
export declare class CollabElementNode {
    _key: NodeKey;
    _children: Array<CollabElementNode | CollabTextNode | CollabDecoratorNode | CollabLineBreakNode>;
    _xmlText: XmlText;
    _type: string;
    _parent: null | CollabElementNode;
    constructor(xmlText: XmlText, parent: null | CollabElementNode, type: string);
    getPrevNode(nodeMap: null | NodeMap): null | ElementNode;
    getNode(): null | ElementNode;
    getSharedType(): XmlText;
    getType(): string;
    getKey(): NodeKey;
    isEmpty(): boolean;
    getSize(): number;
    getOffset(): number;
    syncPropertiesFromYjs(binding: Binding, keysChanged: null | Set<string>): void;
    applyChildrenYjsDelta(binding: Binding, deltas: Array<{
        insert?: string | object | AbstractType<unknown>;
        delete?: number;
        retain?: number;
        attributes?: {
            [x: string]: unknown;
        };
    }>): void;
    syncChildrenFromYjs(binding: Binding): void;
    syncPropertiesFromLexical(binding: Binding, nextLexicalNode: ElementNode, prevNodeMap: null | NodeMap): void;
    _syncChildFromLexical(binding: Binding, index: number, key: NodeKey, prevNodeMap: null | NodeMap, dirtyElements: null | Map<NodeKey, IntentionallyMarkedAsDirtyElement>, dirtyLeaves: null | Set<NodeKey>): void;
    syncChildrenFromLexical(binding: Binding, nextLexicalNode: ElementNode, prevNodeMap: null | NodeMap, dirtyElements: null | Map<NodeKey, IntentionallyMarkedAsDirtyElement>, dirtyLeaves: null | Set<NodeKey>): void;
    append(collabNode: CollabElementNode | CollabDecoratorNode | CollabTextNode | CollabLineBreakNode): void;
    splice(binding: Binding, index: number, delCount: number, collabNode?: CollabElementNode | CollabDecoratorNode | CollabTextNode | CollabLineBreakNode): void;
    getChildOffset(collabNode: CollabElementNode | CollabTextNode | CollabDecoratorNode | CollabLineBreakNode): number;
    destroy(binding: Binding): void;
}
export declare function $createCollabElementNode(xmlText: XmlText, parent: null | CollabElementNode, type: string): CollabElementNode;
export {};
