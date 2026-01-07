/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Binding } from '.';
import type { CollabElementNode } from './CollabElementNode';
import type { LineBreakNode, NodeKey } from 'lexical';
import type { Map as YMap } from 'yjs';
export declare class CollabLineBreakNode {
    _map: YMap<unknown>;
    _key: NodeKey;
    _parent: CollabElementNode;
    _type: 'linebreak';
    constructor(map: YMap<unknown>, parent: CollabElementNode);
    getNode(): null | LineBreakNode;
    getKey(): NodeKey;
    getSharedType(): YMap<unknown>;
    getType(): string;
    getSize(): number;
    getOffset(): number;
    destroy(binding: Binding): void;
}
export declare function $createCollabLineBreakNode(map: YMap<unknown>, parent: CollabElementNode): CollabLineBreakNode;
