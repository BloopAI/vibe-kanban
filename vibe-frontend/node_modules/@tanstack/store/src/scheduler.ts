import type { Derived } from './derived'
import type { Store } from './store'

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
export const __storeToDerived = new WeakMap<
  Store<unknown>,
  Array<Derived<unknown>>
>()
export const __derivedToStore = new WeakMap<
  Derived<unknown>,
  Set<Store<unknown>>
>()

export const __depsThatHaveWrittenThisTick = {
  current: [] as Array<Derived<unknown> | Store<unknown>>,
}

let __isFlushing = false
let __batchDepth = 0
const __pendingUpdates = new Set<Store<unknown>>()
// Add a map to store initial values before batch
const __initialBatchValues = new Map<Store<unknown>, unknown>()

function __flush_internals(relatedVals: ReadonlyArray<Derived<unknown>>) {
  for (const derived of relatedVals) {
    if (__depsThatHaveWrittenThisTick.current.includes(derived)) {
      continue
    }

    __depsThatHaveWrittenThisTick.current.push(derived)
    derived.recompute()

    const stores = __derivedToStore.get(derived)
    if (stores) {
      for (const store of stores) {
        const relatedLinkedDerivedVals = __storeToDerived.get(store)
        if (!relatedLinkedDerivedVals?.length) continue
        __flush_internals(relatedLinkedDerivedVals)
      }
    }
  }
}

function __notifyListeners(store: Store<unknown>) {
  const value = {
    prevVal: store.prevState as never,
    currentVal: store.state as never,
  }
  for (const listener of store.listeners) {
    listener(value)
  }
}

function __notifyDerivedListeners(derived: Derived<unknown>) {
  const value = {
    prevVal: derived.prevState as never,
    currentVal: derived.state as never,
  }
  for (const listener of derived.listeners) {
    listener(value)
  }
}

/**
 * @private only to be called from `Store` on write
 */
export function __flush(store: Store<unknown>) {
  // If we're starting a batch, store the initial values
  if (__batchDepth > 0 && !__initialBatchValues.has(store)) {
    __initialBatchValues.set(store, store.prevState)
  }

  __pendingUpdates.add(store)

  if (__batchDepth > 0) return
  if (__isFlushing) return

  try {
    __isFlushing = true

    while (__pendingUpdates.size > 0) {
      const stores = Array.from(__pendingUpdates)
      __pendingUpdates.clear()

      // First notify listeners with updated values
      for (const store of stores) {
        // Use initial batch values for prevState if we have them
        const prevState = __initialBatchValues.get(store) ?? store.prevState
        store.prevState = prevState
        __notifyListeners(store)
      }

      // Then update all derived values
      for (const store of stores) {
        const derivedVals = __storeToDerived.get(store)
        if (!derivedVals) continue

        __depsThatHaveWrittenThisTick.current.push(store)
        __flush_internals(derivedVals)
      }

      // Notify derived listeners after recomputing
      for (const store of stores) {
        const derivedVals = __storeToDerived.get(store)
        if (!derivedVals) continue

        for (const derived of derivedVals) {
          __notifyDerivedListeners(derived)
        }
      }
    }
  } finally {
    __isFlushing = false
    __depsThatHaveWrittenThisTick.current = []
    __initialBatchValues.clear()
  }
}

export function batch(fn: () => void) {
  __batchDepth++
  try {
    fn()
  } finally {
    __batchDepth--
    if (__batchDepth === 0) {
      const pendingUpdateToFlush = __pendingUpdates.values().next().value
      if (pendingUpdateToFlush) {
        __flush(pendingUpdateToFlush) // Trigger flush of all pending updates
      }
    }
  }
}
