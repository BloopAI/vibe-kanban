/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { ElementNode, LexicalEditor, LexicalNode } from 'lexical';
/**
 * Creates a selection range for the DOM.
 * @param editor - The lexical editor.
 * @param anchorNode - The anchor node of a selection.
 * @param _anchorOffset - The amount of space offset from the anchor to the focus.
 * @param focusNode - The current focus.
 * @param _focusOffset - The amount of space offset from the focus to the anchor.
 * @returns The range of selection for the DOM that was created.
 */
export declare function createDOMRange(editor: LexicalEditor, anchorNode: LexicalNode, _anchorOffset: number, focusNode: LexicalNode, _focusOffset: number): Range | null;
/**
 * Creates DOMRects, generally used to help the editor find a specific location on the screen.
 * @param editor - The lexical editor
 * @param range - A fragment of a document that can contain nodes and parts of text nodes.
 * @returns The selectionRects as an array.
 */
export declare function createRectsFromDOMRange(editor: LexicalEditor, range: Range): Array<ClientRect>;
/**
 * Creates an object containing all the styles and their values provided in the CSS string.
 * @param css - The CSS string of styles and their values.
 * @returns The styleObject containing all the styles and their values.
 */
export declare function getStyleObjectFromRawCSS(css: string): Record<string, string>;
/**
 * Given a CSS string, returns an object from the style cache.
 * @param css - The CSS property as a string.
 * @returns The value of the given CSS property.
 */
export declare function getStyleObjectFromCSS(css: string): Record<string, string>;
/**
 * Gets the CSS styles from the style object.
 * @param styles - The style object containing the styles to get.
 * @returns A string containing the CSS styles and their values.
 */
export declare function getCSSFromStyleObject(styles: Record<string, string>): string;
/**
 * Gets the computed DOM styles of the element.
 * @param element - The node to check the styles for.
 * @returns the computed styles of the element or null if there is no DOM element or no default view for the document.
 */
export declare function $getComputedStyleForElement(element: ElementNode): CSSStyleDeclaration | null;
/**
 * Gets the computed DOM styles of the parent of the node.
 * @param node - The node to check its parent's styles for.
 * @returns the computed styles of the node or null if there is no DOM element or no default view for the document.
 */
export declare function $getComputedStyleForParent(node: LexicalNode): CSSStyleDeclaration | null;
/**
 * Determines whether a node's parent is RTL.
 * @param node - The node to check whether it is RTL.
 * @returns whether the node is RTL.
 */
export declare function $isParentRTL(node: LexicalNode): boolean;
