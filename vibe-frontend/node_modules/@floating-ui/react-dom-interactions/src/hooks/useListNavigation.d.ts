import React from 'react';
import type { ElementProps, FloatingContext } from '../types';
export interface Props {
    listRef: React.MutableRefObject<Array<HTMLElement | null>>;
    activeIndex: number | null;
    onNavigate: (index: number | null) => void;
    enabled?: boolean;
    selectedIndex?: number | null;
    focusItemOnOpen?: boolean | 'auto';
    focusItemOnHover?: boolean;
    allowEscape?: boolean;
    loop?: boolean;
    nested?: boolean;
    rtl?: boolean;
    virtual?: boolean;
    orientation?: 'vertical' | 'horizontal' | 'both';
}
/**
 * Adds focus-managed indexed navigation via arrow keys to a list of items
 * within the floating element.
 * @see https://floating-ui.com/docs/useListNavigation
 */
export declare const useListNavigation: <RT extends import("@floating-ui/dom/src/types").ReferenceElement = import("@floating-ui/dom/src/types").ReferenceElement>({ open, onOpenChange, refs }: FloatingContext<RT>, { listRef, activeIndex, onNavigate, enabled, selectedIndex, allowEscape, loop, nested, rtl, virtual, focusItemOnOpen, focusItemOnHover, orientation, }?: Props) => ElementProps;
