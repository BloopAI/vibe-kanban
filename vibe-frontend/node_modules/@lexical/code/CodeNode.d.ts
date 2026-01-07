/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { CodeHighlightNode } from '@lexical/code';
import type { DOMConversionMap, DOMExportOutput, EditorConfig, LexicalEditor, LexicalNode, LexicalUpdateJSON, NodeKey, ParagraphNode, RangeSelection, SerializedElementNode, Spread, TabNode } from 'lexical';
import { ElementNode } from 'lexical';
export type SerializedCodeNode = Spread<{
    language: string | null | undefined;
    theme?: string | undefined;
}, SerializedElementNode>;
export declare const DEFAULT_CODE_LANGUAGE = "javascript";
export declare const getDefaultCodeLanguage: () => string;
/** @noInheritDoc */
export declare class CodeNode extends ElementNode {
    /** @internal */
    __language: string | null | undefined;
    /** @internal */
    __theme: string | undefined;
    /** @internal */
    __isSyntaxHighlightSupported: boolean;
    static getType(): string;
    static clone(node: CodeNode): CodeNode;
    constructor(language?: string | null | undefined, key?: NodeKey);
    afterCloneFrom(prevNode: this): void;
    createDOM(config: EditorConfig): HTMLElement;
    updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean;
    exportDOM(editor: LexicalEditor): DOMExportOutput;
    static importDOM(): DOMConversionMap | null;
    static importJSON(serializedNode: SerializedCodeNode): CodeNode;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedCodeNode>): this;
    exportJSON(): SerializedCodeNode;
    insertNewAfter(selection: RangeSelection, restoreSelection?: boolean): null | ParagraphNode | CodeHighlightNode | TabNode;
    canIndent(): false;
    collapseAtStart(): boolean;
    setLanguage(language: string | null | undefined): this;
    getLanguage(): string | null | undefined;
    setIsSyntaxHighlightSupported(isSupported: boolean): this;
    getIsSyntaxHighlightSupported(): boolean;
    setTheme(theme: string | null | undefined): this;
    getTheme(): string | undefined;
}
export declare function $createCodeNode(language?: string | null | undefined, theme?: string | null | undefined): CodeNode;
export declare function $isCodeNode(node: LexicalNode | null | undefined): node is CodeNode;
