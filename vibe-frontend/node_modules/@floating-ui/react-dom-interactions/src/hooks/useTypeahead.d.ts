import React from 'react';
import type { ElementProps, FloatingContext } from '../types';
export interface Props {
    listRef: React.MutableRefObject<Array<string | null>>;
    activeIndex: number | null;
    onMatch?: (index: number) => void;
    enabled?: boolean;
    findMatch?: null | ((list: Array<string | null>, typedString: string) => string | null | undefined);
    resetMs?: number;
    ignoreKeys?: Array<string>;
    selectedIndex?: number | null;
}
/**
 * Provides a matching callback that can be used to focus an item as the user
 * types, often used in tandem with `useListNavigation()`.
 * @see https://floating-ui.com/docs/useTypeahead
 */
export declare const useTypeahead: <RT extends import("@floating-ui/dom/src/types").ReferenceElement = import("@floating-ui/dom/src/types").ReferenceElement>({ open, dataRef }: FloatingContext<RT>, { listRef, activeIndex, onMatch, enabled, findMatch, resetMs, ignoreKeys, selectedIndex, }?: Props) => ElementProps;
