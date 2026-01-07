import type { DeepRequired, Transform } from '@dnd-kit/utilities';
import type { Active, DraggableNodes, DroppableContainers } from '../../../store';
import type { ClientRect, UniqueIdentifier } from '../../../types';
import type { MeasuringConfiguration } from '../../DndContext';
interface SharedParameters {
    active: {
        id: UniqueIdentifier;
        data: Active['data'];
        node: HTMLElement;
        rect: ClientRect;
    };
    dragOverlay: {
        node: HTMLElement;
        rect: ClientRect;
    };
    draggableNodes: DraggableNodes;
    droppableContainers: DroppableContainers;
    measuringConfiguration: DeepRequired<MeasuringConfiguration>;
}
export interface KeyframeResolverParameters extends SharedParameters {
    transform: {
        initial: Transform;
        final: Transform;
    };
}
export declare type KeyframeResolver = (parameters: KeyframeResolverParameters) => Keyframe[];
export interface DropAnimationOptions {
    keyframes?: KeyframeResolver;
    duration?: number;
    easing?: string;
    sideEffects?: DropAnimationSideEffects | null;
}
export declare type DropAnimation = DropAnimationFunction | DropAnimationOptions;
interface Arguments {
    draggableNodes: DraggableNodes;
    droppableContainers: DroppableContainers;
    measuringConfiguration: DeepRequired<MeasuringConfiguration>;
    config?: DropAnimation | null;
}
export interface DropAnimationFunctionArguments extends SharedParameters {
    transform: Transform;
}
export declare type DropAnimationFunction = (args: DropAnimationFunctionArguments) => Promise<void> | void;
declare type CleanupFunction = () => void;
export interface DropAnimationSideEffectsParameters extends SharedParameters {
}
export declare type DropAnimationSideEffects = (parameters: DropAnimationSideEffectsParameters) => CleanupFunction | void;
declare type ExtractStringProperties<T> = {
    [K in keyof T]?: T[K] extends string ? string : never;
};
declare type Styles = ExtractStringProperties<CSSStyleDeclaration>;
interface DefaultDropAnimationSideEffectsOptions {
    className?: {
        active?: string;
        dragOverlay?: string;
    };
    styles?: {
        active?: Styles;
        dragOverlay?: Styles;
    };
}
export declare const defaultDropAnimationSideEffects: (options: DefaultDropAnimationSideEffectsOptions) => DropAnimationSideEffects;
export declare const defaultDropAnimationConfiguration: Required<DropAnimationOptions>;
export declare function useDropAnimation({ config, draggableNodes, droppableContainers, measuringConfiguration, }: Arguments): (...args: any) => any;
export {};
