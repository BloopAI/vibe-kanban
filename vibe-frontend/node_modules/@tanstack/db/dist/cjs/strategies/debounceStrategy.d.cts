import { DebounceStrategy, DebounceStrategyOptions } from './types.cjs';
/**
 * Creates a debounce strategy that delays transaction execution until after
 * a period of inactivity.
 *
 * Ideal for scenarios like search inputs or auto-save fields where you want
 * to wait for the user to stop typing before persisting changes.
 *
 * @param options - Configuration for the debounce behavior
 * @returns A debounce strategy instance
 *
 * @example
 * ```ts
 * const mutate = usePacedMutations({
 *   onMutate: (value) => {
 *     collection.update(id, draft => { draft.value = value })
 *   },
 *   mutationFn: async ({ transaction }) => {
 *     await api.save(transaction.mutations)
 *   },
 *   strategy: debounceStrategy({ wait: 500 })
 * })
 * ```
 */
export declare function debounceStrategy(options: DebounceStrategyOptions): DebounceStrategy;
