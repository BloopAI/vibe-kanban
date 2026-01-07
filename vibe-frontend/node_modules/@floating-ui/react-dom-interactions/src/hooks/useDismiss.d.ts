import type { ElementProps, FloatingContext } from '../types';
export interface Props {
    enabled?: boolean;
    escapeKey?: boolean;
    referencePointerDown?: boolean;
    outsidePointerDown?: boolean;
    ancestorScroll?: boolean;
    bubbles?: boolean;
}
/**
 * Adds listeners that dismiss (close) the floating element.
 * @see https://floating-ui.com/docs/useDismiss
 */
export declare const useDismiss: <RT extends import("@floating-ui/react-dom").ReferenceElement = import("@floating-ui/react-dom").ReferenceElement>({ open, onOpenChange, refs, events, nodeId }: FloatingContext<RT>, { enabled, escapeKey, outsidePointerDown, referencePointerDown, ancestorScroll, bubbles, }?: Props) => ElementProps;
