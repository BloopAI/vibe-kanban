/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */
import type {
  ElementNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  BaseSelection,
  NodeSelection,
  Point,
  RangeSelection,
  TextNode,
} from 'lexical';
declare export function $cloneWithProperties<T: LexicalNode>(node: T): T;
declare export function getStyleObjectFromCSS(css: string): {
  [string]: string,
};
declare export function getCSSFromStyleObject(styles: Record<string, string>): string;
declare export function $patchStyleText(
  selection: BaseSelection,
  patch: {
    [string]: string | null,
  },
): void;
declare export function $getSelectionStyleValueForProperty(
  selection: RangeSelection,
  styleProperty: string,
  defaultValue: string,
): string;
declare export function $moveCaretSelection(
  selection: RangeSelection,
  isHoldingShift: boolean,
  isBackward: boolean,
  granularity: 'character' | 'word' | 'lineboundary',
): void;
declare export function $isParentElementRTL(selection: RangeSelection): boolean;
declare export function $moveCharacter(
  selection: RangeSelection,
  isHoldingShift: boolean,
  isBackward: boolean,
): void;
declare export function $selectAll(selection: RangeSelection): void;
declare export function $wrapNodes(
  selection: BaseSelection,
  createElement: () => ElementNode,
  wrappingElement?: ElementNode,
): void;
declare export function $setBlocksType(
  selection: BaseSelection | null,
  createElement: () => ElementNode,
): void;
declare export function $isAtNodeEnd(point: Point): boolean;
declare export function $shouldOverrideDefaultCharacterSelection(
  selection: RangeSelection,
  isBackward: boolean,
): boolean;

declare export function createDOMRange(
  editor: LexicalEditor,
  anchorNode: LexicalNode,
  anchorOffset: number,
  focusNode: LexicalNode,
  focusOffset: number,
): Range | null;

declare export function createRectsFromDOMRange(
  editor: LexicalEditor,
  range: Range,
): Array<ClientRect>;

declare export function $trimTextContentFromAnchor(
  editor: LexicalEditor,
  anchor: Point,
  delCount: number,
): void;

/** @deprecated renamed to {@link $trimTextContentFromAnchor} by @lexical/eslint-plugin rules-of-lexical */
declare export const trimTextContentFromAnchor: typeof $trimTextContentFromAnchor;

declare export function $ensureForwardRangeSelection(selection: RangeSelection): void;

declare export function $forEachSelectedTextNode(
  fn: (textNode: TextNode) => void,
): void;

declare export function $sliceSelectedTextNodeContent(
  selection: BaseSelection,
  textNode: TextNode,
): LexicalNode;

declare export function $copyBlockFormatIndent(
  srcNode: ElementNode,
  destNode: ElementNode,
): void;