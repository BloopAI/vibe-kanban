/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { TextMatchTransformer } from './MarkdownTransformers';
import { type TextNode } from 'lexical';
export declare function findOutermostTextMatchTransformer(textNode_: TextNode, textMatchTransformers: Array<TextMatchTransformer>): {
    startIndex: number;
    endIndex: number;
    transformer: TextMatchTransformer;
    match: RegExpMatchArray;
} | null;
export declare function importFoundTextMatchTransformer(textNode: TextNode, startIndex: number, endIndex: number, transformer: TextMatchTransformer, match: RegExpMatchArray): {
    transformedNode?: TextNode;
    nodeBefore: TextNode | undefined;
    nodeAfter: TextNode | undefined;
} | null;
