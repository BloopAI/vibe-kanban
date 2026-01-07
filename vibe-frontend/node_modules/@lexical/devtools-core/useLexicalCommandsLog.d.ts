/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor } from 'lexical';
import { LexicalCommand } from 'lexical';
export type LexicalCommandLog = ReadonlyArray<{
    index: number;
} & LexicalCommand<unknown> & {
    payload: unknown;
}>;
export declare function registerLexicalCommandLogger(editor: LexicalEditor, setLoggedCommands: (v: (oldValue: LexicalCommandLog) => LexicalCommandLog) => void): () => void;
export declare function useLexicalCommandsLog(editor: LexicalEditor): LexicalCommandLog;
