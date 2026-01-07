/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { HistoryState } from '@lexical/history';
import type { LexicalEditor } from 'lexical';
export declare function useHistory(editor: LexicalEditor, externalHistoryState?: HistoryState, delay?: number): void;
