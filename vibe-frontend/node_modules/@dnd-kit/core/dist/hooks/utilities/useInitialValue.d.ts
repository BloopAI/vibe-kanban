declare type AnyFunction = (...args: any) => any;
export declare function useInitialValue<T, U extends AnyFunction | undefined = undefined>(value: T | null, computeFn?: U): U extends AnyFunction ? ReturnType<U> | null : T | null;
export {};
