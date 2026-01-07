import { Boundary, RootBoundary, Rect, Strategy } from '@floating-ui/core';
export declare function getClippingRect({ element, boundary, rootBoundary, strategy, }: {
    element: Element;
    boundary: Boundary;
    rootBoundary: RootBoundary;
    strategy: Strategy;
}): Rect;
