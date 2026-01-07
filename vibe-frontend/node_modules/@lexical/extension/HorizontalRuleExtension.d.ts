/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { DOMConversionMap, DOMExportOutput, EditorConfig, LexicalCommand, LexicalNode, SerializedLexicalNode } from 'lexical';
import { DecoratorNode } from 'lexical';
export type SerializedHorizontalRuleNode = SerializedLexicalNode;
export declare const INSERT_HORIZONTAL_RULE_COMMAND: LexicalCommand<void>;
export declare class HorizontalRuleNode extends DecoratorNode<unknown> {
    static getType(): string;
    static clone(node: HorizontalRuleNode): HorizontalRuleNode;
    static importJSON(serializedNode: SerializedHorizontalRuleNode): HorizontalRuleNode;
    static importDOM(): DOMConversionMap | null;
    exportDOM(): DOMExportOutput;
    createDOM(config: EditorConfig): HTMLElement;
    getTextContent(): string;
    isInline(): false;
    updateDOM(): boolean;
}
export declare function $createHorizontalRuleNode(): HorizontalRuleNode;
export declare function $isHorizontalRuleNode(node: LexicalNode | null | undefined): node is HorizontalRuleNode;
/**
 * An extension for HorizontalRuleNode that provides an implementation that
 * works without any React dependency.
 */
export declare const HorizontalRuleExtension: import("lexical").LexicalExtension<import("lexical").ExtensionConfigBase, "@lexical/extension/HorizontalRule", unknown, unknown>;
