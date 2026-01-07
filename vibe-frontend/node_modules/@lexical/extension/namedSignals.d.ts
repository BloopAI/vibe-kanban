/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { type Signal } from './signals';
export type NamedSignalsOptions<Defaults> = {
    [K in keyof Defaults]?: Defaults[K];
};
export type NamedSignalsOutput<Defaults> = {
    [K in keyof Defaults]: Signal<Defaults[K]>;
};
/**
 * @experimental
 * Return an object with the same shape as `defaults` with a {@link Signal}
 * for each value. If specified, the second `opts` argument is a partial
 * of overrides to the defaults and will be used as the initial value.
 *
 * Typically used to make a reactive version of some subset of the
 * configuration of an extension, so it can be reconfigured at runtime.
 *
 * @param defaults The object with default values
 * @param opts Overrides to those default values
 * @returns An object with signals initialized with the default values
 */
export declare function namedSignals<Defaults>(defaults: Defaults, opts?: NamedSignalsOptions<Defaults>): NamedSignalsOutput<Defaults>;
