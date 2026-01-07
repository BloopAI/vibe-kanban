/**
 * A utility for creating a proxy that captures changes to an object
 * and provides a way to retrieve those changes.
 */

import { deepEquals, isTemporal } from './utils'

/**
 * Set of array methods that iterate with callbacks and may return elements.
 * Hoisted to module scope to avoid creating a new Set on every property access.
 */
const CALLBACK_ITERATION_METHODS = new Set([
  `find`,
  `findLast`,
  `findIndex`,
  `findLastIndex`,
  `filter`,
  `map`,
  `flatMap`,
  `forEach`,
  `some`,
  `every`,
  `reduce`,
  `reduceRight`,
])

/**
 * Set of array methods that modify the array in place.
 */
const ARRAY_MODIFYING_METHODS = new Set([
  `pop`,
  `push`,
  `shift`,
  `unshift`,
  `splice`,
  `sort`,
  `reverse`,
  `fill`,
  `copyWithin`,
])

/**
 * Set of Map/Set methods that modify the collection in place.
 */
const MAP_SET_MODIFYING_METHODS = new Set([`set`, `delete`, `clear`, `add`])

/**
 * Set of Map/Set iterator methods.
 */
const MAP_SET_ITERATOR_METHODS = new Set([
  `entries`,
  `keys`,
  `values`,
  `forEach`,
])

/**
 * Check if a value is a proxiable object (not Date, RegExp, or Temporal)
 */
function isProxiableObject(
  value: unknown,
): value is Record<string | symbol, unknown> {
  return (
    value !== null &&
    typeof value === `object` &&
    !((value as any) instanceof Date) &&
    !((value as any) instanceof RegExp) &&
    !isTemporal(value)
  )
}

/**
 * Creates a handler for array iteration methods that ensures proxied elements
 * are passed to callbacks and returned from methods like find/filter.
 */
function createArrayIterationHandler<T extends object>(
  methodName: string,
  methodFn: (...args: Array<unknown>) => unknown,
  changeTracker: ChangeTracker<T>,
  memoizedCreateChangeProxy: (
    obj: Record<string | symbol, unknown>,
    parent?: {
      tracker: ChangeTracker<Record<string | symbol, unknown>>
      prop: string | symbol
    },
  ) => { proxy: Record<string | symbol, unknown> },
): ((...args: Array<unknown>) => unknown) | undefined {
  if (!CALLBACK_ITERATION_METHODS.has(methodName)) {
    return undefined
  }

  return function (...args: Array<unknown>) {
    const callback = args[0]
    if (typeof callback !== `function`) {
      return methodFn.apply(changeTracker.copy_, args)
    }

    // Create a helper to get proxied version of an array element
    const getProxiedElement = (element: unknown, index: number): unknown => {
      if (isProxiableObject(element)) {
        const nestedParent = {
          tracker: changeTracker as unknown as ChangeTracker<
            Record<string | symbol, unknown>
          >,
          prop: String(index),
        }
        const { proxy: elementProxy } = memoizedCreateChangeProxy(
          element,
          nestedParent,
        )
        return elementProxy
      }
      return element
    }

    // Wrap the callback to pass proxied elements
    const wrappedCallback = function (
      this: unknown,
      element: unknown,
      index: number,
      array: unknown,
    ) {
      const proxiedElement = getProxiedElement(element, index)
      return callback.call(this, proxiedElement, index, array)
    }

    // For reduce/reduceRight, the callback signature is different
    if (methodName === `reduce` || methodName === `reduceRight`) {
      const reduceCallback = function (
        this: unknown,
        accumulator: unknown,
        element: unknown,
        index: number,
        array: unknown,
      ) {
        const proxiedElement = getProxiedElement(element, index)
        return callback.call(this, accumulator, proxiedElement, index, array)
      }
      return methodFn.apply(changeTracker.copy_, [
        reduceCallback,
        ...args.slice(1),
      ])
    }

    const result = methodFn.apply(changeTracker.copy_, [
      wrappedCallback,
      ...args.slice(1),
    ])

    // For find/findLast, proxy the returned element if it's an object
    if (
      (methodName === `find` || methodName === `findLast`) &&
      result &&
      typeof result === `object`
    ) {
      const foundIndex = (
        changeTracker.copy_ as unknown as Array<unknown>
      ).indexOf(result)
      if (foundIndex !== -1) {
        return getProxiedElement(result, foundIndex)
      }
    }

    // For filter, proxy each element in the result array
    if (methodName === `filter` && Array.isArray(result)) {
      return result.map((element) => {
        const originalIndex = (
          changeTracker.copy_ as unknown as Array<unknown>
        ).indexOf(element)
        if (originalIndex !== -1) {
          return getProxiedElement(element, originalIndex)
        }
        return element
      })
    }

    return result
  }
}

