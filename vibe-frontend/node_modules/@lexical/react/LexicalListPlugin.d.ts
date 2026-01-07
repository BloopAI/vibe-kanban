/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
export interface ListPluginProps {
    /**
     * When `true`, enforces strict indentation rules for list items, ensuring consistent structure.
     * When `false` (default), indentation is more flexible.
     */
    hasStrictIndent?: boolean;
}
export declare function ListPlugin({ hasStrictIndent }: ListPluginProps): null;
