import type { ElementProps, FloatingContext } from '../types';
export interface Props {
    enabled?: boolean;
    role?: 'tooltip' | 'dialog' | 'menu' | 'listbox' | 'grid' | 'tree';
}
/**
 * Adds relevant screen reader props for a given element `role`.
 * @see https://floating-ui.com/docs/useRole
 */
export declare const useRole: <RT extends import("@floating-ui/dom/src/types").ReferenceElement = import("@floating-ui/dom/src/types").ReferenceElement>({ open }: FloatingContext<RT>, { enabled, role }?: Partial<Props>) => ElementProps;
