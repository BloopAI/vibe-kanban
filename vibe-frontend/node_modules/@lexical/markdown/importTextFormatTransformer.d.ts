/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { TextFormatTransformersIndex } from './MarkdownImport';
import type { TextFormatTransformer } from './MarkdownTransformers';
import type { TextNode } from 'lexical';
export declare function findOutermostTextFormatTransformer(textNode: TextNode, textFormatTransformersIndex: TextFormatTransformersIndex): {
    startIndex: number;
    endIndex: number;
    transformer: TextFormatTransformer;
    match: RegExpMatchArray;
} | null;
export declare function importTextFormatTransformer(textNode: TextNode, startIndex: number, endIndex: number, transformer: TextFormatTransformer, match: RegExpMatchArray): {
    transformedNode: TextNode;
    nodeBefore: TextNode | undefined;
    nodeAfter: TextNode | undefined;
};
