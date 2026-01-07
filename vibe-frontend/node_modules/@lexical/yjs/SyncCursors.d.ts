/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Binding } from './Bindings';
import type { BaseSelection, NodeKey } from 'lexical';
import { Provider, UserState } from '.';
import { CollabDecoratorNode } from './CollabDecoratorNode';
import { CollabElementNode } from './CollabElementNode';
import { CollabLineBreakNode } from './CollabLineBreakNode';
import { CollabTextNode } from './CollabTextNode';
export type CursorSelection = {
    anchor: {
        key: NodeKey;
        offset: number;
    };
    caret: HTMLElement;
    color: string;
    focus: {
        key: NodeKey;
        offset: number;
    };
    name: HTMLSpanElement;
    selections: Array<HTMLElement>;
};
export type Cursor = {
    color: string;
    name: string;
    selection: null | CursorSelection;
};
type AnyCollabNode = CollabDecoratorNode | CollabElementNode | CollabTextNode | CollabLineBreakNode;
export declare function getAnchorAndFocusCollabNodesForUserState(binding: Binding, userState: UserState): {
    anchorCollabNode: AnyCollabNode | null;
    anchorOffset: number;
    focusCollabNode: AnyCollabNode | null;
    focusOffset: number;
};
export declare function $syncLocalCursorPosition(binding: Binding, provider: Provider): void;
export type SyncCursorPositionsFn = (binding: Binding, provider: Provider, options?: SyncCursorPositionsOptions) => void;
export type SyncCursorPositionsOptions = {
    getAwarenessStates?: (binding: Binding, provider: Provider) => Map<number, UserState>;
};
export declare function syncCursorPositions(binding: Binding, provider: Provider, options?: SyncCursorPositionsOptions): void;
export declare function syncLexicalSelectionToYjs(binding: Binding, provider: Provider, prevSelection: null | BaseSelection, nextSelection: null | BaseSelection): void;
export {};
