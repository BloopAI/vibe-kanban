/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { SerializedEditorState } from './LexicalEditorState';
import type { LexicalNode, SerializedLexicalNode } from './LexicalNode';
import { CommandPayloadType, EditorUpdateOptions, LexicalCommand, LexicalEditor, SetListeners, Transform } from './LexicalEditor';
import { EditorState } from './LexicalEditorState';
export declare function isCurrentlyReadOnlyMode(): boolean;
export declare function errorOnReadOnly(): void;
export declare function errorOnInfiniteTransforms(): void;
export declare function getActiveEditorState(): EditorState;
export declare function getActiveEditor(): LexicalEditor;
export declare function internalGetActiveEditor(): LexicalEditor | null;
export declare function internalGetActiveEditorState(): EditorState | null;
export declare function $applyTransforms(editor: LexicalEditor, node: LexicalNode, transformsCache: Map<string, Array<Transform<LexicalNode>>>): void;
export declare function $parseSerializedNode(serializedNode: SerializedLexicalNode): LexicalNode;
export declare function parseEditorState(serializedEditorState: SerializedEditorState, editor: LexicalEditor, updateFn: void | (() => void)): EditorState;
export declare function readEditorState<V>(editor: LexicalEditor | null, editorState: EditorState, callbackFn: () => V): V;
export declare function $commitPendingUpdates(editor: LexicalEditor, recoveryEditorState?: EditorState): void;
export declare function triggerListeners<T extends keyof SetListeners>(type: T, editor: LexicalEditor, isCurrentlyEnqueuingUpdates: boolean, ...payload: SetListeners[T]): void;
export declare function triggerCommandListeners<TCommand extends LexicalCommand<unknown>>(editor: LexicalEditor, type: TCommand, payload: CommandPayloadType<TCommand>): boolean;
/**
 * A variant of updateEditor that will not defer if it is nested in an update
 * to the same editor, much like if it was an editor.dispatchCommand issued
 * within an update
 */
export declare function updateEditorSync(editor: LexicalEditor, updateFn: () => void, options?: EditorUpdateOptions): void;
export declare function updateEditor(editor: LexicalEditor, updateFn: () => void, options?: EditorUpdateOptions): void;
