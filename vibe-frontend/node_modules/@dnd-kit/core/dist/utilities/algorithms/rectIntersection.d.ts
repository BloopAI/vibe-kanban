import type { ClientRect } from '../../types';
import type { CollisionDetection } from './types';
/**
 * Returns the intersecting rectangle area between two rectangles
 */
export declare function getIntersectionRatio(entry: ClientRect, target: ClientRect): number;
/**
 * Returns the rectangles that has the greatest intersection area with a given
 * rectangle in an array of rectangles.
 */
export declare const rectIntersection: CollisionDetection;