/**
 * Creates a Symbol.iterator handler for arrays that yields proxied elements.
 */
function createArrayIteratorHandler<T extends object>(
  changeTracker: ChangeTracker<T>,
  memoizedCreateChangeProxy: (
    obj: Record<string | symbol, unknown>,
    parent?: {
      tracker: ChangeTracker<Record<string | symbol, unknown>>
      prop: string | symbol
    },
  ) => { proxy: Record<string | symbol, unknown> },
): () => Iterator<unknown> {
  return function () {
    const array = changeTracker.copy_ as unknown as Array<unknown>
    let index = 0

    return {
      next() {
        if (index >= array.length) {
          return { done: true, value: undefined }
        }

        const element = array[index]
        let proxiedElement = element

        if (isProxiableObject(element)) {
          const nestedParent = {
            tracker: changeTracker as unknown as ChangeTracker<
              Record<string | symbol, unknown>
            >,
            prop: String(index),
          }
          const { proxy: elementProxy } = memoizedCreateChangeProxy(
            element,
            nestedParent,
          )
          proxiedElement = elementProxy
        }

        index++
        return { done: false, value: proxiedElement }
      },
      [Symbol.iterator]() {
        return this
      },
    }
  }
}

/**
 * Creates a wrapper for methods that modify a collection (array, Map, Set).
 * The wrapper calls the method and marks the change tracker as modified.
 */
function createModifyingMethodHandler<T extends object>(
  methodFn: (...args: Array<unknown>) => unknown,
  changeTracker: ChangeTracker<T>,
  markChanged: (tracker: ChangeTracker<T>) => void,
): (...args: Array<unknown>) => unknown {
  return function (...args: Array<unknown>) {
    const result = methodFn.apply(changeTracker.copy_, args)
    markChanged(changeTracker)
    return result
  }
}

/**
 * Creates handlers for Map/Set iterator methods (entries, keys, values, forEach).
 * Returns proxied values for iteration to enable change tracking.
 */
