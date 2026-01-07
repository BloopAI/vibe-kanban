/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { DOMConversionMap, NodeKey } from '../LexicalNode';
import { EditorConfig } from '../LexicalEditor';
import { LexicalNode } from '../LexicalNode';
import { SerializedTextNode, TextDetailType, TextModeType, TextNode } from './LexicalTextNode';
export type SerializedTabNode = SerializedTextNode;
/** @noInheritDoc */
export declare class TabNode extends TextNode {
    static getType(): string;
    static clone(node: TabNode): TabNode;
    constructor(key?: NodeKey);
    static importDOM(): DOMConversionMap | null;
    createDOM(config: EditorConfig): HTMLElement;
    static importJSON(serializedTabNode: SerializedTabNode): TabNode;
    setTextContent(text: string): this;
    spliceText(offset: number, delCount: number, newText: string, moveSelection?: boolean): TextNode;
    setDetail(detail: TextDetailType | number): this;
    setMode(type: TextModeType): this;
    canInsertTextBefore(): boolean;
    canInsertTextAfter(): boolean;
}
export declare function $createTabNode(): TabNode;
export declare function $isTabNode(node: LexicalNode | null | undefined): node is TabNode;
