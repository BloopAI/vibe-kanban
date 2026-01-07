import type { Coordinates } from '@dnd-kit/utilities';
export type { Coordinates };
export declare type DistanceMeasurement = number | Coordinates | Pick<Coordinates, 'x'> | Pick<Coordinates, 'y'>;
export declare type Translate = Coordinates;
export interface ScrollCoordinates {
    initial: Coordinates;
    current: Coordinates;
    delta: Coordinates;
}
