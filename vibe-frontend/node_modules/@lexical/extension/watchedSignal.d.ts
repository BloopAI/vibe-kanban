/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { type Signal } from './signals';
/**
 * @experimental
 * Create a Signal that will subscribe to a value from an external store when watched, similar to
 * React's [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore).
 *
 * @param getSnapshot Used to get the initial value of the signal when created and when first watched.
 * @param register A callback that will subscribe to some external store and update the signal, must return a dispose function.
 * @returns The signal
 */
export declare function watchedSignal<T>(getSnapshot: () => T, register: (self: Signal<T>) => () => void): Signal<T>;
