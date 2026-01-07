import { AnyUpdater, Listener } from './types.js';
export interface StoreOptions<TState, TUpdater extends AnyUpdater = (cb: TState) => TState> {
    /**
     * Replace the default update function with a custom one.
     */
    updateFn?: (previous: TState) => (updater: TUpdater) => TState;
    /**
     * Called when a listener subscribes to the store.
     *
     * @return a function to unsubscribe the listener
     */
    onSubscribe?: (listener: Listener<TState>, store: Store<TState, TUpdater>) => () => void;
    /**
     * Called after the state has been updated, used to derive other state.
     */
    onUpdate?: () => void;
}
export declare class Store<TState, TUpdater extends AnyUpdater = (cb: TState) => TState> {
    listeners: Set<Listener<TState>>;
    state: TState;
    prevState: TState;
    options?: StoreOptions<TState, TUpdater>;
    constructor(initialState: TState, options?: StoreOptions<TState, TUpdater>);
    subscribe: (listener: Listener<TState>) => () => void;
    /**
     * Update the store state safely with improved type checking
     */
    setState(updater: (prevState: TState) => TState): void;
    setState(updater: TState): void;
    setState(updater: TUpdater): void;
}
