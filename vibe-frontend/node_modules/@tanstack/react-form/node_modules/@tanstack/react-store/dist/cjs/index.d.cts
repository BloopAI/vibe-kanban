import { Derived, Store } from '@tanstack/store';
export * from '@tanstack/store';
/**
 * @private
 */
export type NoInfer<T> = [T][T extends any ? 0 : never];
type EqualityFn<T> = (objA: T, objB: T) => boolean;
interface UseStoreOptions<T> {
    equal?: EqualityFn<T>;
}
export declare function useStore<TState, TSelected = NoInfer<TState>>(store: Store<TState, any>, selector?: (state: NoInfer<TState>) => TSelected, options?: UseStoreOptions<TSelected>): TSelected;
export declare function useStore<TState, TSelected = NoInfer<TState>>(store: Derived<TState, any>, selector?: (state: NoInfer<TState>) => TSelected, options?: UseStoreOptions<TSelected>): TSelected;
export declare function shallow<T>(objA: T, objB: T): boolean;
