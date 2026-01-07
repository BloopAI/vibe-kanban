import type { MutableRefObject } from 'react';
import type { DeepRequired } from '@dnd-kit/utilities';
import type { SyntheticListeners } from '../hooks/utilities';
import type { Collision } from '../utilities/algorithms';
import type { MeasuringConfiguration } from '../components';
import type { Coordinates, ClientRect, UniqueIdentifier } from '../types';
import type { Actions } from './actions';
import type { DroppableContainersMap } from './constructors';
export interface DraggableElement {
    node: DraggableNode;
    id: UniqueIdentifier;
    index: number;
    collection: string;
    disabled: boolean;
}
declare type AnyData = Record<string, any>;
export declare type Data<T = AnyData> = T & AnyData;
export declare type DataRef<T = AnyData> = MutableRefObject<Data<T> | undefined>;
export interface DroppableContainer {
    id: UniqueIdentifier;
    key: UniqueIdentifier;
    data: DataRef;
    disabled: boolean;
    node: MutableRefObject<HTMLElement | null>;
    rect: MutableRefObject<ClientRect | null>;
}
export interface Active {
    id: UniqueIdentifier;
    data: DataRef;
    rect: MutableRefObject<{
        initial: ClientRect | null;
        translated: ClientRect | null;
    }>;
}
export interface Over {
    id: UniqueIdentifier;
    rect: ClientRect;
    disabled: boolean;
    data: DataRef;
}
export declare type DraggableNode = {
    id: UniqueIdentifier;
    key: UniqueIdentifier;
    node: MutableRefObject<HTMLElement | null>;
    activatorNode: MutableRefObject<HTMLElement | null>;
    data: DataRef;
};
export declare type DraggableNodes = Map<UniqueIdentifier, DraggableNode | undefined>;
export declare type DroppableContainers = DroppableContainersMap;
export declare type RectMap = Map<UniqueIdentifier, ClientRect>;
export interface State {
    droppable: {
        containers: DroppableContainers;
    };
    draggable: {
        active: UniqueIdentifier | null;
        initialCoordinates: Coordinates;
        nodes: DraggableNodes;
        translate: Coordinates;
    };
}
export interface PublicContextDescriptor {
    activatorEvent: Event | null;
    active: Active | null;
    activeNode: HTMLElement | null;
    activeNodeRect: ClientRect | null;
    collisions: Collision[] | null;
    containerNodeRect: ClientRect | null;
    draggableNodes: DraggableNodes;
    droppableContainers: DroppableContainers;
    droppableRects: RectMap;
    over: Over | null;
    dragOverlay: {
        nodeRef: MutableRefObject<HTMLElement | null>;
        rect: ClientRect | null;
        setRef: (element: HTMLElement | null) => void;
    };
    scrollableAncestors: Element[];
    scrollableAncestorRects: ClientRect[];
    measuringConfiguration: DeepRequired<MeasuringConfiguration>;
    measureDroppableContainers(ids: UniqueIdentifier[]): void;
    measuringScheduled: boolean;
    windowRect: ClientRect | null;
}
export interface InternalContextDescriptor {
    activatorEvent: Event | null;
    activators: SyntheticListeners;
    active: Active | null;
    activeNodeRect: ClientRect | null;
    ariaDescribedById: {
        draggable: string;
    };
    dispatch: React.Dispatch<Actions>;
    draggableNodes: DraggableNodes;
    over: Over | null;
    measureDroppableContainers(ids: UniqueIdentifier[]): void;
}
export {};
