/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { EntityMatch } from '@lexical/text';
import type { Klass, TextNode } from 'lexical';
export declare function useLexicalTextEntity<T extends TextNode>(getMatch: (text: string) => null | EntityMatch, targetNode: Klass<T>, createNode: (textNode: TextNode) => T): void;
