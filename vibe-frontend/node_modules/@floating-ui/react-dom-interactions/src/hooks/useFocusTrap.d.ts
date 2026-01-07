import { MutableRefObject } from 'react';
import type { ElementProps, FloatingContext } from '../types';
declare type Order = Array<'reference' | 'floating' | 'content'>;
export interface Props {
    enabled?: boolean;
    modal?: boolean;
    order?: Order;
    initialContentFocus?: number | MutableRefObject<HTMLElement | null>;
    inert?: boolean;
}
/**
 * @deprecated Use `<FloatingFocusManager />` instead.
 */
export declare const useFocusTrap: <RT extends import("@floating-ui/dom/src/types").ReferenceElement = import("@floating-ui/dom/src/types").ReferenceElement>({ open, onOpenChange, refs, nodeId }: FloatingContext<RT>, { enabled, initialContentFocus, order, modal, inert, }?: Props) => ElementProps;
export {};
