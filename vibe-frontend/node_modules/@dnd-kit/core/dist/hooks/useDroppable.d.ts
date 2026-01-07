/// <reference types="react" />
import { Data } from '../store';
import type { ClientRect, UniqueIdentifier } from '../types';
interface ResizeObserverConfig {
    /** Whether the ResizeObserver should be disabled entirely */
    disabled?: boolean;
    /** Resize events may affect the layout and position of other droppable containers.
     * Specify an array of `UniqueIdentifier` of droppable containers that should also be re-measured
     * when this droppable container resizes. Specifying an empty array re-measures all droppable containers.
     */
    updateMeasurementsFor?: UniqueIdentifier[];
    /** Represents the debounce timeout between when resize events are observed and when elements are re-measured */
    timeout?: number;
}
export interface UseDroppableArguments {
    id: UniqueIdentifier;
    disabled?: boolean;
    data?: Data;
    resizeObserverConfig?: ResizeObserverConfig;
}
export declare function useDroppable({ data, disabled, id, resizeObserverConfig, }: UseDroppableArguments): {
    active: import("../store").Active | null;
    rect: import("react").MutableRefObject<ClientRect | null>;
    isOver: boolean;
    node: import("react").MutableRefObject<HTMLElement | null>;
    over: import("../store").Over | null;
    setNodeRef: (element: HTMLElement | null) => void;
};
export {};
