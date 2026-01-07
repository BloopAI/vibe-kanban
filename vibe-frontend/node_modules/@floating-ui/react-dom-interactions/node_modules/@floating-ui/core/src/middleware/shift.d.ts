import type { Middleware, Rect, Placement, MiddlewareArguments, Coords } from '../types';
import { Options as DetectOverflowOptions } from '../detectOverflow';
export interface Options {
    /**
     * The axis that runs along the alignment of the floating element.
     * @default true
     */
    mainAxis: boolean;
    /**
     * The axis that runs along the side of the floating element.
     * @default false
     */
    crossAxis: boolean;
    /**
     * Accepts a function that limits the shifting done in order to prevent
     * detachment.
     */
    limiter: {
        fn: (middlewareArguments: MiddlewareArguments) => Coords;
        options?: any;
    };
}
/**
 * Shifts the floating element in order to keep it in view when it will overflow
 * a clipping boundary.
 * @see https://floating-ui.com/docs/shift
 */
export declare const shift: (options?: Partial<Options & DetectOverflowOptions>) => Middleware;
declare type LimitShiftOffset = ((args: {
    placement: Placement;
    floating: Rect;
    reference: Rect;
}) => number | {
    /**
     * Offset the limiting of the axis that runs along the alignment of the
     * floating element.
     */
    mainAxis?: number;
    /**
     * Offset the limiting of the axis that runs along the side of the
     * floating element.
     */
    crossAxis?: number;
}) | number | {
    /**
     * Offset the limiting of the axis that runs along the alignment of the
     * floating element.
     */
    mainAxis?: number;
    /**
     * Offset the limiting of the axis that runs along the side of the
     * floating element.
     */
    crossAxis?: number;
};
export declare type LimitShiftOptions = {
    /**
     * Offset when limiting starts. `0` will limit when the opposite edges of the
     * reference and floating elements are aligned.
     * - positive = start limiting earlier
     * - negative = start limiting later
     */
    offset: LimitShiftOffset;
    /**
     * Whether to limit the axis that runs along the alignment of the floating
     * element.
     */
    mainAxis: boolean;
    /**
     * Whether to limit the axis that runs along the side of the floating element.
     */
    crossAxis: boolean;
};
/**
 * Built-in `limiter` that will stop `shift()` at a certain point.
 */
export declare const limitShift: (options?: Partial<LimitShiftOptions>) => {
    options: Partial<LimitShiftOffset>;
    fn: (middlewareArguments: MiddlewareArguments) => Coords;
};
export {};
