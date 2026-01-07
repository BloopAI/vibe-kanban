/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { EditorState, LexicalEditor } from 'lexical';
export declare function OnChangePlugin({ ignoreHistoryMergeTagChange, ignoreSelectionChange, onChange, }: {
    ignoreHistoryMergeTagChange?: boolean;
    ignoreSelectionChange?: boolean;
    onChange: (editorState: EditorState, editor: LexicalEditor, tags: Set<string>) => void;
}): null;
