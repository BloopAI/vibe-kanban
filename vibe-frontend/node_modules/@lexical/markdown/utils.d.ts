/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { type ElementNode, type LexicalNode, type TextFormatType } from 'lexical';
import { ElementTransformer, MultilineElementTransformer, TextFormatTransformer, TextMatchTransformer, Transformer } from './MarkdownTransformers';
type MarkdownFormatKind = 'noTransformation' | 'paragraphH1' | 'paragraphH2' | 'paragraphH3' | 'paragraphH4' | 'paragraphH5' | 'paragraphH6' | 'paragraphBlockQuote' | 'paragraphUnorderedList' | 'paragraphOrderedList' | 'paragraphCodeBlock' | 'horizontalRule' | 'bold' | 'code' | 'italic' | 'underline' | 'strikethrough' | 'italic_bold' | 'strikethrough_italic' | 'strikethrough_bold' | 'strikethrough_italic_bold' | 'link';
type MarkdownCriteria = Readonly<{
    export?: (node: LexicalNode, traverseChildren: (elementNode: ElementNode) => string) => string | null;
    exportFormat?: TextFormatType;
    exportTag?: string;
    exportTagClose?: string;
    markdownFormatKind: MarkdownFormatKind | null | undefined;
    regEx: RegExp;
    regExForAutoFormatting: RegExp;
    requiresParagraphStart: boolean | null | undefined;
}>;
type MarkdownCriteriaArray = Array<MarkdownCriteria>;
export declare function getAllMarkdownCriteriaForParagraphs(): MarkdownCriteriaArray;
export declare function getAllMarkdownCriteriaForTextNodes(): MarkdownCriteriaArray;
export declare function indexBy<T>(list: Array<T>, callback: (arg0: T) => string | undefined): Readonly<Record<string, Array<T>>>;
export declare function transformersByType(transformers: Array<Transformer>): Readonly<{
    element: Array<ElementTransformer>;
    multilineElement: Array<MultilineElementTransformer>;
    textFormat: Array<TextFormatTransformer>;
    textMatch: Array<TextMatchTransformer>;
}>;
export declare const PUNCTUATION_OR_SPACE: RegExp;
export declare function isEmptyParagraph(node: LexicalNode): boolean;
export {};
