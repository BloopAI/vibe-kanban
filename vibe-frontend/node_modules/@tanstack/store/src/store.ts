import { __flush } from './scheduler'
import { isUpdaterFunction } from './types'
import type { AnyUpdater, Listener, Updater } from './types'

export interface StoreOptions<
  TState,
  TUpdater extends AnyUpdater = (cb: TState) => TState,
> {
  /**
   * Replace the default update function with a custom one.
   */
  updateFn?: (previous: TState) => (updater: TUpdater) => TState
  /**
   * Called when a listener subscribes to the store.
   *
   * @return a function to unsubscribe the listener
   */
  onSubscribe?: (
    listener: Listener<TState>,
    store: Store<TState, TUpdater>,
  ) => () => void
  /**
   * Called after the state has been updated, used to derive other state.
   */
  onUpdate?: () => void
}

export class Store<
  TState,
  TUpdater extends AnyUpdater = (cb: TState) => TState,
> {
  listeners = new Set<Listener<TState>>()
  state: TState
  prevState: TState
  options?: StoreOptions<TState, TUpdater>

  constructor(initialState: TState, options?: StoreOptions<TState, TUpdater>) {
    this.prevState = initialState
    this.state = initialState
    this.options = options
  }

  subscribe = (listener: Listener<TState>) => {
    this.listeners.add(listener)
    const unsub = this.options?.onSubscribe?.(listener, this)
    return () => {
      this.listeners.delete(listener)
      unsub?.()
    }
  }

  /**
   * Update the store state safely with improved type checking
   */
  setState(updater: (prevState: TState) => TState): void
  setState(updater: TState): void
  setState(updater: TUpdater): void
  setState(updater: Updater<TState> | TUpdater): void {
    this.prevState = this.state

    if (this.options?.updateFn) {
      this.state = this.options.updateFn(this.prevState)(updater as TUpdater)
    } else {
      if (isUpdaterFunction(updater)) {
        this.state = updater(this.prevState)
      } else {
        this.state = updater as TState
      }
    }

    // Always run onUpdate, regardless of batching
    this.options?.onUpdate?.()

    // Attempt to flush
    __flush(this as never)
  }
}
