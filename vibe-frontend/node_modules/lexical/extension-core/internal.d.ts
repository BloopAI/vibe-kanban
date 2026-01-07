/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
/** @internal */
export declare const peerDependencySymbol: unique symbol;
/** @internal */
export type peerDependencySymbol = typeof peerDependencySymbol;
/** @internal */
export declare const configTypeSymbol: unique symbol;
/** @internal */
export type configTypeSymbol = typeof configTypeSymbol;
/** @internal */
export declare const outputTypeSymbol: unique symbol;
/** @internal */
export type outputTypeSymbol = typeof outputTypeSymbol;
/** @internal */
export declare const initTypeSymbol: unique symbol;
/** @internal */
export type initTypeSymbol = typeof initTypeSymbol;
/** @internal */
export interface LexicalExtensionInternal<Config, Output, Init> {
    /** @internal */
    readonly [configTypeSymbol]?: Config;
    /** @internal */
    readonly [outputTypeSymbol]?: Output;
    /** @internal */
    readonly [initTypeSymbol]?: Init;
}
