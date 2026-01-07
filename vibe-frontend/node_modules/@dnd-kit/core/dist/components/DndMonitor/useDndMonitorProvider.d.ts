import type { DndMonitorEvent } from './types';
export declare function useDndMonitorProvider(): readonly [({ type, event }: DndMonitorEvent) => void, (listener: any) => () => boolean];
