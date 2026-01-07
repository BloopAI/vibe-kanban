import type { DroppableContainer, RectMap } from '../../store/types';
import type { ClientRect, UniqueIdentifier } from '../../types';
interface Arguments {
    dragging: boolean;
    dependencies: any[];
    config: DroppableMeasuring;
}
export declare enum MeasuringStrategy {
    Always = 0,
    BeforeDragging = 1,
    WhileDragging = 2
}
export declare enum MeasuringFrequency {
    Optimized = "optimized"
}
declare type MeasuringFunction = (element: HTMLElement) => ClientRect;
export interface DroppableMeasuring {
    measure: MeasuringFunction;
    strategy: MeasuringStrategy;
    frequency: MeasuringFrequency | number;
}
export declare function useDroppableMeasuring(containers: DroppableContainer[], { dragging, dependencies, config }: Arguments): {
    droppableRects: RectMap;
    measureDroppableContainers: (ids?: UniqueIdentifier[]) => void;
    measuringScheduled: boolean;
};
export {};
