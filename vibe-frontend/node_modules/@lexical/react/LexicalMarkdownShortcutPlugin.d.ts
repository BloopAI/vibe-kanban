/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Transformer } from '@lexical/markdown';
export declare const DEFAULT_TRANSFORMERS: Transformer[];
export declare function MarkdownShortcutPlugin({ transformers, }: Readonly<{
    transformers?: Array<Transformer>;
}>): null;
