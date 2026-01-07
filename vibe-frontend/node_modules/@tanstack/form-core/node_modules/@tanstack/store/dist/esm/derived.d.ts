import { Store } from './store.js';
import { Listener } from './types.js';
export type UnwrapDerivedOrStore<T> = T extends Derived<infer InnerD> ? InnerD : T extends Store<infer InnerS> ? InnerS : never;
type UnwrapReadonlyDerivedOrStoreArray<TArr extends ReadonlyArray<Derived<any> | Store<any>>> = TArr extends readonly [] ? [] : TArr extends readonly [infer Head, ...infer Tail] ? Head extends Derived<any> | Store<any> ? Tail extends ReadonlyArray<Derived<any> | Store<any>> ? [
    UnwrapDerivedOrStore<Head>,
    ...UnwrapReadonlyDerivedOrStoreArray<Tail>
] : [UnwrapDerivedOrStore<Head>] : [] : TArr extends ReadonlyArray<Derived<any> | Store<any>> ? Array<UnwrapDerivedOrStore<TArr[number]>> : [];
export interface DerivedFnProps<TArr extends ReadonlyArray<Derived<any> | Store<any>> = ReadonlyArray<any>, TUnwrappedArr extends UnwrapReadonlyDerivedOrStoreArray<TArr> = UnwrapReadonlyDerivedOrStoreArray<TArr>> {
    /**
     * `undefined` if it's the first run
     * @privateRemarks this also cannot be typed as TState, as it breaks the inferencing of the function's return type when an argument is used - even with `NoInfer` usage
     */
    prevVal: unknown | undefined;
    prevDepVals: TUnwrappedArr | undefined;
    currDepVals: TUnwrappedArr;
}
export interface DerivedOptions<TState, TArr extends ReadonlyArray<Derived<any> | Store<any>> = ReadonlyArray<any>> {
    onSubscribe?: (listener: Listener<TState>, derived: Derived<TState>) => () => void;
    onUpdate?: () => void;
    deps: TArr;
    /**
     * Values of the `deps` from before and after the current invocation of `fn`
     */
    fn: (props: DerivedFnProps<TArr>) => TState;
}
export declare class Derived<TState, const TArr extends ReadonlyArray<Derived<any> | Store<any>> = ReadonlyArray<any>> {
    listeners: Set<Listener<TState>>;
    state: TState;
    prevState: TState | undefined;
    options: DerivedOptions<TState, TArr>;
    /**
     * Functions representing the subscriptions. Call a function to cleanup
     * @private
     */
    _subscriptions: Array<() => void>;
    lastSeenDepValues: Array<unknown>;
    getDepVals: () => {
        prevDepVals: unknown[];
        currDepVals: unknown[];
        prevVal: NonNullable<TState> | undefined;
    };
    constructor(options: DerivedOptions<TState, TArr>);
    registerOnGraph(deps?: ReadonlyArray<Derived<any> | Store<any>>): void;
    unregisterFromGraph(deps?: ReadonlyArray<Derived<any> | Store<any>>): void;
    recompute: () => void;
    checkIfRecalculationNeededDeeply: () => void;
    mount: () => () => void;
    subscribe: (listener: Listener<TState>) => () => void;
}
export {};
