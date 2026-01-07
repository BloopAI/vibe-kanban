/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { JSX } from 'react';
import { HeadingTagType } from '@lexical/rich-text';
import { LexicalEditor, NodeKey } from 'lexical';
export type TableOfContentsEntry = [
    key: NodeKey,
    text: string,
    tag: HeadingTagType
];
type Props = {
    children: (values: Array<TableOfContentsEntry>, editor: LexicalEditor) => JSX.Element;
};
export declare function TableOfContentsPlugin({ children }: Props): JSX.Element;
export {};
