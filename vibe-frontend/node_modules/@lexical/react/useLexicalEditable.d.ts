/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
/**
 * Get the current value for {@link LexicalEditor.isEditable}
 * using {@link useLexicalSubscription}.
 * You should prefer this over manually observing the value with
 * {@link LexicalEditor.registerEditableListener},
 * which is a bit tricky to do correctly, particularly when using
 * React StrictMode (the default for development) or concurrency.
 */
export declare function useLexicalEditable(): boolean;
