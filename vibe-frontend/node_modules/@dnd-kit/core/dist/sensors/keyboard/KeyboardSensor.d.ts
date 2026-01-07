import type { Activators, SensorInstance, SensorProps, SensorOptions } from '../types';
import { KeyboardCoordinateGetter, KeyboardCodes } from './types';
export interface KeyboardSensorOptions extends SensorOptions {
    keyboardCodes?: KeyboardCodes;
    coordinateGetter?: KeyboardCoordinateGetter;
    scrollBehavior?: ScrollBehavior;
    onActivation?({ event }: {
        event: KeyboardEvent;
    }): void;
}
export declare type KeyboardSensorProps = SensorProps<KeyboardSensorOptions>;
export declare class KeyboardSensor implements SensorInstance {
    private props;
    autoScrollEnabled: boolean;
    private referenceCoordinates;
    private listeners;
    private windowListeners;
    constructor(props: KeyboardSensorProps);
    private attach;
    private handleStart;
    private handleKeyDown;
    private handleMove;
    private handleEnd;
    private handleCancel;
    private detach;
    static activators: Activators<KeyboardSensorOptions>;
}
