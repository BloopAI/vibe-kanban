import type { DeepRequired } from '@dnd-kit/utilities';
import type { DataRef } from '../../store/types';
import { KeyboardSensor, PointerSensor } from '../../sensors';
import type { MeasuringConfiguration } from './types';
export declare const defaultSensors: ({
    sensor: typeof PointerSensor;
    options: {};
} | {
    sensor: typeof KeyboardSensor;
    options: {};
})[];
export declare const defaultData: DataRef;
export declare const defaultMeasuringConfiguration: DeepRequired<MeasuringConfiguration>;
