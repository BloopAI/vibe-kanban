/**
 * # Direct Join Algorithms for Incremental View Maintenance
 *
 * High-performance join operations implementing all join types (inner, left, right, full, anti)
 * with minimal state and optimized performance.
 *
 * ## Algorithm
 *
 * For each tick, the algorithm processes incoming changes (deltas) and emits join results:
 *
 * 1. **Build deltas**: Create delta indexes from input messages using `Index.fromMultiSet()`
 * 2. **Inner results**: Emit `ΔA⋈B_old + A_old⋈ΔB + ΔA⋈ΔB` (matched pairs)
 * 3. **Outer results**: For unmatched rows, emit null-extended tuples:
 *    - New unmatched rows from deltas (when opposite side empty)
 *    - Presence transitions: when key goes `0→>0` (retract nulls) or `>0→0` (emit nulls)
 * 4. **Update state**: Append deltas to indexes (consolidated multiplicity tracking automatic)
 *
 * **Consolidated multiplicity tracking** enables O(1) presence checks instead of scanning index buckets.
 *
 * ## State
 *
 * **Indexes** store the actual data:
 * - `indexA: Index<K, V1>` - all left-side rows accumulated over time
 * - `indexB: Index<K, V2>` - all right-side rows accumulated over time
 *
 * **Consolidated multiplicity tracking** (built into Index):
 * - Each Index maintains sum of multiplicities per key internally
 * - Provides O(1) presence checks: `index.hasPresence(key)` and `index.getConsolidatedMultiplicity(key)`
 * - Avoids scanning entire index buckets just to check if key has any rows
 *
 * ## Join Types
 *
 * - **Inner**: Standard delta terms only
 * - **Outer**: Inner results + null-extended unmatched rows with transition handling
 * - **Anti**: Unmatched rows only (no inner results)
 *
 * ## Key Optimizations
 *
 * - **No temp copying**: Uses `(A⊎ΔA)⋈ΔB = A⋈ΔB ⊎ ΔA⋈ΔB` distributive property
 * - **Early-out checks**: Skip phases when no deltas present
 * - **Zero-entry pruning**: Keep maps compact, O(distinct keys) memory
 * - **Final presence logic**: Avoid emit→retract churn within same tick
 *
 * ## Correctness
 *
 * - **Ordering**: Pre-append snapshots for emissions, post-emit state updates
 * - **Presence**: Key matched iff mass ≠ 0, transitions trigger null handling
 * - **Bag semantics**: Proper multiplicity handling including negatives
 */

import { BinaryOperator, DifferenceStreamWriter } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import { MultiSet } from '../multiset.js'
import { Index } from '../indexes.js'
import type { DifferenceStreamReader } from '../graph.js'
import type { IStreamBuilder, KeyValue, PipedOperator } from '../types.js'

/**
 * Type of join to perform
 */
export type JoinType = `inner` | `left` | `right` | `full` | `anti`

/**
 * Operator that joins two input streams using direct join algorithms
 */
export class JoinOperator<K, V1, V2> extends BinaryOperator<
  [K, V1] | [K, V2] | [K, [V1, V2]] | [K, [V1 | null, V2 | null]]
