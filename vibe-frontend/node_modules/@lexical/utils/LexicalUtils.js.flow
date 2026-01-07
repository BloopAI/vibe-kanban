/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */
import type {
  EditorState,
  LexicalEditor,
  LexicalNode,
  ElementNode,
  NodeCaret,
  CaretDirection,
  SiblingCaret,
  RootMode,
  SplitAtPointCaretNextOptions,
  PointCaret,
  StateConfig,
  ValueOrUpdater
} from 'lexical';
declare export function addClassNamesToElement(
  element: HTMLElement,
  ...classNames: Array<typeof undefined | boolean | null | string>
): void;
declare export function removeClassNamesFromElement(
  element: HTMLElement,
  ...classNames: Array<typeof undefined | boolean | null | string>
): void;
declare export function isMimeType(
  file: File,
  acceptableMimeTypes: Array<string>,
): boolean;
declare export function mediaFileReader(
  files: Array<File>,
  acceptableMimeTypes: Array<string>,
): Promise<Array<$ReadOnly<{file: File, result: string}>>>;
export type DFSNode = $ReadOnly<{
  depth: number,
  node: LexicalNode,
}>;
declare export function $dfs(
  startNode?: LexicalNode,
  endNode?: LexicalNode,
): Array<DFSNode>;
type DFSIterator = {
  next: () => IteratorResult<DFSNode, void>;
  @@iterator: () => DFSIterator;
};
declare export function $dfsIterator(
  startNode?: LexicalNode,
  endNode?: LexicalNode,
): DFSIterator;
declare export function $getNextSiblingOrParentSibling(
  node: LexicalNode,
): null | [LexicalNode, number];
declare export function $getDepth(node: null | LexicalNode): number;
declare export function $getNextRightPreorderNode(
  startingNode: LexicalNode,
): LexicalNode | null;
declare export function $getNearestNodeOfType<T: LexicalNode>(
  node: LexicalNode,
  klass: Class<T>,
): T | null;
export type DOMNodeToLexicalConversion = (element: Node) => LexicalNode;
export type DOMNodeToLexicalConversionMap = {
  [string]: DOMNodeToLexicalConversion,
};
declare export function $findMatchingParent(
  startingNode: LexicalNode,
  findFn: (LexicalNode) => boolean,
): LexicalNode | null;
type Func = () => void;
declare export function mergeRegister(...func: Array<Func>): () => void;
declare export function markSelection(
  editor: LexicalEditor,
  onReposition?: (node: Array<HTMLElement>) => void,
): () => void;
declare export function positionNodeOnRange(
  editor: LexicalEditor,
  range: Range,
  onReposition: (node: Array<HTMLElement>) => void,
): () => void;
declare export function selectionAlwaysOnDisplay(
  editor: LexicalEditor,
): () => void;
declare export function $getNearestBlockElementAncestorOrThrow(
  startNode: LexicalNode,
): ElementNode;

declare export function registerNestedElementResolver<N: ElementNode>(
  editor: LexicalEditor,
  targetNode: Class<N>,
  cloneNode: (from: N) => N,
  handleOverlap: (from: N, to: N) => void,
): () => void;

declare export function unstable_convertLegacyJSONEditorState(
  editor: LexicalEditor,
  maybeStringifiedEditorState: string,
): EditorState;

declare export function $restoreEditorState(
  editor: LexicalEditor,
  editorState: EditorState,
): void;


declare export function $insertNodeToNearestRoot<T: LexicalNode>(node: T): T;
declare export function $insertNodeToNearestRootAtCaret<T: LexicalNode>(node: T, caret: PointCaret<CaretDirection>, options?: SplitAtPointCaretNextOptions): T;

declare export function $wrapNodeInElement(
  node: LexicalNode,
  createElementNode: () => ElementNode,
): ElementNode;

declare export function objectKlassEquals<T>(
  object: mixed,
  objectClass: Class<T>,
): boolean;

declare export function $filter<T>(
  nodes: Array<LexicalNode>,
  filterFn: (node: LexicalNode) => null | T,
): Array<T>;

declare export function $insertFirst(parent: ElementNode, node: LexicalNode): void;

declare export function $splitNode(
  node: ElementNode,
  offset: number,
): [ElementNode | null, ElementNode];

declare export function calculateZoomLevel(element: Element | null): number;

declare export function $isEditorIsNestedEditor(editor: LexicalEditor): boolean;

declare export function $unwrapAndFilterDescendants(
  root: ElementNode,
  $predicate: (node: LexicalNode) => boolean,
): boolean;

declare export function $firstToLastIterator(node: ElementNode): Iterable<LexicalNode>;

declare export function $lastToFirstIterator(node: ElementNode): Iterable<LexicalNode>;

declare export function $unwrapNode(node: ElementNode): void;

declare export function $getAdjacentCaret<D: CaretDirection>(
  caret: null | NodeCaret<D>,
): null | SiblingCaret<LexicalNode, D>;

declare export function $reverseDfs(
  startNode?: LexicalNode,
  endNode?: LexicalNode,
): Array<DFSNode>;

declare export function $reverseDfsIterator(
  startNode?: LexicalNode,
  endNode?: LexicalNode,
): Iterable<DFSNode>;

declare export function $descendantsMatching<T: LexicalNode>(
  children: LexicalNode[],
  $predicate: (node: LexicalNode) => node is T,
): T[];
declare export function $descendantsMatching(
  children: LexicalNode[],
  $predicate: (node: LexicalNode) => boolean,
): LexicalNode[];

declare export function $getAdjacentSiblingOrParentSiblingCaret<
  D: CaretDirection,
>(
  startCaret: NodeCaret<D>,
  rootMode?: RootMode,
): null | [NodeCaret<D>, number];

export type StateConfigWrapper<K: string, V> = {
  +stateConfig: StateConfig<K, V>;
  +$get: <T: LexicalNode>(node: T) => V;
  +$set: <T: LexicalNode>(
    node: T,
    valueOrUpdater: ValueOrUpdater<V>,
  ) => T;
  /** `[$get, $set]` */
  +accessors: $ReadOnly<[$get: StateConfigWrapper<K, V>['$get'], $set: StateConfigWrapper<K, V>['$set']]>;
  /**
   * `() => function () { return $get(this) }`
   *
   * Should be called with an explicit `this` type parameter.
   *
   * @example
   * ```ts
   * class MyNode {
   *   // …
   *   myGetter = myWrapper.makeGetterMethod<this>();
   * }
   * ```
   */
  makeGetterMethod<T: LexicalNode>(): (this: T) => V;
  /**
   * `() => function (valueOrUpdater) { return $set(this, valueOrUpdater) }`
   *
   * Must be called with an explicit `this` type parameter.
   *
   * @example
   * ```ts
   * class MyNode {
   *   // …
   *   mySetter = myWrapper.makeSetterMethod<this>();
   * }
   * ```
   */
  makeSetterMethod<T: LexicalNode>(): (
    this: T,
    valueOrUpdater: ValueOrUpdater<V>,
  ) => T;
};

declare export function makeStateWrapper<K: string, V>(
  stateConfig: StateConfig<K, V>,
): StateConfigWrapper<K, V>;
