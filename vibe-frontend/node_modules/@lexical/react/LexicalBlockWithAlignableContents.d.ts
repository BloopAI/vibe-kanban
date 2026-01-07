/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { ElementFormatType, NodeKey } from 'lexical';
import type { JSX } from 'react';
import { ReactNode } from 'react';
type Props = Readonly<{
    children: ReactNode;
    format?: ElementFormatType | null;
    nodeKey: NodeKey;
    className: Readonly<{
        base: string;
        focus: string;
    }>;
}>;
export declare function BlockWithAlignableContents({ children, format, nodeKey, className, }: Props): JSX.Element;
export {};
