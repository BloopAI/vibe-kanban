import type { DeepReadonly } from '@vue/reactivity';
import type { ReactElement } from 'react';
import { ReactiveEffect } from '@vue/reactivity';
import type { ReactNode } from 'react';
import type { UnwrapNestedRefs } from '@vue/reactivity';

/**
 * @public
 */
export declare class Controller<T = any> {
    readonly _getState: () => T;
    readonly _compare: (prev: T, next: T) => boolean;
    readonly _lifeCycle: LifeCycle;
    readonly _namespace?: string;
    readonly _onUpdate?: () => void;
    readonly _listeners: Set<() => void>;
    _getStateSafe: () => T;
    _effect: ReactiveEffect<T>;
    _state: T;
    _devState: any;
    _devCompare: any;
    _devSelector: any;
    _devActions: any;
    _devWithDeep: any;
    _devWithStable: any;
    _devVersion: string;
    _devReduxOptions: any;
    _devPersistOptions: any;
    _devType: any;
    _devResult: any;
    _devRunCount: number;
    _updateCount: number;
    _isActive: boolean;
    constructor(_getState: () => T, _compare: (prev: T, next: T) => boolean, _lifeCycle: LifeCycle, _namespace?: string, _onUpdate?: () => void);
    notify: () => void;
    _scheduler: () => void;
    subscribe: (listener: () => void) => () => boolean;
    getState: () => number;
    getEffect: () => ReactiveEffect<T>;
    getSelectorState: () => T;
    getLifeCycle: () => LifeCycle;
    run(): void;
    stop(): void;
    setActive(d: boolean): void;
}

/**
 * @public
 *
 * @example
 * ```typescript
 * import { createState } from "r-store";
 *
 * const count = createState(() => ({state: 0}), {
 *  withPersist: "count",
 *  withActions: (state) => ({
 *   increment: () => {
 *    state.state++;
 *   },
 *  }),
 *  withNamespace: "count",
 *  withDeepSelector: true,
 *  withStableSelector: true,
 * });
 * ```
 */
export declare function createState<T extends Record<string, unknown>, P extends Record<string, Function>>(setup: Setup<StateWithMiddleware<T, P>>): UseSelectorWithState<T, P>;

/**
 * @public
 *
 * @example
 * ```typescript
 * import { createState } from "r-store";
 *
 * const count = createState(() => ({state: 0}), {
 *  withPersist: "count",
 *  withActions: (state) => ({
 *   increment: () => {
 *    state.state++;
 *   },
 *  }),
 *  withNamespace: "count",
 *  withDeepSelector: true,
 *  withStableSelector: true,
 * });
 * ```
 */
export declare function createState<T extends Record<string, unknown>>(setup: Setup<T>): UseSelectorWithState<T, {}>;

/**
 * @public
 *
 * @example
 * ```typescript
 * import { createState } from "r-store";
 *
 * const count = createState(() => ({state: 0}), {
 *  withPersist: "count",
 *  withActions: (state) => ({
 *   increment: () => {
 *    state.state++;
 *   },
 *  }),
 *  withNamespace: "count",
 *  withDeepSelector: true,
 *  withStableSelector: true,
 * });
 * ```
 */
export declare function createState<T extends Record<string, unknown>, P extends Record<string, Function>>(setup: Setup<MaybeStateWithMiddleware<T, P>>): UseSelectorWithState<UnWrapMiddleware<T>, P>;

/**
 * @public
 *
 * @example
 * ```typescript
 * import { createState } from "r-store";
 *
 * const count = createState(() => ({state: 0}), {
 *  withPersist: "count",
 *  withActions: (state) => ({
 *   increment: () => {
 *    state.state++;
 *   },
 *  }),
 *  withNamespace: "count",
 *  withDeepSelector: true,
 *  withStableSelector: true,
 * });
 * ```
 */
export declare function createState<T extends Record<string, unknown>, P extends Record<string, Function>, L extends Record<string, Function>>(setup: Setup<StateWithMiddleware<T, L>>, options: {
    withActions: WithActionsProps<T, P>["generateActions"];
    withPersist?: string | WithPersistProps<T>;
    withNamespace?: string | WithNamespaceProps<T>;
    withDeepSelector?: boolean;
    withStableSelector?: boolean;
}): UseSelectorWithState<T, P & L>;

/**
 * @public
 *
 * @example
 * ```typescript
 * import { createState } from "r-store";
 *
 * const count = createState(() => ({state: 0}), {
 *  withPersist: "count",
 *  withActions: (state) => ({
 *   increment: () => {
 *    state.state++;
 *   },
 *  }),
 *  withNamespace: "count",
 *  withDeepSelector: true,
 *  withStableSelector: true,
 * });
 * ```
 */
