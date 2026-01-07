import type { ElementProps, FloatingContext } from '../types';
export interface Props {
    enabled?: boolean;
    keyboardOnly?: boolean;
}
/**
 * Adds focus event listeners that change the open state, like CSS :focus.
 * @see https://floating-ui.com/docs/useFocus
 */
export declare const useFocus: <RT extends import("@floating-ui/dom/src/types").ReferenceElement = import("@floating-ui/dom/src/types").ReferenceElement>({ open, onOpenChange, dataRef, refs, events }: FloatingContext<RT>, { enabled, keyboardOnly }?: Props) => ElementProps;
