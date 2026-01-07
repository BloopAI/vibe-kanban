import type { Coordinates } from './types';
/**
 * Returns the normalized x and y coordinates for mouse and touch events.
 */
export declare function getEventCoordinates(event: Event): Coordinates | null;