function createMapSetIteratorHandler<T extends object>(
  methodName: string,
  prop: string | symbol,
  methodFn: (...args: Array<unknown>) => unknown,
  target: Map<unknown, unknown> | Set<unknown>,
  changeTracker: ChangeTracker<T>,
  memoizedCreateChangeProxy: (
    obj: Record<string | symbol, unknown>,
    parent?: {
      tracker: ChangeTracker<Record<string | symbol, unknown>>
      prop: string | symbol
    },
  ) => { proxy: Record<string | symbol, unknown> },
  markChanged: (tracker: ChangeTracker<T>) => void,
): ((...args: Array<unknown>) => unknown) | undefined {
  const isIteratorMethod =
    MAP_SET_ITERATOR_METHODS.has(methodName) || prop === Symbol.iterator

  if (!isIteratorMethod) {
    return undefined
  }

  return function (this: unknown, ...args: Array<unknown>) {
    const result = methodFn.apply(changeTracker.copy_, args)

    // For forEach, wrap the callback to track changes
    if (methodName === `forEach`) {
      const callback = args[0]
      if (typeof callback === `function`) {
        const wrappedCallback = function (
          this: unknown,
          value: unknown,
          key: unknown,
          collection: unknown,
        ) {
          const cbresult = callback.call(this, value, key, collection)
          markChanged(changeTracker)
          return cbresult
        }
        return methodFn.apply(target, [wrappedCallback, ...args.slice(1)])
      }
    }

    // For iterators (entries, keys, values, Symbol.iterator)
    const isValueIterator =
      methodName === `entries` ||
      methodName === `values` ||
      methodName === Symbol.iterator.toString() ||
      prop === Symbol.iterator

    if (isValueIterator) {
      const originalIterator = result as Iterator<unknown>

      // For values() iterator on Maps, create a value-to-key mapping
      const valueToKeyMap = new Map()
      if (methodName === `values` && target instanceof Map) {
        for (const [key, mapValue] of (
          changeTracker.copy_ as unknown as Map<unknown, unknown>
        ).entries()) {
          valueToKeyMap.set(mapValue, key)
        }
      }

      // For Set iterators, create an original-to-modified mapping
      const originalToModifiedMap = new Map()
      if (target instanceof Set) {
        for (const setValue of (
          changeTracker.copy_ as unknown as Set<unknown>
        ).values()) {
          originalToModifiedMap.set(setValue, setValue)
        }
      }

      // Return a wrapped iterator that proxies values
      return {
        next() {
          const nextResult = originalIterator.next()

          if (
            !nextResult.done &&
            nextResult.value &&
            typeof nextResult.value === `object`
          ) {
            // For entries, the value is a [key, value] pair
            if (
              methodName === `entries` &&
              Array.isArray(nextResult.value) &&
              nextResult.value.length === 2
            ) {
              if (
                nextResult.value[1] &&
                typeof nextResult.value[1] === `object`
              ) {
                const mapKey = nextResult.value[0]
                const mapParent = {
                  tracker: changeTracker as unknown as ChangeTracker<
                    Record<string | symbol, unknown>
                  >,
                  prop: mapKey as string | symbol,
                  updateMap: (newValue: unknown) => {
                    if (changeTracker.copy_ instanceof Map) {
                      ;(changeTracker.copy_ as Map<unknown, unknown>).set(
                        mapKey,
                        newValue,
                      )
                    }
                  },
                }
                const { proxy: valueProxy } = memoizedCreateChangeProxy(
                  nextResult.value[1] as Record<string | symbol, unknown>,
                  mapParent as unknown as {
                    tracker: ChangeTracker<Record<string | symbol, unknown>>
                    prop: string | symbol
                  },
                )
                nextResult.value[1] = valueProxy
              }
            } else if (
              methodName === `values` ||
              methodName === Symbol.iterator.toString() ||
              prop === Symbol.iterator
            ) {
              // For Map values(), use the key mapping
              if (methodName === `values` && target instanceof Map) {
                const mapKey = valueToKeyMap.get(nextResult.value)
                if (mapKey !== undefined) {
                  const mapParent = {
                    tracker: changeTracker as unknown as ChangeTracker<
                      Record<string | symbol, unknown>
                    >,
                    prop: mapKey as string | symbol,
                    updateMap: (newValue: unknown) => {
                      if (changeTracker.copy_ instanceof Map) {
                        ;(changeTracker.copy_ as Map<unknown, unknown>).set(
                          mapKey,
                          newValue,
                        )
                      }
                    },
                  }
                  const { proxy: valueProxy } = memoizedCreateChangeProxy(
                    nextResult.value as Record<string | symbol, unknown>,
                    mapParent as unknown as {
                      tracker: ChangeTracker<Record<string | symbol, unknown>>
                      prop: string | symbol
                    },
                  )
                  nextResult.value = valueProxy
                }
              } else if (target instanceof Set) {
                // For Set, track modifications
                const setOriginalValue = nextResult.value
                const setParent = {
                  tracker: changeTracker as unknown as ChangeTracker<
                    Record<string | symbol, unknown>
                  >,
                  prop: setOriginalValue as unknown as string | symbol,
                  updateSet: (newValue: unknown) => {
                    if (changeTracker.copy_ instanceof Set) {
                      ;(changeTracker.copy_ as Set<unknown>).delete(
                        setOriginalValue,
                      )
                      ;(changeTracker.copy_ as Set<unknown>).add(newValue)
                      originalToModifiedMap.set(setOriginalValue, newValue)
                    }
                  },
                }
                const { proxy: valueProxy } = memoizedCreateChangeProxy(
                  nextResult.value as Record<string | symbol, unknown>,
                  setParent as unknown as {
                    tracker: ChangeTracker<Record<string | symbol, unknown>>
                    prop: string | symbol
                  },
                )
                nextResult.value = valueProxy
              } else {
                // For other cases, use a symbol placeholder
                const tempKey = Symbol(`iterator-value`)
                const { proxy: valueProxy } = memoizedCreateChangeProxy(
                  nextResult.value as Record<string | symbol, unknown>,
                  {
                    tracker: changeTracker as unknown as ChangeTracker<
                      Record<string | symbol, unknown>
                    >,
                    prop: tempKey,
                  },
                )
                nextResult.value = valueProxy
              }
            }
          }

          return nextResult
        },
        [Symbol.iterator]() {
          return this
        },
      }
    }

    return result
  }
}

