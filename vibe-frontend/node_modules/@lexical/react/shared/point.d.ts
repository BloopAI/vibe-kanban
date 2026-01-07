/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
export declare class Point {
    private readonly _x;
    private readonly _y;
    constructor(x: number, y: number);
    get x(): number;
    get y(): number;
    equals({ x, y }: Point): boolean;
    calcDeltaXTo({ x }: Point): number;
    calcDeltaYTo({ y }: Point): number;
    calcHorizontalDistanceTo(point: Point): number;
    calcVerticalDistance(point: Point): number;
    calcDistanceTo(point: Point): number;
}
export declare function isPoint(x: unknown): x is Point;
