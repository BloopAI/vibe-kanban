import type { ClientRect } from '../../types';
import type { Collision, CollisionDescriptor } from './types';
/**
 * Sort collisions from smallest to greatest value
 */
export declare function sortCollisionsAsc({ data: { value: a } }: CollisionDescriptor, { data: { value: b } }: CollisionDescriptor): number;
/**
 * Sort collisions from greatest to smallest value
 */
export declare function sortCollisionsDesc({ data: { value: a } }: CollisionDescriptor, { data: { value: b } }: CollisionDescriptor): number;
/**
 * Returns the coordinates of the corners of a given rectangle:
 * [TopLeft {x, y}, TopRight {x, y}, BottomLeft {x, y}, BottomRight {x, y}]
 */
export declare function cornersOfRectangle({ left, top, height, width }: ClientRect): {
    x: number;
    y: number;
}[];
/**
 * Returns the first collision, or null if there isn't one.
 * If a property is specified, returns the specified property of the first collision.
 */
export declare function getFirstCollision(collisions: Collision[] | null | undefined): Collision | null;
export declare function getFirstCollision<T extends keyof Collision>(collisions: Collision[] | null | undefined, property: T): Collision[T] | null;
