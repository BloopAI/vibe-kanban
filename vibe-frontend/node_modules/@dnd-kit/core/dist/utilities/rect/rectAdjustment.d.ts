import type { Coordinates, ClientRect } from '../../types';
export declare function createRectAdjustmentFn(modifier: number): (rect: ClientRect, ...adjustments: Coordinates[]) => ClientRect;
export declare const getAdjustedRect: (rect: ClientRect, ...adjustments: Coordinates[]) => ClientRect;
