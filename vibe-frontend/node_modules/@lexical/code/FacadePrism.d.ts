/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { CodeNode } from './CodeNode';
import type { LexicalEditor, LexicalNode, NodeKey } from 'lexical';
import type { Token } from 'prismjs';
import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-cpp';
declare global {
    interface Window {
        Prism: typeof import('prismjs');
    }
}
export declare const Prism: typeof import('prismjs');
export declare const CODE_LANGUAGE_FRIENDLY_NAME_MAP: Record<string, string>;
export declare const CODE_LANGUAGE_MAP: Record<string, string>;
export declare function normalizeCodeLang(lang: string): string;
export declare function getLanguageFriendlyName(lang: string): string;
export declare const getCodeLanguages: () => Array<string>;
export declare function getCodeLanguageOptions(): [string, string][];
export declare function getCodeThemeOptions(): [string, string][];
export declare function isCodeLanguageLoaded(language: string): boolean;
export declare function loadCodeLanguage(language: string, editor?: LexicalEditor, codeNodeKey?: NodeKey): Promise<void>;
export declare function tokenizeDiffHighlight(tokens: (string | Token)[], language: string): Array<string | Token>;
export declare function $getHighlightNodes(codeNode: CodeNode, language: string): LexicalNode[];
