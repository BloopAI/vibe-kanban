/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Transformer } from './MarkdownTransformers';
import type { LexicalEditor } from 'lexical';
export declare function registerMarkdownShortcuts(editor: LexicalEditor, transformers?: Array<Transformer>): () => void;
