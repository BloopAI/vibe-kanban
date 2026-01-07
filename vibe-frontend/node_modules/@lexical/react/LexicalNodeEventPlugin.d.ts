/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Klass, LexicalEditor, LexicalNode, NodeKey } from 'lexical';
export declare function NodeEventPlugin({ nodeType, eventType, eventListener, }: {
    nodeType: Klass<LexicalNode>;
    eventType: string;
    eventListener: (event: Event, editor: LexicalEditor, nodeKey: NodeKey) => void;
}): null;
