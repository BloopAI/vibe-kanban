/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor, LexicalNode } from 'lexical';
import { LexicalCommandLog } from './useLexicalCommandsLog';
export type CustomPrintNodeFn = (node: LexicalNode, obfuscateText?: boolean) => string | undefined;
export declare function generateContent(editor: LexicalEditor, commandsLog: LexicalCommandLog, exportDOM: boolean, customPrintNode?: CustomPrintNodeFn, obfuscateText?: boolean): string;
