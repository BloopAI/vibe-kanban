/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { BaseSelection, ElementNode, LexicalNode, RangeSelection } from 'lexical';
import { TableSelection } from '@lexical/table';
export declare function $copyBlockFormatIndent(srcNode: ElementNode, destNode: ElementNode): void;
/**
 * Converts all nodes in the selection that are of one block type to another.
 * @param selection - The selected blocks to be converted.
 * @param $createElement - The function that creates the node. eg. $createParagraphNode.
 * @param $afterCreateElement - The function that updates the new node based on the previous one ($copyBlockFormatIndent by default)
 */
export declare function $setBlocksType<T extends ElementNode>(selection: BaseSelection | null, $createElement: () => T, $afterCreateElement?: (prevNodeSrc: ElementNode, newNodeDest: T) => void): void;
/**
 * @deprecated In favor of $setBlockTypes
 * Wraps all nodes in the selection into another node of the type returned by createElement.
 * @param selection - The selection of nodes to be wrapped.
 * @param createElement - A function that creates the wrapping ElementNode. eg. $createParagraphNode.
 * @param wrappingElement - An element to append the wrapped selection and its children to.
 */
export declare function $wrapNodes(selection: BaseSelection, createElement: () => ElementNode, wrappingElement?: null | ElementNode): void;
/**
 * Wraps each node into a new ElementNode.
 * @param selection - The selection of nodes to wrap.
 * @param nodes - An array of nodes, generally the descendants of the selection.
 * @param nodesLength - The length of nodes.
 * @param createElement - A function that creates the wrapping ElementNode. eg. $createParagraphNode.
 * @param wrappingElement - An element to wrap all the nodes into.
 * @returns
 */
export declare function $wrapNodesImpl(selection: BaseSelection, nodes: LexicalNode[], nodesLength: number, createElement: () => ElementNode, wrappingElement?: null | ElementNode): void;
/**
 * Determines if the default character selection should be overridden. Used with DecoratorNodes
 * @param selection - The selection whose default character selection may need to be overridden.
 * @param isBackward - Is the selection backwards (the focus comes before the anchor)?
 * @returns true if it should be overridden, false if not.
 */
export declare function $shouldOverrideDefaultCharacterSelection(selection: RangeSelection, isBackward: boolean): boolean;
/**
 * Moves the selection according to the arguments.
 * @param selection - The selected text or nodes.
 * @param isHoldingShift - Is the shift key being held down during the operation.
 * @param isBackward - Is the selection selected backwards (the focus comes before the anchor)?
 * @param granularity - The distance to adjust the current selection.
 */
export declare function $moveCaretSelection(selection: RangeSelection, isHoldingShift: boolean, isBackward: boolean, granularity: 'character' | 'word' | 'lineboundary'): void;
/**
 * Tests a parent element for right to left direction.
 * @param selection - The selection whose parent is to be tested.
 * @returns true if the selections' parent element has a direction of 'rtl' (right to left), false otherwise.
 */
export declare function $isParentElementRTL(selection: RangeSelection): boolean;
/**
 * Moves selection by character according to arguments.
 * @param selection - The selection of the characters to move.
 * @param isHoldingShift - Is the shift key being held down during the operation.
 * @param isBackward - Is the selection backward (the focus comes before the anchor)?
 */
export declare function $moveCharacter(selection: RangeSelection, isHoldingShift: boolean, isBackward: boolean): void;
/**
 * Returns the current value of a CSS property for TextNodes in the Selection, if set. If not set, it returns the defaultValue.
 * If all TextNodes do not have the same value, it returns an empty string.
 * @param selection - The selection of TextNodes whose value to find.
 * @param styleProperty - The CSS style property.
 * @param defaultValue - The default value for the property, defaults to an empty string.
 * @returns The value of the property for the selected TextNodes.
 */
export declare function $getSelectionStyleValueForProperty(selection: RangeSelection | TableSelection, styleProperty: string, defaultValue?: string): string;