/**
 * Simple debug utility that only logs when debug mode is enabled
 * Set DEBUG to true in localStorage to enable debug logging
 */
function debugLog(...args: Array<unknown>): void {
  // Check if we're in a browser environment
  const isBrowser =
    typeof window !== `undefined` && typeof localStorage !== `undefined`

  // In browser, check localStorage for debug flag
  if (isBrowser && localStorage.getItem(`DEBUG`) === `true`) {
    console.log(`[proxy]`, ...args)
  }
  // In Node.js environment, check for environment variable (though this is primarily for browser)
  else if (
    // true
    !isBrowser &&
    typeof process !== `undefined` &&
    process.env.DEBUG === `true`
  ) {
    console.log(`[proxy]`, ...args)
  }
}

// Add TypedArray interface with proper type
interface TypedArray {
  length: number
  [index: number]: number
}

// Update type for ChangeTracker
interface ChangeTracker<T extends object> {
  originalObject: T
  modified: boolean
  copy_: T
  proxyCount: number
  assigned_: Record<string | symbol, boolean>
  parent?:
    | {
        tracker: ChangeTracker<Record<string | symbol, unknown>>
        prop: string | symbol
      }
    | {
        tracker: ChangeTracker<Record<string | symbol, unknown>>
        prop: string | symbol
        updateMap: (newValue: unknown) => void
      }
    | {
        tracker: ChangeTracker<Record<string | symbol, unknown>>
        prop: unknown
        updateSet: (newValue: unknown) => void
      }
  target: T
}

/**
 * Deep clones an object while preserving special types like Date and RegExp
 */

function deepClone<T extends unknown>(
  obj: T,
  visited = new WeakMap<object, unknown>(),
): T {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj
  }

  // Handle primitive types
  if (typeof obj !== `object`) {
    return obj
  }

  // If we've already cloned this object, return the cached clone
  if (visited.has(obj as object)) {
    return visited.get(obj as object) as T
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T
  }

  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags) as unknown as T
  }

  if (Array.isArray(obj)) {
    const arrayClone = [] as Array<unknown>
    visited.set(obj as object, arrayClone)
    obj.forEach((item, index) => {
      arrayClone[index] = deepClone(item, visited)
    })
    return arrayClone as unknown as T
  }

  // Handle TypedArrays
  if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
    // Get the constructor to create a new instance of the same type
    const TypedArrayConstructor = Object.getPrototypeOf(obj).constructor
    const clone = new TypedArrayConstructor(
      (obj as unknown as TypedArray).length,
    ) as unknown as TypedArray
    visited.set(obj as object, clone)

    // Copy the values
    for (let i = 0; i < (obj as unknown as TypedArray).length; i++) {
      clone[i] = (obj as unknown as TypedArray)[i]!
    }

    return clone as unknown as T
  }

  if (obj instanceof Map) {
    const clone = new Map() as Map<unknown, unknown>
    visited.set(obj as object, clone)
    obj.forEach((value, key) => {
      clone.set(key, deepClone(value, visited))
    })
    return clone as unknown as T
  }

  if (obj instanceof Set) {
    const clone = new Set()
    visited.set(obj as object, clone)
    obj.forEach((value) => {
      clone.add(deepClone(value, visited))
    })
    return clone as unknown as T
  }

  // Handle Temporal objects
  if (isTemporal(obj)) {
    // Temporal objects are immutable, so we can return them directly
    // This preserves all their internal state correctly
    return obj
  }

  const clone = {} as Record<string | symbol, unknown>
  visited.set(obj as object, clone)

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone(
        (obj as Record<string | symbol, unknown>)[key],
        visited,
      )
    }
  }

  const symbolProps = Object.getOwnPropertySymbols(obj)
  for (const sym of symbolProps) {
    clone[sym] = deepClone(
      (obj as Record<string | symbol, unknown>)[sym],
      visited,
    )
  }

  return clone as T
}