export declare function createState<T extends Record<string, unknown>, P extends Record<string, Function>>(setup: Setup<T>, options: {
    withActions: WithActionsProps<T, P>["generateActions"];
    withPersist?: string | WithPersistProps<T>;
    withNamespace?: string | WithNamespaceProps<T>;
    withDeepSelector?: boolean;
    withStableSelector?: boolean;
}): UseSelectorWithState<T, P>;

/**
 * @public
 *
 * @example
 * ```typescript
 * import { createState } from "r-store";
 *
 * const count = createState(() => ({state: 0}), {
 *  withPersist: "count",
 *  withActions: (state) => ({
 *   increment: () => {
 *    state.state++;
 *   },
 *  }),
 *  withNamespace: "count",
 *  withDeepSelector: true,
 *  withStableSelector: true,
 * });
 * ```
 */
export declare function createState<T extends Record<string, unknown>, P extends Record<string, Function>>(setup: Setup<StateWithMiddleware<T, P>>, options: {
    withPersist?: string | WithPersistProps<T>;
    withNamespace?: string | WithNamespaceProps<T>;
    withDeepSelector?: boolean;
    withStableSelector?: boolean;
}): UseSelectorWithState<T, P>;

/**
 * @public
 *
 * @example
 * ```typescript
 * import { createState } from "r-store";
 *
 * const count = createState(() => ({state: 0}), {
 *  withPersist: "count",
 *  withActions: (state) => ({
 *   increment: () => {
 *    state.state++;
 *   },
 *  }),
 *  withNamespace: "count",
 *  withDeepSelector: true,
 *  withStableSelector: true,
 * });
 * ```
 */
export declare function createState<T extends Record<string, unknown>>(setup: Setup<T>, options: {
    withPersist?: string | WithPersistProps<T>;
    withNamespace?: string | WithNamespaceProps<T>;
    withDeepSelector?: boolean;
    withStableSelector?: boolean;
}): UseSelectorWithState<T, {}>;

/**
 * @public
 *
 * @example
 * ```typescript
 * import { createStore, ref } from "r-store";
 *
 * const count = createStore(() => {
 *  const state = ref(0);
 *
 *  const increment = () => {
 *    state.value++;
 *  };
 *
 *  return { state, increment };
 * });
 * ```
 */
export declare const createStore: <T extends Record<string, unknown>>(creator: Creator<T>) => UseSelectorWithStore<T>;

/**
 * @public
 * @deprecated
 * not recommend to use this function, use `createStore` instead
 */
export declare function createStoreWithComponent<T extends Record<string, unknown>>(props: CreateStoreWithComponentProps<NonNullable<unknown>, T>): ({ children }: {
    children?: (p: DeepReadonly<UnwrapNestedRefs<T>>) => ReactNode;
}) => ReactElement;

/**
 * @public
 * @deprecated
 * not recommend to use this function, use `createStore` instead
 */
export declare function createStoreWithComponent<P extends Record<string, unknown>, T extends Record<string, unknown>>(props: CreateStoreWithComponentProps<P, T>): ({ children }: {
    children?: (p: P & DeepReadonly<UnwrapNestedRefs<T>>) => ReactNode;
} & P) => ReactElement;

/**
 * @public
 */
export declare type CreateStoreWithComponentProps<P extends Record<string, unknown>, T extends Record<string, unknown>> = {
    setup: Creator<T>;
    render?: (props: P & DeepReadonly<UnwrapNestedRefs<T>>) => ReactNode;
};

/**
 * @public
 */
export declare type Creator<T extends Record<string, unknown>> = () => T;

/**
 * @public
 * @deprecated
 * no need to use this function
 */
export declare const getBatch: () => (cb: () => void) => void;

/**
 * @public
 */
export declare function getCurrentController(): Controller | null;

/**
 * @public
 */
declare type LifeCycle = {
    onBeforeMount: Array<() => void>;
    onMounted: Array<() => void>;
    onBeforeUpdate: Array<() => void>;
    onUpdated: Array<() => void>;
    onBeforeUnmount: Array<() => void>;
    onUnmounted: Array<() => void>;
    hasHookInstall: boolean;
    canUpdateComponent: boolean;
    syncUpdateComponent: boolean;
};

/**
 * @public
 */
export declare type MaybeStateWithMiddleware<T, P> = T | StateWithMiddleware<T, P>;

/**
 * @public
 */
export declare const onBeforeMount: (cb: () => void) => void;

/**
 * @public
 */
export declare const onBeforeUnmount: (cb: () => void) => void;

