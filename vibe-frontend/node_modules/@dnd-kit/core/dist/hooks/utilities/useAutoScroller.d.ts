import type { Coordinates, ClientRect } from '../../types';
export declare type ScrollAncestorSortingFn = (ancestors: Element[]) => Element[];
export declare enum AutoScrollActivator {
    Pointer = 0,
    DraggableRect = 1
}
export interface Options {
    acceleration?: number;
    activator?: AutoScrollActivator;
    canScroll?: CanScroll;
    enabled?: boolean;
    interval?: number;
    layoutShiftCompensation?: boolean | {
        x: boolean;
        y: boolean;
    };
    order?: TraversalOrder;
    threshold?: {
        x: number;
        y: number;
    };
}
interface Arguments extends Options {
    draggingRect: ClientRect | null;
    enabled: boolean;
    pointerCoordinates: Coordinates | null;
    scrollableAncestors: Element[];
    scrollableAncestorRects: ClientRect[];
    delta: Coordinates;
}
export declare type CanScroll = (element: Element) => boolean;
export declare enum TraversalOrder {
    TreeOrder = 0,
    ReversedTreeOrder = 1
}
export declare function useAutoScroller({ acceleration, activator, canScroll, draggingRect, enabled, interval, order, pointerCoordinates, scrollableAncestors, scrollableAncestorRects, delta, threshold, }: Arguments): void;
export {};
