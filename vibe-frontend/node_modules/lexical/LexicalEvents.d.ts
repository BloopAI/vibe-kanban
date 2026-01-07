/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor } from './LexicalEditor';
import type { NodeKey } from './LexicalNode';
export type EventHandler = (event: Event, editor: LexicalEditor) => void;
export declare function addRootElementEvents(rootElement: HTMLElement, editor: LexicalEditor): void;
export declare function removeRootElementEvents(rootElement: HTMLElement): void;
export declare function markSelectionChangeFromDOMUpdate(): void;
export declare function markCollapsedSelectionFormat(format: number, style: string, offset: number, key: NodeKey, timeStamp: number): void;