/**
 * @public
 */
export declare const onBeforeUpdate: (cb: () => void) => void;

/**
 * @public
 */
export declare const onMounted: (cb: () => void) => void;

/**
 * @public
 */
export declare const onUnmounted: (cb: () => void) => void;

/**
 * @public
 */
export declare const onUpdated: (cb: () => void) => void;

/**
 * @public
 * @deprecated
 * no need to use this function
 */
export declare const resetBatch: () => void;

/**
 * @public
 * @deprecated
 * no need to use this function
 */
export declare const setBatch: (batch: (cb: () => void) => void) => void;

/**
 * @public
 */
export declare type Setup<T> = () => T;

/**
 * @public
 */
export declare type StateWithMiddleware<T, P> = {
    ["$$__state__$$"]: T;
    ["$$__middleware__$$"]: Record<string, unknown>;
    ["$$__actions__$$"]: P;
    ["$$__namespace__$$"]: WithNamespaceProps<T>;
    ["$$__selectorOptions__$$"]: WithSelectorOptionsProps;
};

declare type StorageState = {
    version: string;
    data: any;
};

/**
 * @public
 */
export declare type UnWrapMiddleware<T> = T extends StateWithMiddleware<infer Q, infer _> ? UnWrapMiddleware<Q> : T;

/**
 * @public
 */
export declare const useReactiveEffect: (effectCallback: () => void | (() => void)) => void;

/**
 * @public
 */
export declare const useReactiveState: <T extends Record<string, unknown>>(initialState: T | (() => T)) => [DeepReadonly<UnwrapNestedRefs<T>>, (payload: UnwrapNestedRefs<T> | ((t: UnwrapNestedRefs<T>) => void)) => void];

/**
 * @public
 */
export declare type UseSelectorWithState<T, C> = {
    (): DeepReadonly<UnwrapNestedRefs<T>> & C;
    /**
     * @param selector - a method to select the state
     * @param compare - a method to compare the previous state and the next state, if the result is `true`, the component will not be updated
     * @returns the selected state
     */
    <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>> & C) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    /**
     * @deprecated
     * use `getReactiveState` / `getReadonlyState` instead
     */
    getState: () => T;
    /**
     * get the actions what defined in the `withActions` middleware function
     * @returns the actions
     */
    getActions: () => C;
    /**
     * internal lifeCycle object, if you do not know what it is, you can ignore it
     * @returns the lifeCycle object
     */
    getLifeCycle: () => LifeCycle;
    /**
     * get the reactive state, change the state will trigger the component update
     * @returns the reactive state
     */
    getReactiveState: () => UnwrapNestedRefs<T>;
    /**
     * get a readonly state, you can not change the state, it is a safe way to get the state and can be used in anywhere
     * @returns the readonly state
     */
    getReadonlyState: () => DeepReadonly<UnwrapNestedRefs<T>>;
    /**
     *
     * @param selector - a method to select the state, when the state change, the `cb` will be called
     * @param cb - a callback function
     * @returns a unsubscribe function
     */
    subscribe: <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>>) => P, cb?: () => void, shallow?: boolean) => () => void;
    useDeepSelector: {
        (): DeepReadonly<UnwrapNestedRefs<T>> & C;
        <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>> & C) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    };
    useDeepStableSelector: {
        (): DeepReadonly<UnwrapNestedRefs<T>> & C;
        <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>> & C) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    };
    useShallowSelector: {
        (): DeepReadonly<UnwrapNestedRefs<T>> & C;
        <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>> & C) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    };
    useShallowStableSelector: {
        (): DeepReadonly<UnwrapNestedRefs<T>> & C;
        <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>> & C) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    };
    clear: () => void;
};

/**
 * @public
 */
