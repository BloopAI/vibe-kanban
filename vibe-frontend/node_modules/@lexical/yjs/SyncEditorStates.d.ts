/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { EditorState, NodeKey } from 'lexical';
import { Text as YText, YEvent } from 'yjs';
import { Binding, Provider } from '.';
import { SyncCursorPositionsFn } from './SyncCursors';
export declare function syncYjsChangesToLexical(binding: Binding, provider: Provider, events: Array<YEvent<YText>>, isFromUndoManger: boolean, syncCursorPositionsFn?: SyncCursorPositionsFn): void;
type IntentionallyMarkedAsDirtyElement = boolean;
export declare function syncLexicalUpdateToYjs(binding: Binding, provider: Provider, prevEditorState: EditorState, currEditorState: EditorState, dirtyElements: Map<NodeKey, IntentionallyMarkedAsDirtyElement>, dirtyLeaves: Set<NodeKey>, normalizedNodes: Set<NodeKey>, tags: Set<string>): void;
export {};
