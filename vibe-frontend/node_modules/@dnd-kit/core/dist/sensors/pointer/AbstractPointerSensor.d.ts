import type { SensorInstance, SensorProps, SensorOptions } from '../types';
import type { DistanceMeasurement } from '../../types';
interface DistanceConstraint {
    distance: DistanceMeasurement;
    tolerance?: DistanceMeasurement;
}
interface DelayConstraint {
    delay: number;
    tolerance: DistanceMeasurement;
}
interface EventDescriptor {
    name: keyof DocumentEventMap;
    passive?: boolean;
}
export interface PointerEventHandlers {
    cancel?: EventDescriptor;
    move: EventDescriptor;
    end: EventDescriptor;
}
export declare type PointerActivationConstraint = DelayConstraint | DistanceConstraint | (DelayConstraint & DistanceConstraint);
export interface AbstractPointerSensorOptions extends SensorOptions {
    activationConstraint?: PointerActivationConstraint;
    bypassActivationConstraint?(props: Pick<AbstractPointerSensorProps, 'activeNode' | 'event' | 'options'>): boolean;
    onActivation?({ event }: {
        event: Event;
    }): void;
}
export declare type AbstractPointerSensorProps = SensorProps<AbstractPointerSensorOptions>;
export declare class AbstractPointerSensor implements SensorInstance {
    private props;
    private events;
    autoScrollEnabled: boolean;
    private document;
    private activated;
    private initialCoordinates;
    private timeoutId;
    private listeners;
    private documentListeners;
    private windowListeners;
    constructor(props: AbstractPointerSensorProps, events: PointerEventHandlers, listenerTarget?: Document | EventTarget);
    private attach;
    private detach;
    private handlePending;
    private handleStart;
    private handleMove;
    private handleEnd;
    private handleCancel;
    private handleKeydown;
    private removeTextSelection;
}
export {};
