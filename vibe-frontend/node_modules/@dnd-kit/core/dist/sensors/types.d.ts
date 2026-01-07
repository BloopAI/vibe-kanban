import type { MutableRefObject } from 'react';
import type { Active, Over, DraggableNode, DraggableNodes, DroppableContainers, RectMap } from '../store';
import type { Coordinates, SyntheticEventName, Translate, UniqueIdentifier, ClientRect } from '../types';
import type { Collision } from '../utilities/algorithms';
import type { PointerActivationConstraint } from './pointer';
export declare enum Response {
    Start = "start",
    Move = "move",
    End = "end"
}
export declare type SensorContext = {
    activatorEvent: Event | null;
    active: Active | null;
    activeNode: HTMLElement | null;
    collisionRect: ClientRect | null;
    collisions: Collision[] | null;
    draggableNodes: DraggableNodes;
    draggingNode: HTMLElement | null;
    draggingNodeRect: ClientRect | null;
    droppableRects: RectMap;
    droppableContainers: DroppableContainers;
    over: Over | null;
    scrollableAncestors: Element[];
    scrollAdjustedTranslate: Translate | null;
};
export declare type SensorOptions = {};
export interface SensorProps<T> {
    active: UniqueIdentifier;
    activeNode: DraggableNode;
    event: Event;
    context: MutableRefObject<SensorContext>;
    options: T;
    onAbort(id: UniqueIdentifier): void;
    onPending(id: UniqueIdentifier, constraint: PointerActivationConstraint, initialCoordinates: Coordinates, offset?: Coordinates | undefined): void;
    onStart(coordinates: Coordinates): void;
    onCancel(): void;
    onMove(coordinates: Coordinates): void;
    onEnd(): void;
}
export declare type SensorInstance = {
    autoScrollEnabled: boolean;
};
export declare type SensorActivatorFunction<T> = (event: any, options: T, context: {
    active: DraggableNode;
}) => boolean | undefined;
export declare type Activator<T> = {
    eventName: SyntheticEventName;
    handler: SensorActivatorFunction<T>;
};
export declare type Activators<T> = Activator<T>[];
declare type Teardown = () => void;
export interface Sensor<T extends Object> {
    new (props: SensorProps<T>): SensorInstance;
    activators: Activators<T>;
    setup?(): Teardown | undefined;
}
export declare type Sensors = Sensor<any>[];
export declare type SensorDescriptor<T extends Object> = {
    sensor: Sensor<T>;
    options: T;
};
export declare type SensorHandler = (event: React.SyntheticEvent, active: UniqueIdentifier) => boolean | void;
export {};
