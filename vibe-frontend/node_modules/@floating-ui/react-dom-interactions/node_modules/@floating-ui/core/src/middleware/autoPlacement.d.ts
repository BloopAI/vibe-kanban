import type { Middleware, Placement, Alignment } from '../types';
import { Options as DetectOverflowOptions } from '../detectOverflow';
export declare function getPlacementList(alignment: Alignment | null, autoAlignment: boolean, allowedPlacements: Array<Placement>): Placement[];
export interface Options {
    /**
     * Choose placements with a particular alignment.
     * @default null
     */
    alignment: Alignment | null;
    /**
     * Which placements are allowed to be chosen. Placements must be within the
     * `alignment` option set.
     * @default allPlacements (variable)
     */
    allowedPlacements: Array<Placement>;
    /**
     * Whether to choose placements with the opposite alignment if they will fit
     * better.
     * @default true
     */
    autoAlignment: boolean;
}
/**
 * Automatically chooses the `placement` which has the most space available.
 * @see https://floating-ui.com/docs/autoPlacement
 */
export declare const autoPlacement: (options?: Partial<Options & DetectOverflowOptions>) => Middleware;
