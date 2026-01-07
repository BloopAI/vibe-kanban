/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
/**
 * Explicitly and safely cast a value to a specific type when inference or
 * satisfies isn't going to work as expected (often useful for the config
 * property with {@link defineExtension})
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function safeCast<T>(value: T): T;
