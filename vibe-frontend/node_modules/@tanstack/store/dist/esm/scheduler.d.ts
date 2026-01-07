import { Derived } from './derived.js';
import { Store } from './store.js';
/**
 * This is here to solve the pyramid dependency problem where:
 *       A
 *      / \
 *     B   C
 *      \ /
 *       D
 *
 * Where we deeply traverse this tree, how do we avoid D being recomputed twice; once when B is updated, once when C is.
 *
 * To solve this, we create linkedDeps that allows us to sync avoid writes to the state until all of the deps have been
 * resolved.
 *
 * This is a record of stores, because derived stores are not able to write values to, but stores are
 */
export declare const __storeToDerived: WeakMap<Store<unknown, (cb: unknown) => unknown>, Derived<unknown, readonly any[]>[]>;
export declare const __derivedToStore: WeakMap<Derived<unknown, readonly any[]>, Set<Store<unknown, (cb: unknown) => unknown>>>;
export declare const __depsThatHaveWrittenThisTick: {
    current: Array<Derived<unknown> | Store<unknown>>;
};
/**
 * @private only to be called from `Store` on write
 */
export declare function __flush(store: Store<unknown>): void;
export declare function batch(fn: () => void): void;
