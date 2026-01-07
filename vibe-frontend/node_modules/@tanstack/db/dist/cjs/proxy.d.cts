/**
 * A utility for creating a proxy that captures changes to an object
 * and provides a way to retrieve those changes.
 */
interface ChangeTracker<T extends object> {
    originalObject: T;
    modified: boolean;
    copy_: T;
    proxyCount: number;
    assigned_: Record<string | symbol, boolean>;
    parent?: {
        tracker: ChangeTracker<Record<string | symbol, unknown>>;
        prop: string | symbol;
    } | {
        tracker: ChangeTracker<Record<string | symbol, unknown>>;
        prop: string | symbol;
        updateMap: (newValue: unknown) => void;
    } | {
        tracker: ChangeTracker<Record<string | symbol, unknown>>;
        prop: unknown;
        updateSet: (newValue: unknown) => void;
    };
    target: T;
}
/**
 * Creates a proxy that tracks changes to the target object
 *
 * @param target The object to proxy
 * @param parent Optional parent information
 * @returns An object containing the proxy and a function to get the changes
 */
export declare function createChangeProxy<T extends Record<string | symbol, any | undefined>>(target: T, parent?: {
    tracker: ChangeTracker<Record<string | symbol, unknown>>;
    prop: string | symbol;
}): {
    proxy: T;
    getChanges: () => Record<string | symbol, any>;
};
/**
 * Creates proxies for an array of objects and tracks changes to each
 *
 * @param targets Array of objects to proxy
 * @returns An object containing the array of proxies and a function to get all changes
 */
export declare function createArrayChangeProxy<T extends object>(targets: Array<T>): {
    proxies: Array<T>;
    getChanges: () => Array<Record<string | symbol, unknown>>;
};
/**
 * Creates a proxy for an object, passes it to a callback function,
 * and returns the changes made by the callback
 *
 * @param target The object to proxy
 * @param callback Function that receives the proxy and can make changes to it
 * @returns The changes made to the object
 */
export declare function withChangeTracking<T extends object>(target: T, callback: (proxy: T) => void): Record<string | symbol, unknown>;
/**
 * Creates proxies for an array of objects, passes them to a callback function,
 * and returns the changes made by the callback for each object
 *
 * @param targets Array of objects to proxy
 * @param callback Function that receives the proxies and can make changes to them
 * @returns Array of changes made to each object
 */
export declare function withArrayChangeTracking<T extends object>(targets: Array<T>, callback: (proxies: Array<T>) => void): Array<Record<string | symbol, unknown>>;
export {};
