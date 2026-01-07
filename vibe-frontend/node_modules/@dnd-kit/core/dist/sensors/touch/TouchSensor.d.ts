import type { TouchEvent } from 'react';
import { AbstractPointerSensor, PointerSensorProps, PointerSensorOptions } from '../pointer';
import type { SensorProps } from '../types';
export interface TouchSensorOptions extends PointerSensorOptions {
}
export declare type TouchSensorProps = SensorProps<TouchSensorOptions>;
export declare class TouchSensor extends AbstractPointerSensor {
    constructor(props: PointerSensorProps);
    static activators: {
        eventName: "onTouchStart";
        handler: ({ nativeEvent: event }: TouchEvent, { onActivation }: TouchSensorOptions) => boolean;
    }[];
    static setup(): () => void;
}
