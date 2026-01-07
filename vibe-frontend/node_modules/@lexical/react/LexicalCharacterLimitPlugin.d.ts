/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { JSX } from 'react';
export declare function CharacterLimitPlugin({ charset, maxLength, renderer, }: {
    charset: 'UTF-8' | 'UTF-16';
    maxLength: number;
    renderer?: ({ remainingCharacters, }: {
        remainingCharacters: number;
    }) => JSX.Element;
}): JSX.Element;
