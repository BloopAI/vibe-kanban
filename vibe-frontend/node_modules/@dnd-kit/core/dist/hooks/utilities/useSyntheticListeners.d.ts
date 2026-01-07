/// <reference types="react" />
import type { SyntheticEventName, UniqueIdentifier } from '../../types';
export declare type SyntheticListener = {
    eventName: SyntheticEventName;
    handler: (event: React.SyntheticEvent, id: UniqueIdentifier) => void;
};
export declare type SyntheticListeners = SyntheticListener[];
export declare type SyntheticListenerMap = Record<string, Function>;
export declare function useSyntheticListeners(listeners: SyntheticListeners, id: UniqueIdentifier): SyntheticListenerMap;
