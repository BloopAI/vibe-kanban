/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { HistoryState } from '@lexical/history';
export { createEmptyHistoryState } from '@lexical/history';
export type { HistoryState };
export declare function HistoryPlugin({ delay, externalHistoryState, }: {
    delay?: number;
    externalHistoryState?: HistoryState;
}): null;
