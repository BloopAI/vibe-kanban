import type { PointerEvent } from 'react';
import type { SensorProps } from '../types';
import { AbstractPointerSensor, AbstractPointerSensorOptions } from './AbstractPointerSensor';
export interface PointerSensorOptions extends AbstractPointerSensorOptions {
}
export declare type PointerSensorProps = SensorProps<PointerSensorOptions>;
export declare class PointerSensor extends AbstractPointerSensor {
    constructor(props: PointerSensorProps);
    static activators: {
        eventName: "onPointerDown";
        handler: ({ nativeEvent: event }: PointerEvent, { onActivation }: PointerSensorOptions) => boolean;
    }[];
}
