import type { ElementProps, FloatingContext, FloatingTreeType, ReferenceType } from '../types';
export declare function getDelay(value: Props['delay'], prop: 'open' | 'close', pointerType?: PointerEvent['pointerType']): number;
export interface Props<RT extends ReferenceType = ReferenceType> {
    enabled?: boolean;
    handleClose?: null | ((context: FloatingContext<RT> & {
        onClose: () => void;
        tree?: FloatingTreeType<RT> | null;
    }) => (event: PointerEvent) => void);
    restMs?: number;
    delay?: number | Partial<{
        open: number;
        close: number;
    }>;
    mouseOnly?: boolean;
}
/**
 * Adds hover event listeners that change the open state, like CSS :hover.
 * @see https://floating-ui.com/docs/useHover
 */
export declare const useHover: <RT extends import("@floating-ui/dom/src/types").ReferenceElement = import("@floating-ui/dom/src/types").ReferenceElement>(context: FloatingContext<RT>, { enabled, delay, handleClose, mouseOnly, restMs, }?: Props<RT>) => ElementProps;
