import type { SensorActivatorFunction, SensorDescriptor } from '../../sensors';
import type { SyntheticListener, SyntheticListeners } from './useSyntheticListeners';
export declare function useCombineActivators(sensors: SensorDescriptor<any>[], getSyntheticHandler: (handler: SensorActivatorFunction<any>, sensor: SensorDescriptor<any>) => SyntheticListener['handler']): SyntheticListeners;