let count = 0
function getProxyCount() {
  count += 1
  return count
}

/**
 * Creates a proxy that tracks changes to the target object
 *
 * @param target The object to proxy
 * @param parent Optional parent information
 * @returns An object containing the proxy and a function to get the changes
 */
export function createChangeProxy<
  T extends Record<string | symbol, any | undefined>,
>(
  target: T,
  parent?: {
    tracker: ChangeTracker<Record<string | symbol, unknown>>
    prop: string | symbol
  },
): {
  proxy: T

  getChanges: () => Record<string | symbol, any>
} {
  const changeProxyCache = new Map<object, object>()

  function memoizedCreateChangeProxy<
    TInner extends Record<string | symbol, any | undefined>,
  >(
    innerTarget: TInner,
    innerParent?: {
      tracker: ChangeTracker<Record<string | symbol, unknown>>
      prop: string | symbol
    },
  ): {
    proxy: TInner
    getChanges: () => Record<string | symbol, any>
  } {
    debugLog(`Object ID:`, innerTarget.constructor.name)
    if (changeProxyCache.has(innerTarget)) {
      return changeProxyCache.get(innerTarget) as {
        proxy: TInner
        getChanges: () => Record<string | symbol, any>
      }
    } else {
      const changeProxy = createChangeProxy(innerTarget, innerParent)
      changeProxyCache.set(innerTarget, changeProxy)
      return changeProxy
    }
  }
  // Create a WeakMap to cache proxies for nested objects
  // This prevents creating multiple proxies for the same object
  // and handles circular references
  const proxyCache = new Map<object, object>()

  // Create a change tracker to track changes to the object
  const changeTracker: ChangeTracker<T> = {
    copy_: deepClone(target),
    originalObject: deepClone(target),
    proxyCount: getProxyCount(),
    modified: false,
    assigned_: {},
    parent,
    target, // Store reference to the target object
  }

  debugLog(
    `createChangeProxy called for target`,
    target,
    changeTracker.proxyCount,
  )
  // Mark this object and all its ancestors as modified
  // Also propagate the actual changes up the chain
  function markChanged(state: ChangeTracker<object>) {
    if (!state.modified) {
      state.modified = true
    }

    // Propagate the change up the parent chain
    if (state.parent) {
      debugLog(`propagating change to parent`)

      // Check if this is a special Map parent with updateMap function
      if (`updateMap` in state.parent) {
        // Use the special updateMap function for Maps
        state.parent.updateMap(state.copy_)
      } else if (`updateSet` in state.parent) {
        // Use the special updateSet function for Sets
        state.parent.updateSet(state.copy_)
      } else {
        // Update parent's copy with this object's current state
        state.parent.tracker.copy_[state.parent.prop] = state.copy_
        state.parent.tracker.assigned_[state.parent.prop] = true
      }

      // Mark parent as changed
      markChanged(state.parent.tracker)
    }
  }

  // Check if all properties in the current state have reverted to original values
  function checkIfReverted(
    state: ChangeTracker<Record<string | symbol, unknown>>,
  ): boolean {
    debugLog(
      `checkIfReverted called with assigned keys:`,
      Object.keys(state.assigned_),
    )

    // If there are no assigned properties, object is unchanged
    if (
      Object.keys(state.assigned_).length === 0 &&
      Object.getOwnPropertySymbols(state.assigned_).length === 0
    ) {
      debugLog(`No assigned properties, returning true`)
      return true
    }

    // Check each assigned regular property
    for (const prop in state.assigned_) {
      // If this property is marked as assigned
      if (state.assigned_[prop] === true) {
        const currentValue = state.copy_[prop]
        const originalValue = (state.originalObject as any)[prop]

        debugLog(
          `Checking property ${String(prop)}, current:`,
          currentValue,
          `original:`,
          originalValue,
        )

        // If the value is not equal to original, something is still changed
        if (!deepEquals(currentValue, originalValue)) {
          debugLog(`Property ${String(prop)} is different, returning false`)
          return false
        }
      } else if (state.assigned_[prop] === false) {
        // Property was deleted, so it's different from original
        debugLog(`Property ${String(prop)} was deleted, returning false`)
        return false
      }
    }

    // Check each assigned symbol property
    const symbolProps = Object.getOwnPropertySymbols(state.assigned_)
    for (const sym of symbolProps) {
      if (state.assigned_[sym] === true) {
        const currentValue = (state.copy_ as any)[sym]
        const originalValue = (state.originalObject as any)[sym]

        // If the value is not equal to original, something is still changed
        if (!deepEquals(currentValue, originalValue)) {
          debugLog(`Symbol property is different, returning false`)
          return false
        }
      } else if (state.assigned_[sym] === false) {
        // Property was deleted, so it's different from original
        debugLog(`Symbol property was deleted, returning false`)
        return false
      }
    }

    debugLog(`All properties match original values, returning true`)
    // All assigned properties match their original values
    return true
  }

  // Update parent status based on child changes
  function checkParentStatus(
    parentState: ChangeTracker<Record<string | symbol, unknown>>,
    childProp: string | symbol | unknown,
  ) {
    debugLog(`checkParentStatus called for child prop:`, childProp)

    // Check if all properties of the parent are reverted
    const isReverted = checkIfReverted(parentState)
    debugLog(`Parent checkIfReverted returned:`, isReverted)

    if (isReverted) {
      debugLog(`Parent is fully reverted, clearing tracking`)
      // If everything is reverted, clear the tracking
      parentState.modified = false
      parentState.assigned_ = {}

      // Continue up the chain
      if (parentState.parent) {
        debugLog(`Continuing up the parent chain`)
        checkParentStatus(parentState.parent.tracker, parentState.parent.prop)
      }
    }
  }

  // Create a proxy for the target object
  function createObjectProxy<TObj extends object>(obj: TObj): TObj {
    debugLog(`createObjectProxy`, obj)
    // If we've already created a proxy for this object, return it
    if (proxyCache.has(obj)) {
      debugLog(`proxyCache found match`)
      return proxyCache.get(obj) as TObj
    }

    // Create a proxy for the object
    const proxy = new Proxy(obj, {
      get(ptarget, prop) {
        debugLog(`get`, ptarget, prop)
        const value =
          changeTracker.copy_[prop as keyof T] ??
          changeTracker.originalObject[prop as keyof T]

        const originalValue = changeTracker.originalObject[prop as keyof T]

        debugLog(`value (at top of proxy get)`, value)

        // If it's a getter, return the value directly
        const desc = Object.getOwnPropertyDescriptor(ptarget, prop)
        if (desc?.get) {
          return value
        }

        // If the value is a function, bind it to the ptarget
        if (typeof value === `function`) {
          // For Array methods that modify the array
          if (Array.isArray(ptarget)) {
            const methodName = prop.toString()

            if (ARRAY_MODIFYING_METHODS.has(methodName)) {
              return createModifyingMethodHandler(
                value,
                changeTracker,
                markChanged,
              )
            }

            // Handle array iteration methods (find, filter, forEach, etc.)
            const iterationHandler = createArrayIterationHandler(
              methodName,
              value,
              changeTracker,
              memoizedCreateChangeProxy,
            )
            if (iterationHandler) {
              return iterationHandler
            }

            // Handle array Symbol.iterator for for...of loops
            if (prop === Symbol.iterator) {
              return createArrayIteratorHandler(
                changeTracker,
                memoizedCreateChangeProxy,
              )
            }
          }

          // For Map and Set methods that modify the collection
          if (ptarget instanceof Map || ptarget instanceof Set) {
            const methodName = prop.toString()

            if (MAP_SET_MODIFYING_METHODS.has(methodName)) {
              return createModifyingMethodHandler(
                value,
                changeTracker,
                markChanged,
              )
            }

            // Handle iterator methods for Map and Set
            const iteratorHandler = createMapSetIteratorHandler(
              methodName,
              prop,
              value,
              ptarget,
              changeTracker,
              memoizedCreateChangeProxy,
              markChanged,
            )
            if (iteratorHandler) {
              return iteratorHandler
            }
          }
          return value.bind(ptarget)
        }

        // If the value is an object (but not Date, RegExp, or Temporal), create a proxy for it
        if (isProxiableObject(value)) {
          // Create a parent reference for the nested object
          const nestedParent = {
            tracker: changeTracker,
            prop: String(prop),
          }

          // Create a proxy for the nested object
          const { proxy: nestedProxy } = memoizedCreateChangeProxy(
            originalValue,
            nestedParent,
          )

          // Cache the proxy
          proxyCache.set(value, nestedProxy)

          return nestedProxy
        }

        return value
      },

      set(_sobj, prop, value) {
        const currentValue = changeTracker.copy_[prop as keyof T]
        debugLog(
          `set called for property ${String(prop)}, current:`,
          currentValue,
          `new:`,
          value,
        )

        // Only track the change if the value is actually different
        if (!deepEquals(currentValue, value)) {
          // Check if the new value is equal to the original value
          // Important: Use the originalObject to get the true original value
          const originalValue = changeTracker.originalObject[prop as keyof T]
          const isRevertToOriginal = deepEquals(value, originalValue)
          debugLog(
            `value:`,
            value,
            `original:`,
            originalValue,
            `isRevertToOriginal:`,
            isRevertToOriginal,
          )

          if (isRevertToOriginal) {
            debugLog(`Reverting property ${String(prop)} to original value`)
            // If the value is reverted to its original state, remove it from changes
            delete changeTracker.assigned_[prop.toString()]

            // Make sure the copy is updated with the original value
            debugLog(`Updating copy with original value for ${String(prop)}`)
            changeTracker.copy_[prop as keyof T] = deepClone(originalValue)

            // Check if all properties in this object have been reverted
            debugLog(`Checking if all properties reverted`)
            const allReverted = checkIfReverted(changeTracker)
            debugLog(`All reverted:`, allReverted)

            if (allReverted) {
              debugLog(`All properties reverted, clearing tracking`)
              // If all have been reverted, clear tracking
              changeTracker.modified = false
              changeTracker.assigned_ = {}

              // If we're a nested object, check if the parent needs updating
              if (parent) {
                debugLog(`Updating parent for property:`, parent.prop)
                checkParentStatus(parent.tracker, parent.prop)
              }
            } else {
              // Some properties are still changed
              debugLog(`Some properties still changed, keeping modified flag`)
              changeTracker.modified = true
            }
          } else {
            debugLog(`Setting new value for property ${String(prop)}`)

            // Set the value on the copy
            changeTracker.copy_[prop as keyof T] = value

            // Track that this property was assigned - store using the actual property (symbol or string)
            changeTracker.assigned_[prop.toString()] = true

            // Mark this object and its ancestors as modified
            debugLog(`Marking object and ancestors as modified`, changeTracker)
            markChanged(changeTracker)
          }
        } else {
          debugLog(`Value unchanged, not tracking`)
        }

        return true
      },

      defineProperty(ptarget, prop, descriptor) {
        // Forward the defineProperty to the target to maintain Proxy invariants
        // This allows Object.seal() and Object.freeze() to work on the proxy
        const result = Reflect.defineProperty(ptarget, prop, descriptor)
        if (result && `value` in descriptor) {
          changeTracker.copy_[prop as keyof T] = deepClone(descriptor.value)
          changeTracker.assigned_[prop.toString()] = true
          markChanged(changeTracker)
        }
        return result
      },

      getOwnPropertyDescriptor(ptarget, prop) {
        // Forward to target to maintain Proxy invariants for seal/freeze
        return Reflect.getOwnPropertyDescriptor(ptarget, prop)
      },

      preventExtensions(ptarget) {
        // Forward to target to allow Object.seal() and Object.preventExtensions()
        return Reflect.preventExtensions(ptarget)
      },

      isExtensible(ptarget) {
        // Forward to target to maintain consistency
        return Reflect.isExtensible(ptarget)
      },

      deleteProperty(dobj, prop) {
        debugLog(`deleteProperty`, dobj, prop)
        const stringProp = typeof prop === `symbol` ? prop.toString() : prop

        if (stringProp in dobj) {
          // Check if the property exists in the original object
          const hadPropertyInOriginal =
            stringProp in changeTracker.originalObject

          // Forward the delete to the target using Reflect
          // This respects Object.seal/preventExtensions constraints
          const result = Reflect.deleteProperty(dobj, prop)

          if (result) {
            // If the property didn't exist in the original object, removing it
            // should revert to the original state
            if (!hadPropertyInOriginal) {
              delete changeTracker.assigned_[stringProp]

              // If this is the last change and we're not a nested object,
              // mark the object as unmodified
              if (
                Object.keys(changeTracker.assigned_).length === 0 &&
                Object.getOwnPropertySymbols(changeTracker.assigned_).length ===
                  0
              ) {
                changeTracker.modified = false
              } else {
                // We still have changes, keep as modified
                changeTracker.modified = true
              }
            } else {
              // Mark this property as deleted
              changeTracker.assigned_[stringProp] = false
              markChanged(changeTracker)
            }
          }

          return result
        }

        return true
      },
    })

    // Cache the proxy
    proxyCache.set(obj, proxy)

    return proxy
  }

  // Create a proxy for the target object
  // Use the unfrozen copy_ as the proxy target to avoid Proxy invariant violations
  // when the original target is frozen (e.g., from Immer)
  const proxy = createObjectProxy(changeTracker.copy_ as unknown as T)

  // Return the proxy and a function to get the changes
  return {
    proxy,
    getChanges: () => {
      debugLog(`getChanges called, modified:`, changeTracker.modified)
      debugLog(changeTracker)

      // First, check if the object is still considered modified
      if (!changeTracker.modified) {
        debugLog(`Object not modified, returning empty object`)
        return {}
      }

      // If we have a copy, return it directly
      // Check if valueObj is actually an object
      if (
        typeof changeTracker.copy_ !== `object` ||
        Array.isArray(changeTracker.copy_)
      ) {
        return changeTracker.copy_
      }

      if (Object.keys(changeTracker.assigned_).length === 0) {
        return changeTracker.copy_
      }

      const result: Record<string, any | undefined> = {}

      // Iterate through keys in keyObj
      for (const key in changeTracker.copy_) {
        // If the key's value is true and the key exists in valueObj
        if (
          changeTracker.assigned_[key] === true &&
          key in changeTracker.copy_
        ) {
          result[key] = changeTracker.copy_[key]
        }
      }
      debugLog(`Returning copy:`, result)
      return result as unknown as Record<string | symbol, unknown>
    },
  }
}

