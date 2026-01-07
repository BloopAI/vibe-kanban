/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor } from 'lexical';
import { OverflowNode } from '@lexical/overflow';
type OptionalProps = {
    remainingCharacters?: (characters: number) => void;
    strlen?: (input: string) => number;
};
export declare function useCharacterLimit(editor: LexicalEditor, maxCharacters: number, optional?: OptionalProps): void;
export declare function $mergePrevious(overflowNode: OverflowNode): void;
export {};