> {
  #indexA = new Index<K, V1>()
  #indexB = new Index<K, V2>()
  #mode: JoinType

  constructor(
    id: number,
    inputA: DifferenceStreamReader<[K, V1]>,
    inputB: DifferenceStreamReader<[K, V2]>,
    output: DifferenceStreamWriter<any>,
    mode: JoinType = `inner`,
  ) {
    super(id, inputA, inputB, output)
    this.#mode = mode
  }

  run(): void {
    // Build deltas from input messages
    const deltaA = Index.fromMultiSets<K, V1>(
      this.inputAMessages() as Array<MultiSet<[K, V1]>>,
    )
    const deltaB = Index.fromMultiSets<K, V2>(
      this.inputBMessages() as Array<MultiSet<[K, V2]>>,
    )

    // Early-out if nothing changed
    if (deltaA.size === 0 && deltaB.size === 0) return

    const results = new MultiSet<any>()

    // Emit inner results (all modes except anti)
    if (this.#mode !== `anti`) {
      this.emitInnerResults(deltaA, deltaB, results)
    }

    // Emit left outer/anti results
    if (
      this.#mode === `left` ||
      this.#mode === `full` ||
      this.#mode === `anti`
    ) {
      this.emitLeftOuterResults(deltaA, deltaB, results)
    }

    // Emit right outer results
    if (this.#mode === `right` || this.#mode === `full`) {
      this.emitRightOuterResults(deltaA, deltaB, results)
    }

    // Update state and send results
    // IMPORTANT: All emissions use pre-append snapshots of indexA/indexB.
    // Now append ALL deltas to indices - this happens unconditionally for every key,
    // regardless of whether presence flipped. Consolidated multiplicity tracking is automatic.
    this.#indexA.append(deltaA)
    this.#indexB.append(deltaB)

    // Send results
    if (results.getInner().length > 0) {
      this.output.sendData(results)
    }
  }

  private emitInnerResults(
    deltaA: Index<K, V1>,
    deltaB: Index<K, V2>,
    results: MultiSet<any>,
  ): void {
    // Emit the three standard delta terms: ΔA⋈B_old, A_old⋈ΔB, ΔA⋈ΔB
    if (deltaA.size > 0) results.extend(deltaA.join(this.#indexB))
    if (deltaB.size > 0) results.extend(this.#indexA.join(deltaB))
    if (deltaA.size > 0 && deltaB.size > 0) results.extend(deltaA.join(deltaB))
  }

  private emitLeftOuterResults(
    deltaA: Index<K, V1>,
    deltaB: Index<K, V2>,
    results: MultiSet<any>,
  ): void {
    // Emit unmatched left rows from deltaA
    if (deltaA.size > 0) {
      for (const [key, valueIterator] of deltaA.entriesIterators()) {
        const currentMultiplicityB =
          this.#indexB.getConsolidatedMultiplicity(key)
        const deltaMultiplicityB = deltaB.getConsolidatedMultiplicity(key)
        const finalMultiplicityB = currentMultiplicityB + deltaMultiplicityB

        if (finalMultiplicityB === 0) {
          for (const [value, multiplicity] of valueIterator) {
            if (multiplicity !== 0) {
              results.add([key, [value, null]], multiplicity)
            }
          }
        }
      }
    }

    // Handle presence transitions from right side changes
    if (deltaB.size > 0) {
      for (const key of deltaB.getPresenceKeys()) {
        const before = this.#indexB.getConsolidatedMultiplicity(key)
        const deltaMult = deltaB.getConsolidatedMultiplicity(key)
        if (deltaMult === 0) continue
        const after = before + deltaMult

        // Skip transition handling if presence doesn't flip (both zero or both non-zero)
        // Note: Index updates happen later regardless - we're only skipping null-extension emissions here
        if ((before === 0) === (after === 0)) continue

        // Determine the type of transition:
        // - 0 → non-zero: Right becomes non-empty, left rows transition from unmatched to matched
        //   → RETRACT previously emitted null-extended rows (emit with negative multiplicity)
        // - non-zero → 0: Right becomes empty, left rows transition from matched to unmatched
        //   → EMIT new null-extended rows (emit with positive multiplicity)
        const transitioningToMatched = before === 0

        for (const [value, multiplicity] of this.#indexA.getIterator(key)) {
          if (multiplicity !== 0) {
            results.add(
              [key, [value, null]],
              transitioningToMatched ? -multiplicity : +multiplicity,
            )
          }
        }
      }
    }
  }

  private emitRightOuterResults(
    deltaA: Index<K, V1>,
    deltaB: Index<K, V2>,
    results: MultiSet<any>,
  ): void {
    // Emit unmatched right rows from deltaB
    if (deltaB.size > 0) {
      for (const [key, valueIterator] of deltaB.entriesIterators()) {
        const currentMultiplicityA =
          this.#indexA.getConsolidatedMultiplicity(key)
        const deltaMultiplicityA = deltaA.getConsolidatedMultiplicity(key)
        const finalMultiplicityA = currentMultiplicityA + deltaMultiplicityA

        if (finalMultiplicityA === 0) {
          for (const [value, multiplicity] of valueIterator) {
            if (multiplicity !== 0) {
              results.add([key, [null, value]], multiplicity)
            }
          }
        }
      }
    }

    // Handle presence transitions from left side changes
    if (deltaA.size > 0) {
      for (const key of deltaA.getPresenceKeys()) {
        const before = this.#indexA.getConsolidatedMultiplicity(key)
        const deltaMult = deltaA.getConsolidatedMultiplicity(key)
        if (deltaMult === 0) continue
        const after = before + deltaMult

        // Skip transition handling if presence doesn't flip (both zero or both non-zero)
        // Note: Index updates happen later regardless - we're only skipping null-extension emissions here
        if ((before === 0) === (after === 0)) continue

        // Determine the type of transition:
        // - 0 → non-zero: Left becomes non-empty, right rows transition from unmatched to matched
        //   → RETRACT previously emitted null-extended rows (emit with negative multiplicity)
        // - non-zero → 0: Left becomes empty, right rows transition from matched to unmatched
        //   → EMIT new null-extended rows (emit with positive multiplicity)
        const transitioningToMatched = before === 0

        for (const [value, multiplicity] of this.#indexB.getIterator(key)) {
          if (multiplicity !== 0) {
            results.add(
              [key, [null, value]],
              transitioningToMatched ? -multiplicity : +multiplicity,
            )
          }
        }
      }
    }
  }
}

/**
 * Joins two input streams
 * @param other - The other stream to join with
 * @param type - The type of join to perform
 */
export function join<
  K,
  V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never,
  V2,
  T,
>(
  other: IStreamBuilder<KeyValue<K, V2>>,
  type: JoinType = `inner`,
): PipedOperator<T, KeyValue<K, [V1 | null, V2 | null]>> {
  return (
    stream: IStreamBuilder<T>,
  ): IStreamBuilder<KeyValue<K, [V1 | null, V2 | null]>> => {
    if (stream.graph !== other.graph) {
      throw new Error(`Cannot join streams from different graphs`)
    }
    const output = new StreamBuilder<KeyValue<K, [V1 | null, V2 | null]>>(
      stream.graph,
      new DifferenceStreamWriter<KeyValue<K, [V1 | null, V2 | null]>>(),
    )
    const operator = new JoinOperator<K, V1, V2>(
      stream.graph.getNextOperatorId(),
      stream.connectReader() as DifferenceStreamReader<KeyValue<K, V1>>,
      other.connectReader(),
      output.writer,
      type,
    )
    stream.graph.addOperator(operator)
    return output
  }
}

/**
 * Joins two input streams (inner join)
 * @param other - The other stream to join with
 */
export function innerJoin<
  K,
  V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never,
  V2,
  T,
>(
  other: IStreamBuilder<KeyValue<K, V2>>,
): PipedOperator<T, KeyValue<K, [V1, V2]>> {
  return join(other, `inner`) as unknown as PipedOperator<
    T,
    KeyValue<K, [V1, V2]>
  >
}

/**
 * Joins two input streams (anti join)
 * @param other - The other stream to join with
 */
export function antiJoin<
  K,
  V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never,
  V2,
  T,
>(
  other: IStreamBuilder<KeyValue<K, V2>>,
): PipedOperator<T, KeyValue<K, [V1, null]>> {
  return join(other, `anti`) as unknown as PipedOperator<
    T,
    KeyValue<K, [V1, null]>
  >
}

/**
 * Joins two input streams (left join)
 * @param other - The other stream to join with
 */
export function leftJoin<
  K,
  V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never,
  V2,
  T,
>(
  other: IStreamBuilder<KeyValue<K, V2>>,
): PipedOperator<T, KeyValue<K, [V1, V2 | null]>> {
  return join(other, `left`) as unknown as PipedOperator<
    T,
    KeyValue<K, [V1, V2 | null]>
  >
}

/**
 * Joins two input streams (right join)
 * @param other - The other stream to join with
 */
export function rightJoin<
  K,
  V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never,
  V2,
  T,
>(
  other: IStreamBuilder<KeyValue<K, V2>>,
): PipedOperator<T, KeyValue<K, [V1 | null, V2]>> {
  return join(other, `right`) as unknown as PipedOperator<
    T,
    KeyValue<K, [V1 | null, V2]>
  >
}

/**
 * Joins two input streams (full join)
 * @param other - The other stream to join with
 */
export function fullJoin<
  K,
  V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never,
  V2,
  T,
>(
  other: IStreamBuilder<KeyValue<K, V2>>,
): PipedOperator<T, KeyValue<K, [V1 | null, V2 | null]>> {
  return join(other, `full`) as unknown as PipedOperator<
    T,
    KeyValue<K, [V1 | null, V2 | null]>
  >
}