/**
 * Creates proxies for an array of objects and tracks changes to each
 *
 * @param targets Array of objects to proxy
 * @returns An object containing the array of proxies and a function to get all changes
 */
export function createArrayChangeProxy<T extends object>(
  targets: Array<T>,
): {
  proxies: Array<T>
  getChanges: () => Array<Record<string | symbol, unknown>>
} {
  const proxiesWithChanges = targets.map((target) => createChangeProxy(target))

  return {
    proxies: proxiesWithChanges.map((p) => p.proxy),
    getChanges: () => proxiesWithChanges.map((p) => p.getChanges()),
  }
}

/**
 * Creates a proxy for an object, passes it to a callback function,
 * and returns the changes made by the callback
 *
 * @param target The object to proxy
 * @param callback Function that receives the proxy and can make changes to it
 * @returns The changes made to the object
 */
export function withChangeTracking<T extends object>(
  target: T,
  callback: (proxy: T) => void,
): Record<string | symbol, unknown> {
  const { proxy, getChanges } = createChangeProxy(target)

  callback(proxy)

  return getChanges()
}

/**
 * Creates proxies for an array of objects, passes them to a callback function,
 * and returns the changes made by the callback for each object
 *
 * @param targets Array of objects to proxy
 * @param callback Function that receives the proxies and can make changes to them
 * @returns Array of changes made to each object
 */
export function withArrayChangeTracking<T extends object>(
  targets: Array<T>,
  callback: (proxies: Array<T>) => void,
): Array<Record<string | symbol, unknown>> {
  const { proxies, getChanges } = createArrayChangeProxy(targets)

  callback(proxies)

  return getChanges()
}
