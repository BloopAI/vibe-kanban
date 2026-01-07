// Export is needed because TypeScript complains about an error otherwise:
// Error: …/tailwind-merge/src/config-utils.ts(8,17): semantic error TS4058: Return type of exported function has or is using name 'LruCache' from external module "…/tailwind-merge/src/lru-cache" but cannot be named.
export interface LruCache<Key extends string, Value> {
    get(key: Key): Value | undefined
    set(key: Key, value: Value): void
}

// LRU cache implementation using plain objects for simplicity
export const createLruCache = <Key extends string, Value>(
    maxCacheSize: number,
): LruCache<Key, Value> => {
    if (maxCacheSize < 1) {
        return {
            get: () => undefined,
            set: () => {},
        }
    }

    let cacheSize = 0
    let cache: Record<Key, Value> = Object.create(null)
    let previousCache: Record<Key, Value> = Object.create(null)

    const update = (key: Key, value: Value) => {
        cache[key] = value
        cacheSize++

        if (cacheSize > maxCacheSize) {
            cacheSize = 0
            previousCache = cache
            cache = Object.create(null)
        }
    }

    return {
        get(key) {
            let value = cache[key]

            if (value !== undefined) {
                return value
            }
            if ((value = previousCache[key]) !== undefined) {
                update(key, value)
                return value
            }
        },
        set(key, value) {
            if (key in cache) {
                cache[key] = value
            } else {
                update(key, value)
            }
        },
    }
}
