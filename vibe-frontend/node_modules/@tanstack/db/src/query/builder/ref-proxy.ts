import { PropRef, Value } from '../ir.js'
import type { BasicExpression } from '../ir.js'
import type { RefLeaf } from './types.js'

export interface RefProxy<T = any> {
  /** @internal */
  readonly __refProxy: true
  /** @internal */
  readonly __path: Array<string>
  /** @internal */
  readonly __type: T
}

/**
 * Type for creating a RefProxy for a single row/type without namespacing
 * Used in collection indexes and where clauses
 */
export type SingleRowRefProxy<T> =
  T extends Record<string, any>
    ? {
        [K in keyof T]: T[K] extends Record<string, any>
          ? SingleRowRefProxy<T[K]> & RefProxy<T[K]>
          : RefLeaf<T[K]>
      } & RefProxy<T>
    : RefProxy<T>

/**
 * Creates a proxy object that records property access paths for a single row
 * Used in collection indexes and where clauses
 */
export function createSingleRowRefProxy<
  T extends Record<string, any>,
>(): SingleRowRefProxy<T> {
  const cache = new Map<string, any>()

  function createProxy(path: Array<string>): any {
    const pathKey = path.join(`.`)
    if (cache.has(pathKey)) {
      return cache.get(pathKey)
    }

    const proxy = new Proxy({} as any, {
      get(target, prop, receiver) {
        if (prop === `__refProxy`) return true
        if (prop === `__path`) return path
        if (prop === `__type`) return undefined // Type is only for TypeScript inference
        if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver)

        const newPath = [...path, String(prop)]
        return createProxy(newPath)
      },

      has(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
          return true
        return Reflect.has(target, prop)
      },

      ownKeys(target) {
        return Reflect.ownKeys(target)
      },

      getOwnPropertyDescriptor(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
          return { enumerable: false, configurable: true }
        }
        return Reflect.getOwnPropertyDescriptor(target, prop)
      },
    })

    cache.set(pathKey, proxy)
    return proxy
  }

  // Return the root proxy that starts with an empty path
  return createProxy([]) as SingleRowRefProxy<T>
}

/**
 * Creates a proxy object that records property access paths
 * Used in callbacks like where, select, etc. to create type-safe references
 */
export function createRefProxy<T extends Record<string, any>>(
  aliases: Array<string>,
): RefProxy<T> & T {
  const cache = new Map<string, any>()
  let accessId = 0 // Monotonic counter to record evaluation order

  function createProxy(path: Array<string>): any {
    const pathKey = path.join(`.`)
    if (cache.has(pathKey)) {
      return cache.get(pathKey)
    }

    const proxy = new Proxy({} as any, {
      get(target, prop, receiver) {
        if (prop === `__refProxy`) return true
        if (prop === `__path`) return path
        if (prop === `__type`) return undefined // Type is only for TypeScript inference
        if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver)

        const newPath = [...path, String(prop)]
        return createProxy(newPath)
      },

      has(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
          return true
        return Reflect.has(target, prop)
      },

      ownKeys(target) {
        const id = ++accessId
        const sentinelKey = `__SPREAD_SENTINEL__${path.join(`.`)}__${id}`
        if (!Object.prototype.hasOwnProperty.call(target, sentinelKey)) {
          Object.defineProperty(target, sentinelKey, {
            enumerable: true,
            configurable: true,
            value: true,
          })
        }
        return Reflect.ownKeys(target)
      },

      getOwnPropertyDescriptor(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
          return { enumerable: false, configurable: true }
        }
        return Reflect.getOwnPropertyDescriptor(target, prop)
      },
    })

    cache.set(pathKey, proxy)
    return proxy
  }

  // Create the root proxy with all aliases as top-level properties
  const rootProxy = new Proxy({} as any, {
    get(target, prop, receiver) {
      if (prop === `__refProxy`) return true
      if (prop === `__path`) return []
      if (prop === `__type`) return undefined // Type is only for TypeScript inference
      if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver)

      const propStr = String(prop)
      if (aliases.includes(propStr)) {
        return createProxy([propStr])
      }

      return undefined
    },

    has(target, prop) {
      if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
        return true
      if (typeof prop === `string` && aliases.includes(prop)) return true
      return Reflect.has(target, prop)
    },

    ownKeys(_target) {
      return [...aliases, `__refProxy`, `__path`, `__type`]
    },

    getOwnPropertyDescriptor(target, prop) {
      if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
        return { enumerable: false, configurable: true }
      }
      if (typeof prop === `string` && aliases.includes(prop)) {
        return { enumerable: true, configurable: true }
      }
      return undefined
    },
  })

  return rootProxy
}

/**
 * Converts a value to an Expression
 * If it's a RefProxy, creates a Ref, otherwise creates a Value
 */
export function toExpression<T = any>(value: T): BasicExpression<T>
export function toExpression(value: RefProxy<any>): BasicExpression<any>
export function toExpression(value: any): BasicExpression<any> {
  if (isRefProxy(value)) {
    return new PropRef(value.__path)
  }
  // If it's already an Expression (Func, Ref, Value) or Agg, return it directly
  if (
    value &&
    typeof value === `object` &&
    `type` in value &&
    (value.type === `func` ||
      value.type === `ref` ||
      value.type === `val` ||
      value.type === `agg`)
  ) {
    return value
  }
  return new Value(value)
}

/**
 * Type guard to check if a value is a RefProxy
 */
export function isRefProxy(value: any): value is RefProxy {
  return value && typeof value === `object` && value.__refProxy === true
}

/**
 * Helper to create a Value expression from a literal
 */
export function val<T>(value: T): BasicExpression<T> {
  return new Value(value)
}
