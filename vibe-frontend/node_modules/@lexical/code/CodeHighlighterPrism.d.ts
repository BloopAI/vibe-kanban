/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor, LexicalNode } from 'lexical';
import { CodeNode } from './CodeNode';
type TokenContent = string | Token | (string | Token)[];
export interface Token {
    type: string;
    alias: string | string[];
    content: TokenContent;
}
export interface Tokenizer {
    defaultLanguage: string;
    tokenize(code: string, language?: string): (string | Token)[];
    $tokenize(codeNode: CodeNode, language?: string): LexicalNode[];
}
export declare const PrismTokenizer: Tokenizer;
export declare function registerCodeHighlighting(editor: LexicalEditor, tokenizer?: Tokenizer): () => void;
export {};
