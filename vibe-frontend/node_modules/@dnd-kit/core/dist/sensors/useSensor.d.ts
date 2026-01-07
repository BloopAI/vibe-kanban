import type { Sensor, SensorDescriptor, SensorOptions } from './types';
export declare function useSensor<T extends SensorOptions>(sensor: Sensor<T>, options?: T): SensorDescriptor<T>;