export declare type UseSelectorWithStore<T> = {
    (): DeepReadonly<UnwrapNestedRefs<T>>;
    /**
     * @param selector - a method to select the state
     * @param compare - a method to compare the previous state and the next state, if the result is `true`, the component will not be updated
     * @returns the selected state
     */
    <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>>) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    /**
     * @deprecated
     * use `getReactiveState` / `getReadonlyState` instead
     */
    getState: () => T;
    /**
     * internal lifeCycle object, if you do not know what it is, you can ignore it
     * @returns the lifeCycle object
     */
    getLifeCycle: () => LifeCycle;
    /**
     * get the reactive state, change the state will trigger the component update
     * @returns the reactive state
     */
    getReactiveState: () => UnwrapNestedRefs<T>;
    /**
     * get a readonly state, you can not change the state, it is a safe way to get the state and can be used in anywhere
     * @returns the readonly state
     */
    getReadonlyState: () => DeepReadonly<UnwrapNestedRefs<T>>;
    /**
     *
     * @param selector - a method to select the state, when the state change, the `cb` will be called
     * @param cb - a callback function
     * @returns a unsubscribe function
     */
    subscribe: <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>>) => P, cb?: () => void, shallow?: boolean) => () => void;
    useShallowSelector: {
        (): DeepReadonly<UnwrapNestedRefs<T>>;
        <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>>) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    };
    useShallowStableSelector: {
        (): DeepReadonly<UnwrapNestedRefs<T>>;
        <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>>) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    };
    useDeepSelector: {
        (): DeepReadonly<UnwrapNestedRefs<T>>;
        <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>>) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    };
    useDeepStableSelector: {
        (): DeepReadonly<UnwrapNestedRefs<T>>;
        <P>(selector: (state: DeepReadonly<UnwrapNestedRefs<T>>) => P, compare?: <Q extends P = P>(prev: Q, next: Q) => boolean): P;
    };
    clear: () => void;
};

/**
 * @public
 */
export declare const version: string;

/**
 * @public
 */
export declare function withActions<T extends StateWithMiddleware<Q, L>, Q extends Record<string, unknown>, P extends Record<string, Function>, L extends Record<string, Function>>(setup: Setup<StateWithMiddleware<Q, L>>, options: WithActionsProps<Q, P>): Setup<StateWithMiddleware<UnWrapMiddleware<T>, P & L>>;

/**
 * @public
 */
export declare function withActions<T extends Record<string, unknown>, P extends Record<string, Function>>(setup: Setup<T>, options: WithActionsProps<T, P>): Setup<StateWithMiddleware<T, P>>;

/**
 * @public
 */
export declare type WithActionsProps<T, P> = {
    generateActions?: (state: T) => P;
    /**
     * @deprecated
     *
     * no need this option anymore
     */
    automaticBatchAction?: boolean;
};

/**
 * @public
 * @deprecated
 * use `withSelectorOptions` instead
 */
export declare const withDeepSelector: typeof withSelectorOptions;

/**
 * @public
 */
export declare function withNamespace<T extends Record<string, unknown>, P extends Record<string, Function>>(setup: Setup<StateWithMiddleware<T, P>>, options: WithNamespaceProps<T>): Setup<StateWithMiddleware<T, P>>;

/**
 * @public
 */
export declare function withNamespace<T extends Record<string, unknown>>(setup: Setup<T>, options: WithNamespaceProps<T>): Setup<StateWithMiddleware<T, {}>>;

/**
 * @public
 */
export declare type WithNamespaceProps<T> = {
    namespace: string;
    reduxDevTool?: boolean;
    shallow?: boolean;
    listener?: (state: T) => any;
};

/**
 * @public
 */
export declare function withPersist<T extends Record<string, unknown>, P extends Record<string, Function>>(setup: Setup<StateWithMiddleware<T, P>>, options: WithPersistProps<T>): Setup<StateWithMiddleware<T, P>>;

/**
 * @public
 */
export declare function withPersist<T extends Record<string, unknown>>(setup: Setup<T>, options: WithPersistProps<T>): Setup<StateWithMiddleware<T, {}>>;

/**
 * @public
 */
export declare type WithPersistProps<T> = {
    key: string;
    version?: string;
    debounceTime?: number;
    getStorage?: () => Storage;
    stringify?: (s: T) => string;
    parse?: (s: string) => Partial<T>;
    merge?: (fromCreator: T, fromStorage: Partial<T>) => T;
    migrateVersion?: string;
    migrateState?: (prevState: StorageState | null, onDeleteFromStorage: () => void) => Partial<T> | null;
    devLog?: boolean;
    shallow?: boolean;
    listener?: (state: T) => any;
};

/**
 * @public
 */
export declare function withSelectorOptions<T extends Record<string, unknown>, P extends Record<string, Function>>(setup: Setup<StateWithMiddleware<T, P>>, options: WithSelectorOptionsProps): Setup<StateWithMiddleware<T, P>>;

/**
 * @public
 */
export declare function withSelectorOptions<T extends Record<string, unknown>>(setup: Setup<T>, options: WithSelectorOptionsProps): Setup<StateWithMiddleware<T, {}>>;

/**
 * @public
 */
declare type WithSelectorOptionsProps = {
    deepSelector?: boolean;
    stableCompare?: boolean;
    stableSelector?: boolean;
};

/**
 * @public
 * @deprecated
 * no need to use this function
 */
export declare const wrapperBatchUpdate: <T extends Function>(cb: T) => T;


export * from "@vue/reactivity";

export { }
