import type { SensorDescriptor, SensorOptions } from './types';
export declare function useSensors(...sensors: (SensorDescriptor<any> | undefined | null)[]): SensorDescriptor<SensorOptions>[];
