/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Binding } from '.';
import type { CollabElementNode } from './CollabElementNode';
import type { NodeKey, NodeMap, TextNode } from 'lexical';
import type { Map as YMap } from 'yjs';
export declare class CollabTextNode {
    _map: YMap<unknown>;
    _key: NodeKey;
    _parent: CollabElementNode;
    _text: string;
    _type: string;
    _normalized: boolean;
    constructor(map: YMap<unknown>, text: string, parent: CollabElementNode, type: string);
    getPrevNode(nodeMap: null | NodeMap): null | TextNode;
    getNode(): null | TextNode;
    getSharedType(): YMap<unknown>;
    getType(): string;
    getKey(): NodeKey;
    getSize(): number;
    getOffset(): number;
    spliceText(index: number, delCount: number, newText: string): void;
    syncPropertiesAndTextFromLexical(binding: Binding, nextLexicalNode: TextNode, prevNodeMap: null | NodeMap): void;
    syncPropertiesAndTextFromYjs(binding: Binding, keysChanged: null | Set<string>): void;
    destroy(binding: Binding): void;
}
export declare function $createCollabTextNode(map: YMap<unknown>, text: string, parent: CollabElementNode, type: string): CollabTextNode;
