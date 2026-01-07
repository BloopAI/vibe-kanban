/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { JSX } from 'react';
import { ReactNode } from 'react';
export declare function DraggableBlockPlugin_EXPERIMENTAL({ anchorElem, menuRef, targetLineRef, menuComponent, targetLineComponent, isOnMenu, onElementChanged, }: {
    anchorElem?: HTMLElement;
    menuRef: React.RefObject<HTMLElement | null>;
    targetLineRef: React.RefObject<HTMLElement | null>;
    menuComponent: ReactNode;
    targetLineComponent: ReactNode;
    isOnMenu: (element: HTMLElement) => boolean;
    onElementChanged?: (element: HTMLElement | null) => void;
}): JSX.Element;
