/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { JSX } from 'react';
type Props = Readonly<{
    onClear?: () => void;
}>;
export declare function ClearEditorPlugin({ onClear }: Props): JSX.Element | null;
export {};
