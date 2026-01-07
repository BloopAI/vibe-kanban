import type { SideObject, Padding, Boundary, RootBoundary, ElementContext, MiddlewareArguments } from './types';
export interface Options {
    /**
     * The clipping element(s) in which overflow will be checked.
     * @default 'clippingAncestors'
     */
    boundary: Boundary;
    /**
     * The root clipping element in which overflow will be checked.
     * @default 'viewport'
     */
    rootBoundary: RootBoundary;
    /**
     * The element in which overflow is being checked relative to a boundary.
     * @default 'floating'
     */
    elementContext: ElementContext;
    /**
     * Whether to check for overflow using the alternate element's boundary
     * (`clippingAncestors` boundary only).
     * @default false
     */
    altBoundary: boolean;
    /**
     * Virtual padding for the resolved overflow offsets.
     * @default 0
     */
    padding: Padding;
}
/**
 * Resolves with an object of overflow side offsets that determine how much the
 * element is overflowing a given clipping boundary.
 * - positive = overflowing the boundary by that number of pixels
 * - negative = how many pixels left before it will overflow
 * - 0 = lies flush with the boundary
 * @see https://floating-ui.com/docs/detectOverflow
 */
export declare function detectOverflow(middlewareArguments: MiddlewareArguments, options?: Partial<Options>): Promise<SideObject>;
