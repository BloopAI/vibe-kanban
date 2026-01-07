import type { Middleware, Padding } from '../types';
export interface Options {
    /**
     * The arrow element to be positioned.
     * @default undefined
     */
    element: any;
    /**
     * The padding between the arrow element and the floating element edges.
     * Useful when the floating element has rounded corners.
     * @default 0
     */
    padding?: Padding;
}
/**
 * Positions an inner element of the floating element such that it is centered
 * to the reference element.
 * @see https://floating-ui.com/docs/arrow
 */
export declare const arrow: (options: Options) => Middleware;
