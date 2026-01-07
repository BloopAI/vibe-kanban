import type { Active, Data, DroppableContainer, RectMap } from '../../store';
import type { Coordinates, ClientRect, UniqueIdentifier } from '../../types';
export interface Collision {
    id: UniqueIdentifier;
    data?: Data;
}
export interface CollisionDescriptor extends Collision {
    data: {
        droppableContainer: DroppableContainer;
        value: number;
        [key: string]: any;
    };
}
export declare type CollisionDetection = (args: {
    active: Active;
    collisionRect: ClientRect;
    droppableRects: RectMap;
    droppableContainers: DroppableContainer[];
    pointerCoordinates: Coordinates | null;
}) => Collision[];
