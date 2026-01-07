import type { ClientRect } from '../../../types';
import type { DraggableNode } from '../../../store';
import type { MeasuringFunction } from '../types';
interface Options {
    activeNode: DraggableNode | null | undefined;
    config: boolean | {
        x: boolean;
        y: boolean;
    } | undefined;
    initialRect: ClientRect | null;
    measure: MeasuringFunction;
}
export declare function useLayoutShiftScrollCompensation({ activeNode, measure, initialRect, config, }: Options): void;
export {};
