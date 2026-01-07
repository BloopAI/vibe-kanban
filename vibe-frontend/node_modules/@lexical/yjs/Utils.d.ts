/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Binding, YjsNode } from '.';
import { EditorState, LexicalNode, NodeKey, RangeSelection } from 'lexical';
import { Map as YMap, XmlElement, XmlText } from 'yjs';
import { CollabDecoratorNode } from './CollabDecoratorNode';
import { CollabElementNode } from './CollabElementNode';
import { CollabLineBreakNode } from './CollabLineBreakNode';
import { CollabTextNode } from './CollabTextNode';
export declare function getIndexOfYjsNode(yjsParentNode: YjsNode, yjsNode: YjsNode): number;
export declare function $createCollabNodeFromLexicalNode(binding: Binding, lexicalNode: LexicalNode, parent: CollabElementNode): CollabElementNode | CollabTextNode | CollabLineBreakNode | CollabDecoratorNode;
export declare function getNodeTypeFromSharedType(sharedType: XmlText | YMap<unknown> | XmlElement): string | undefined;
export declare function $getOrInitCollabNodeFromSharedType(binding: Binding, sharedType: XmlText | YMap<unknown> | XmlElement, parent?: CollabElementNode): CollabElementNode | CollabTextNode | CollabLineBreakNode | CollabDecoratorNode;
export declare function createLexicalNodeFromCollabNode(binding: Binding, collabNode: CollabElementNode | CollabTextNode | CollabDecoratorNode | CollabLineBreakNode, parentKey: NodeKey): LexicalNode;
export declare function $syncPropertiesFromYjs(binding: Binding, sharedType: XmlText | YMap<unknown> | XmlElement, lexicalNode: LexicalNode, keysChanged: null | Set<string>): void;
export declare function syncPropertiesFromLexical(binding: Binding, sharedType: XmlText | YMap<unknown> | XmlElement, prevLexicalNode: null | LexicalNode, nextLexicalNode: LexicalNode): void;
export declare function spliceString(str: string, index: number, delCount: number, newText: string): string;
export declare function getPositionFromElementAndOffset(node: CollabElementNode, offset: number, boundaryIsEdge: boolean): {
    length: number;
    node: CollabElementNode | CollabTextNode | CollabDecoratorNode | CollabLineBreakNode | null;
    nodeIndex: number;
    offset: number;
};
export declare function doesSelectionNeedRecovering(selection: RangeSelection): boolean;
export declare function syncWithTransaction(binding: Binding, fn: () => void): void;
export declare function $moveSelectionToPreviousNode(anchorNodeKey: string, currentEditorState: EditorState): void;
