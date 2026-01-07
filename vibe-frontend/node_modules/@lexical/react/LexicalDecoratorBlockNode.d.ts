/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { ElementFormatType, LexicalNode, LexicalUpdateJSON, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import type { JSX } from 'react';
import { DecoratorNode } from 'lexical';
export type SerializedDecoratorBlockNode = Spread<{
    format: ElementFormatType;
}, SerializedLexicalNode>;
export declare class DecoratorBlockNode extends DecoratorNode<JSX.Element> {
    __format: ElementFormatType;
    constructor(format?: ElementFormatType, key?: NodeKey);
    exportJSON(): SerializedDecoratorBlockNode;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedDecoratorBlockNode>): this;
    canIndent(): false;
    createDOM(): HTMLElement;
    updateDOM(): false;
    setFormat(format: ElementFormatType): this;
    isInline(): false;
}
export declare function $isDecoratorBlockNode(node: LexicalNode | null | undefined): node is DecoratorBlockNode;
