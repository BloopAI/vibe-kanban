import type { Placement, Rect, Coords, Middleware, ElementRects } from '../types';
declare type OffsetValue = number | {
    /**
     * The axis that runs along the side of the floating element.
     * @default 0
     */
    mainAxis?: number;
    /**
     * The axis that runs along the alignment of the floating element.
     * @default 0
     */
    crossAxis?: number;
    /**
     * When set to a number, overrides the `crossAxis` value for aligned
     * (non-centered/base) placements and works logically. A positive number
     * will move the floating element in the direction of the opposite edge
     * to the one that is aligned, while a negative number the reverse.
     * @default null
     */
    alignmentAxis?: number | null;
};
declare type OffsetFunction = (args: {
    floating: Rect;
    reference: Rect;
    placement: Placement;
}) => OffsetValue;
export declare type Options = OffsetValue | OffsetFunction;
export declare function convertValueToCoords(placement: Placement, rects: ElementRects, value: Options, rtl?: boolean): Coords;
/**
 * Displaces the floating element from its reference element.
 * @see https://floating-ui.com/docs/offset
 */
export declare const offset: (value?: Options) => Middleware;
export {};
