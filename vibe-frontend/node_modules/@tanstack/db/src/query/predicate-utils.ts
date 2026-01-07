import { Func, Value } from './ir.js'
import type { BasicExpression, OrderBy, PropRef } from './ir.js'
import type { LoadSubsetOptions } from '../types.js'

/**
 * Check if one where clause is a logical subset of another.
 * Returns true if the subset predicate is more restrictive than (or equal to) the superset predicate.
 *
 * @example
 * // age > 20 is subset of age > 10 (more restrictive)
 * isWhereSubset(gt(ref('age'), val(20)), gt(ref('age'), val(10))) // true
 *
 * @example
 * // age > 10 AND name = 'X' is subset of age > 10 (more conditions)
 * isWhereSubset(and(gt(ref('age'), val(10)), eq(ref('name'), val('X'))), gt(ref('age'), val(10))) // true
 *
 * @param subset - The potentially more restrictive predicate
 * @param superset - The potentially less restrictive predicate
 * @returns true if subset logically implies superset
 */
export function isWhereSubset(
  subset: BasicExpression<boolean> | undefined,
  superset: BasicExpression<boolean> | undefined,
): boolean {
  // undefined/missing where clause means "no filter" (all data)
  // Both undefined means subset relationship holds (all data ⊆ all data)
  if (subset === undefined && superset === undefined) {
    return true
  }

  // If subset is undefined but superset is not, we're requesting ALL data
  // but have only loaded SOME data - subset relationship does NOT hold
  if (subset === undefined && superset !== undefined) {
    return false
  }

  // If superset is undefined (no filter = all data loaded),
  // then any constrained subset is contained
  if (superset === undefined && subset !== undefined) {
    return true
  }

  return isWhereSubsetInternal(subset!, superset!)
}

function makeDisjunction(
  preds: Array<BasicExpression<boolean>>,
): BasicExpression<boolean> {
  if (preds.length === 0) {
    return new Value(false)
  }
  if (preds.length === 1) {
    return preds[0]!
  }
  return new Func(`or`, preds)
}

function convertInToOr(inField: InField) {
  const equalities = inField.values.map(
    (value) => new Func(`eq`, [inField.ref, new Value(value)]),
  )
  return makeDisjunction(equalities)
}

function isWhereSubsetInternal(
  subset: BasicExpression<boolean>,
  superset: BasicExpression<boolean>,
): boolean {
  // If subset is false it is requesting no data,
  // thus the result set is empty
  // and the empty set is a subset of any set
  if (subset.type === `val` && subset.value === false) {
    return true
  }

  // If expressions are structurally equal, subset relationship holds
  if (areExpressionsEqual(subset, superset)) {
    return true
  }

  // Handle superset being an AND: subset must imply ALL conjuncts
  // If superset is (A AND B), then subset ⊆ (A AND B) only if subset ⊆ A AND subset ⊆ B
  // Example: (age > 20) ⊆ (age > 10 AND status = 'active') is false (doesn't imply status condition)
  if (superset.type === `func` && superset.name === `and`) {
    return superset.args.every((arg) =>
      isWhereSubsetInternal(subset, arg as BasicExpression<boolean>),
    )
  }

  // Handle subset being an AND: (A AND B) implies both A and B
  if (subset.type === `func` && subset.name === `and`) {
    // For (A AND B) ⊆ C, since (A AND B) implies A, we check if any conjunct implies C
    return subset.args.some((arg) =>
      isWhereSubsetInternal(arg as BasicExpression<boolean>, superset),
    )
  }

  // Turn x IN [A, B, C] into x = A OR x = B OR x = C
  // for unified handling of IN and OR
  if (subset.type === `func` && subset.name === `in`) {
    const inField = extractInField(subset)
    if (inField) {
      return isWhereSubsetInternal(convertInToOr(inField), superset)
    }
  }

  if (superset.type === `func` && superset.name === `in`) {
    const inField = extractInField(superset)
    if (inField) {
      return isWhereSubsetInternal(subset, convertInToOr(inField))
    }
  }

  // Handle OR in subset: (A OR B) is subset of C only if both A and B are subsets of C
  if (subset.type === `func` && subset.name === `or`) {
    return subset.args.every((arg) =>
      isWhereSubsetInternal(arg as BasicExpression<boolean>, superset),
    )
  }

  // Handle OR in superset: subset ⊆ (A OR B) if subset ⊆ A or subset ⊆ B
  // (A OR B) as superset means data can satisfy A or B
  // If subset is contained in any disjunct, it's contained in the union
  if (superset.type === `func` && superset.name === `or`) {
    return superset.args.some((arg) =>
      isWhereSubsetInternal(subset, arg as BasicExpression<boolean>),
    )
  }

  // Handle comparison operators on the same field
  if (subset.type === `func` && superset.type === `func`) {
    const subsetFunc = subset as Func
    const supersetFunc = superset as Func

    // Check if both are comparisons on the same field
    const subsetField = extractComparisonField(subsetFunc)
    const supersetField = extractComparisonField(supersetFunc)

    if (
      subsetField &&
      supersetField &&
      areRefsEqual(subsetField.ref, supersetField.ref)
    ) {
      return isComparisonSubset(
        subsetFunc,
        subsetField.value,
        supersetFunc,
        supersetField.value,
      )
    }

    /*
    // Handle eq vs in
    if (subsetFunc.name === `eq` && supersetFunc.name === `in`) {
      const subsetFieldEq = extractEqualityField(subsetFunc)
      const supersetFieldIn = extractInField(supersetFunc)
      if (
        subsetFieldEq &&
        supersetFieldIn &&
        areRefsEqual(subsetFieldEq.ref, supersetFieldIn.ref)
      ) {
        // field = X is subset of field IN [X, Y, Z] if X is in the array
        // Use cached primitive set and metadata from extraction
        return arrayIncludesWithSet(
          supersetFieldIn.values,
          subsetFieldEq.value,
          supersetFieldIn.primitiveSet ?? null,
          supersetFieldIn.areAllPrimitives
        )
      }
    }

    // Handle in vs in
    if (subsetFunc.name === `in` && supersetFunc.name === `in`) {
      const subsetFieldIn = extractInField(subsetFunc)
      const supersetFieldIn = extractInField(supersetFunc)
      if (
        subsetFieldIn &&
        supersetFieldIn &&
        areRefsEqual(subsetFieldIn.ref, supersetFieldIn.ref)
      ) {
        // field IN [A, B] is subset of field IN [A, B, C] if all values in subset are in superset
        // Use cached primitive set and metadata from extraction
        return subsetFieldIn.values.every((subVal) =>
          arrayIncludesWithSet(
            supersetFieldIn.values,
            subVal,
            supersetFieldIn.primitiveSet ?? null,
            supersetFieldIn.areAllPrimitives
          )
        )
      }
    }
    */
  }

  // Conservative: if we can't determine, return false
  return false
}

/**
 * Helper to combine where predicates with common logic for AND/OR operations
 */
function combineWherePredicates(
  predicates: Array<BasicExpression<boolean>>,
  operation: `and` | `or`,
  simplifyFn: (
    preds: Array<BasicExpression<boolean>>,
  ) => BasicExpression<boolean> | null,
): BasicExpression<boolean> {
  const emptyValue = operation === `and` ? true : false
  const identityValue = operation === `and` ? true : false

  if (predicates.length === 0) {
    return { type: `val`, value: emptyValue } as BasicExpression<boolean>
  }

  if (predicates.length === 1) {
    return predicates[0]!
  }

  // Flatten nested expressions of the same operation
  const flatPredicates: Array<BasicExpression<boolean>> = []
  for (const pred of predicates) {
    if (pred.type === `func` && pred.name === operation) {
      flatPredicates.push(...pred.args)
    } else {
      flatPredicates.push(pred)
    }
  }

  // Group predicates by field for simplification
  const grouped = groupPredicatesByField(flatPredicates)

  // Simplify each group
  const simplified: Array<BasicExpression<boolean>> = []
  for (const [field, preds] of grouped.entries()) {
    if (field === null) {
      // Complex predicates that we can't group by field
      simplified.push(...preds)
    } else {
      // Try to simplify same-field predicates
      const result = simplifyFn(preds)

      // For intersection: check for empty set (contradiction)
      if (
        operation === `and` &&
        result &&
        result.type === `val` &&
        result.value === false
      ) {
        // Intersection is empty (conflicting constraints) - entire AND is false
        return { type: `val`, value: false } as BasicExpression<boolean>
      }

      // For union: result may be null if simplification failed
      if (result) {
        simplified.push(result)
      }
    }
  }

  if (simplified.length === 0) {
    return { type: `val`, value: identityValue } as BasicExpression<boolean>
  }

  if (simplified.length === 1) {
    return simplified[0]!
  }

  // Return combined predicate
  return {
    type: `func`,
    name: operation,
    args: simplified,
  } as BasicExpression<boolean>
}

/**
 * Combine multiple where predicates with OR logic (union).
 * Returns a predicate that is satisfied when any input predicate is satisfied.
 * Simplifies when possible (e.g., age > 10 OR age > 20 → age > 10).
 *
 * @example
 * // Take least restrictive
 * unionWherePredicates([gt(ref('age'), val(10)), gt(ref('age'), val(20))]) // age > 10
 *
 * @example
 * // Combine equals into IN
 * unionWherePredicates([eq(ref('age'), val(5)), eq(ref('age'), val(10))]) // age IN [5, 10]
 *
 * @param predicates - Array of where predicates to union
 * @returns Combined predicate representing the union
 */
export function unionWherePredicates(
  predicates: Array<BasicExpression<boolean>>,
): BasicExpression<boolean> {
  return combineWherePredicates(predicates, `or`, unionSameFieldPredicates)
}

/**
 * Compute the difference between two where predicates: `fromPredicate AND NOT(subtractPredicate)`.
 * Returns the simplified predicate, or null if the difference cannot be simplified
 * (in which case the caller should fetch the full fromPredicate).
 *
 * @example
 * // Range difference
 * minusWherePredicates(
 *   gt(ref('age'), val(10)),      // age > 10
 *   gt(ref('age'), val(20))       // age > 20
 * ) // → age > 10 AND age <= 20
 *
 * @example
 * // Set difference
 * minusWherePredicates(
 *   inOp(ref('status'), ['A', 'B', 'C', 'D']),  // status IN ['A','B','C','D']
 *   inOp(ref('status'), ['B', 'C'])             // status IN ['B','C']
 * ) // → status IN ['A', 'D']
 *
 * @example
 * // Common conditions
 * minusWherePredicates(
 *   and(gt(ref('age'), val(10)), eq(ref('status'), val('active'))),  // age > 10 AND status = 'active'
 *   and(gt(ref('age'), val(20)), eq(ref('status'), val('active')))   // age > 20 AND status = 'active'
 * ) // → age > 10 AND age <= 20 AND status = 'active'
 *
 * @example
 * // Complete overlap - empty result
 * minusWherePredicates(
 *   gt(ref('age'), val(20)),     // age > 20
 *   gt(ref('age'), val(10))      // age > 10
 * ) // → {type: 'val', value: false} (empty set)
 *
 * @param fromPredicate - The predicate to subtract from
 * @param subtractPredicate - The predicate to subtract
 * @returns The simplified difference, or null if cannot be simplified
 */
export function minusWherePredicates(
  fromPredicate: BasicExpression<boolean> | undefined,
  subtractPredicate: BasicExpression<boolean> | undefined,
): BasicExpression<boolean> | null {
  // If nothing to subtract, return the original
  if (subtractPredicate === undefined) {
    return (
      fromPredicate ??
      ({ type: `val`, value: true } as BasicExpression<boolean>)
    )
  }

  // If from is undefined then we are asking for all data
  // so we need to load all data minus what we already loaded
  // i.e. we need to load NOT(subtractPredicate)
  if (fromPredicate === undefined) {
    return {
      type: `func`,
      name: `not`,
      args: [subtractPredicate],
    } as BasicExpression<boolean>
  }

  // Check if fromPredicate is entirely contained in subtractPredicate
  // In that case, fromPredicate AND NOT(subtractPredicate) = empty set
  if (isWhereSubset(fromPredicate, subtractPredicate)) {
    return { type: `val`, value: false } as BasicExpression<boolean>
  }

  // Try to detect and handle common conditions
  const commonConditions = findCommonConditions(
    fromPredicate,
    subtractPredicate,
  )
  if (commonConditions.length > 0) {
    // Extract predicates without common conditions
    const fromWithoutCommon = removeConditions(fromPredicate, commonConditions)
    const subtractWithoutCommon = removeConditions(
      subtractPredicate,
      commonConditions,
    )

    // Recursively compute difference on simplified predicates
    const simplifiedDifference = minusWherePredicates(
      fromWithoutCommon,
      subtractWithoutCommon,
    )

    if (simplifiedDifference !== null) {
      // Combine the simplified difference with common conditions
      return combineConditions([...commonConditions, simplifiedDifference])
    }
  }

  // Check if they are on the same field - if so, we can try to simplify
  if (fromPredicate.type === `func` && subtractPredicate.type === `func`) {
    const result = minusSameFieldPredicates(fromPredicate, subtractPredicate)
    if (result !== null) {
      return result
    }
  }

  // Can't simplify - return null to indicate caller should fetch full fromPredicate
  return null
}

/**
 * Helper function to compute difference for same-field predicates
 */
function minusSameFieldPredicates(
  fromPred: Func,
  subtractPred: Func,
): BasicExpression<boolean> | null {
  // Extract field information
  const fromField =
    extractComparisonField(fromPred) ||
    extractEqualityField(fromPred) ||
    extractInField(fromPred)
  const subtractField =
    extractComparisonField(subtractPred) ||
    extractEqualityField(subtractPred) ||
    extractInField(subtractPred)

  // Must be on the same field
  if (
    !fromField ||
    !subtractField ||
    !areRefsEqual(fromField.ref, subtractField.ref)
  ) {
    return null
  }

  // Handle IN minus IN: status IN [A,B,C,D] - status IN [B,C] = status IN [A,D]
  if (fromPred.name === `in` && subtractPred.name === `in`) {
    const fromInField = fromField as InField
    const subtractInField = subtractField as InField

    // Filter out values that are in the subtract set
    const remainingValues = fromInField.values.filter(
      (v) =>
        !arrayIncludesWithSet(
          subtractInField.values,
          v,
          subtractInField.primitiveSet ?? null,
          subtractInField.areAllPrimitives,
        ),
    )

    if (remainingValues.length === 0) {
      return { type: `val`, value: false } as BasicExpression<boolean>
    }

    if (remainingValues.length === 1) {
      return {
        type: `func`,
        name: `eq`,
        args: [fromField.ref, { type: `val`, value: remainingValues[0] }],
      } as BasicExpression<boolean>
    }

    return {
      type: `func`,
      name: `in`,
      args: [fromField.ref, { type: `val`, value: remainingValues }],
    } as BasicExpression<boolean>
  }

  // Handle IN minus equality: status IN [A,B,C] - status = B = status IN [A,C]
  if (fromPred.name === `in` && subtractPred.name === `eq`) {
    const fromInField = fromField as InField
    const subtractValue = (subtractField as { ref: PropRef; value: any }).value

    const remainingValues = fromInField.values.filter(
      (v) => !areValuesEqual(v, subtractValue),
    )

    if (remainingValues.length === 0) {
      return { type: `val`, value: false } as BasicExpression<boolean>
    }

    if (remainingValues.length === 1) {
      return {
        type: `func`,
        name: `eq`,
        args: [fromField.ref, { type: `val`, value: remainingValues[0] }],
      } as BasicExpression<boolean>
    }

    return {
      type: `func`,
      name: `in`,
      args: [fromField.ref, { type: `val`, value: remainingValues }],
    } as BasicExpression<boolean>
  }

  // Handle equality minus equality: age = 15 - age = 15 = empty, age = 15 - age = 20 = age = 15
  if (fromPred.name === `eq` && subtractPred.name === `eq`) {
    const fromValue = (fromField as { ref: PropRef; value: any }).value
    const subtractValue = (subtractField as { ref: PropRef; value: any }).value

    if (areValuesEqual(fromValue, subtractValue)) {
      return { type: `val`, value: false } as BasicExpression<boolean>
    }

    // No overlap - return original
    return fromPred as BasicExpression<boolean>
  }

  // Handle range minus range: age > 10 - age > 20 = age > 10 AND age <= 20
  const fromComp = extractComparisonField(fromPred)
  const subtractComp = extractComparisonField(subtractPred)

  if (
    fromComp &&
    subtractComp &&
    areRefsEqual(fromComp.ref, subtractComp.ref)
  ) {
    // Try to compute the difference using range logic
    const result = minusRangePredicates(
      fromPred,
      fromComp.value,
      subtractPred,
      subtractComp.value,
    )
    return result
  }

  // Can't simplify
  return null
}

/**
 * Helper to compute difference between range predicates
 */
function minusRangePredicates(
  fromFunc: Func,
  fromValue: any,
  subtractFunc: Func,
  subtractValue: any,
): BasicExpression<boolean> | null {
  const fromOp = fromFunc.name as `gt` | `gte` | `lt` | `lte` | `eq`
  const subtractOp = subtractFunc.name as `gt` | `gte` | `lt` | `lte` | `eq`
  const ref = (extractComparisonField(fromFunc) ||
    extractEqualityField(fromFunc))!.ref

  // age > 10 - age > 20 = (age > 10 AND age <= 20)
  if (fromOp === `gt` && subtractOp === `gt`) {
    if (fromValue < subtractValue) {
      // Result is: fromValue < field <= subtractValue
      return {
        type: `func`,
        name: `and`,
        args: [
          fromFunc as BasicExpression<boolean>,
          {
            type: `func`,
            name: `lte`,
            args: [ref, { type: `val`, value: subtractValue }],
          } as BasicExpression<boolean>,
        ],
      } as BasicExpression<boolean>
    }
    // fromValue >= subtractValue means no overlap
    return fromFunc as BasicExpression<boolean>
  }

  // age >= 10 - age >= 20 = (age >= 10 AND age < 20)
  if (fromOp === `gte` && subtractOp === `gte`) {
    if (fromValue < subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          fromFunc as BasicExpression<boolean>,
          {
            type: `func`,
            name: `lt`,
            args: [ref, { type: `val`, value: subtractValue }],
          } as BasicExpression<boolean>,
        ],
      } as BasicExpression<boolean>
    }
    return fromFunc as BasicExpression<boolean>
  }

  // age > 10 - age >= 20 = (age > 10 AND age < 20)
  if (fromOp === `gt` && subtractOp === `gte`) {
    if (fromValue < subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          fromFunc as BasicExpression<boolean>,
          {
            type: `func`,
            name: `lt`,
            args: [ref, { type: `val`, value: subtractValue }],
          } as BasicExpression<boolean>,
        ],
      } as BasicExpression<boolean>
    }
    return fromFunc as BasicExpression<boolean>
  }

  // age >= 10 - age > 20 = (age >= 10 AND age <= 20)
  if (fromOp === `gte` && subtractOp === `gt`) {
    if (fromValue <= subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          fromFunc as BasicExpression<boolean>,
          {
            type: `func`,
            name: `lte`,
            args: [ref, { type: `val`, value: subtractValue }],
          } as BasicExpression<boolean>,
        ],
      } as BasicExpression<boolean>
    }
    return fromFunc as BasicExpression<boolean>
  }

  // age < 30 - age < 20 = (age >= 20 AND age < 30)
  if (fromOp === `lt` && subtractOp === `lt`) {
    if (fromValue > subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          {
            type: `func`,
            name: `gte`,
            args: [ref, { type: `val`, value: subtractValue }],
          } as BasicExpression<boolean>,
          fromFunc as BasicExpression<boolean>,
        ],
      } as BasicExpression<boolean>
    }
    return fromFunc as BasicExpression<boolean>
  }

  // age <= 30 - age <= 20 = (age > 20 AND age <= 30)
  if (fromOp === `lte` && subtractOp === `lte`) {
    if (fromValue > subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          {
            type: `func`,
            name: `gt`,
            args: [ref, { type: `val`, value: subtractValue }],
          } as BasicExpression<boolean>,
          fromFunc as BasicExpression<boolean>,
        ],
      } as BasicExpression<boolean>
    }
    return fromFunc as BasicExpression<boolean>
  }

  // age < 30 - age <= 20 = (age > 20 AND age < 30)
  if (fromOp === `lt` && subtractOp === `lte`) {
    if (fromValue > subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          {
            type: `func`,
            name: `gt`,
            args: [ref, { type: `val`, value: subtractValue }],
          } as BasicExpression<boolean>,
          fromFunc as BasicExpression<boolean>,
        ],
      } as BasicExpression<boolean>
    }
    return fromFunc as BasicExpression<boolean>
  }

  // age <= 30 - age < 20 = (age >= 20 AND age <= 30)
  if (fromOp === `lte` && subtractOp === `lt`) {
    if (fromValue >= subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          {
            type: `func`,
            name: `gte`,
            args: [ref, { type: `val`, value: subtractValue }],
          } as BasicExpression<boolean>,
          fromFunc as BasicExpression<boolean>,
        ],
      } as BasicExpression<boolean>
    }
    return fromFunc as BasicExpression<boolean>
  }

  // Can't simplify other combinations
  return null
}

/**
 * Check if one orderBy clause is a subset of another.
 * Returns true if the subset ordering requirements are satisfied by the superset ordering.
 *
 * @example
 * // Subset is prefix of superset
 * isOrderBySubset([{expr: age, asc}], [{expr: age, asc}, {expr: name, desc}]) // true
 *
 * @param subset - The ordering requirements to check
 * @param superset - The ordering that might satisfy the requirements
 * @returns true if subset is satisfied by superset
 */
export function isOrderBySubset(
  subset: OrderBy | undefined,
  superset: OrderBy | undefined,
): boolean {
  // No ordering requirement is always satisfied
  if (!subset || subset.length === 0) {
    return true
  }

  // If there's no superset ordering but subset requires ordering, not satisfied
  if (!superset || superset.length === 0) {
    return false
  }

  // Check if subset is a prefix of superset with matching expressions and compare options
  if (subset.length > superset.length) {
    return false
  }

  for (let i = 0; i < subset.length; i++) {
    const subClause = subset[i]!
    const superClause = superset[i]!

    // Check if expressions match
    if (!areExpressionsEqual(subClause.expression, superClause.expression)) {
      return false
    }

    // Check if compare options match
    if (
      !areCompareOptionsEqual(
        subClause.compareOptions,
        superClause.compareOptions,
      )
    ) {
      return false
    }
  }

  return true
}

/**
 * Check if one limit is a subset of another.
 * Returns true if the subset limit requirements are satisfied by the superset limit.
 *
 * Note: This function does NOT consider offset. For offset-aware subset checking,
 * use `isOffsetLimitSubset` instead.
 *
 * @example
 * isLimitSubset(10, 20) // true (requesting 10 items when 20 are available)
 * isLimitSubset(20, 10) // false (requesting 20 items when only 10 are available)
 * isLimitSubset(10, undefined) // true (requesting 10 items when unlimited are available)
 *
 * @param subset - The limit requirement to check
 * @param superset - The limit that might satisfy the requirement
 * @returns true if subset is satisfied by superset
 */
export function isLimitSubset(
  subset: number | undefined,
  superset: number | undefined,
): boolean {
  // Unlimited superset satisfies any limit requirement
  if (superset === undefined) {
    return true
  }

  // If requesting all data (no limit), we need unlimited data to satisfy it
  // But we know superset is not unlimited so we return false
  if (subset === undefined) {
    return false
  }

  // Otherwise, subset must be less than or equal to superset
  return subset <= superset
}

/**
 * Check if one offset+limit range is a subset of another.
 * Returns true if the subset range is fully contained within the superset range.
 *
 * A query with `{limit: 10, offset: 0}` loads rows [0, 10).
 * A query with `{limit: 10, offset: 20}` loads rows [20, 30).
 *
 * For subset to be satisfied by superset:
 * - Superset must start at or before subset (superset.offset <= subset.offset)
 * - Superset must end at or after subset (superset.offset + superset.limit >= subset.offset + subset.limit)
 *
 * @example
 * isOffsetLimitSubset({ offset: 0, limit: 5 }, { offset: 0, limit: 10 }) // true
 * isOffsetLimitSubset({ offset: 5, limit: 5 }, { offset: 0, limit: 10 }) // true (rows 5-9 within 0-9)
 * isOffsetLimitSubset({ offset: 5, limit: 10 }, { offset: 0, limit: 10 }) // false (rows 5-14 exceed 0-9)
 * isOffsetLimitSubset({ offset: 20, limit: 10 }, { offset: 0, limit: 10 }) // false (rows 20-29 outside 0-9)
 *
 * @param subset - The offset+limit requirements to check
 * @param superset - The offset+limit that might satisfy the requirements
 * @returns true if subset range is fully contained within superset range
 */
export function isOffsetLimitSubset(
  subset: { offset?: number; limit?: number },
  superset: { offset?: number; limit?: number },
): boolean {
  const subsetOffset = subset.offset ?? 0
  const supersetOffset = superset.offset ?? 0

  // Superset must start at or before subset
  if (supersetOffset > subsetOffset) {
    return false
  }

  // If superset is unlimited, it covers everything from its offset onwards
  if (superset.limit === undefined) {
    return true
  }

  // If subset is unlimited but superset has a limit, subset can't be satisfied
  if (subset.limit === undefined) {
    return false
  }

  // Both have limits - check if subset range is within superset range
  const subsetEnd = subsetOffset + subset.limit
  const supersetEnd = supersetOffset + superset.limit

  return subsetEnd <= supersetEnd
}

/**
 * Check if one predicate (where + orderBy + limit + offset) is a subset of another.
 * Returns true if all aspects of the subset predicate are satisfied by the superset.
 *
 * @example
 * isPredicateSubset(
 *   { where: gt(ref('age'), val(20)), limit: 10 },
 *   { where: gt(ref('age'), val(10)), limit: 20 }
 * ) // true
 *
 * @param subset - The predicate requirements to check
 * @param superset - The predicate that might satisfy the requirements
 * @returns true if subset is satisfied by superset
 */
export function isPredicateSubset(
  subset: LoadSubsetOptions,
  superset: LoadSubsetOptions,
): boolean {
  // When the superset has a limit, we can only determine subset relationship
  // if the where clauses are equal (not just subset relationship).
  //
  // This is because a limited query only loads a portion of the matching rows.
  // A more restrictive where clause might require rows outside that portion.
  //
  // Example: superset = {where: undefined, limit: 10, orderBy: desc}
  //          subset = {where: LIKE 'search%', limit: 10, orderBy: desc}
  // The top 10 items matching 'search%' might include items outside the overall top 10.
  //
  // However, if the where clauses are equal, then the subset relationship can
  // be determined by orderBy, limit, and offset:
  // Example: superset = {where: status='active', limit: 10, offset: 0, orderBy: desc}
  //          subset = {where: status='active', limit: 5, offset: 0, orderBy: desc}
  // The top 5 active items ARE contained in the top 10 active items.
  if (superset.limit !== undefined) {
    // For limited supersets, where clauses must be equal
    if (!areWhereClausesEqual(subset.where, superset.where)) {
      return false
    }
    return (
      isOrderBySubset(subset.orderBy, superset.orderBy) &&
      isOffsetLimitSubset(subset, superset)
    )
  }

  // For unlimited supersets, use the normal subset logic
  // Still need to consider offset - an unlimited query with offset only covers
  // rows from that offset onwards
  return (
    isWhereSubset(subset.where, superset.where) &&
    isOrderBySubset(subset.orderBy, superset.orderBy) &&
    isOffsetLimitSubset(subset, superset)
  )
}

/**
 * Check if two where clauses are structurally equal.
 * Used for limited query subset checks where subset relationship isn't sufficient.
 */
function areWhereClausesEqual(
  a: BasicExpression<boolean> | undefined,
  b: BasicExpression<boolean> | undefined,
): boolean {
  if (a === undefined && b === undefined) {
    return true
  }
  if (a === undefined || b === undefined) {
    return false
  }
  return areExpressionsEqual(a, b)
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Find common conditions between two predicates.
 * Returns an array of conditions that appear in both predicates.
 */
function findCommonConditions(
  predicate1: BasicExpression<boolean>,
  predicate2: BasicExpression<boolean>,
): Array<BasicExpression<boolean>> {
  const conditions1 = extractAllConditions(predicate1)
  const conditions2 = extractAllConditions(predicate2)

  const common: Array<BasicExpression<boolean>> = []

  for (const cond1 of conditions1) {
    for (const cond2 of conditions2) {
      if (areExpressionsEqual(cond1, cond2)) {
        // Avoid duplicates
        if (!common.some((c) => areExpressionsEqual(c, cond1))) {
          common.push(cond1)
        }
        break
      }
    }
  }

  return common
}

/**
 * Extract all individual conditions from a predicate, flattening AND operations.
 */
function extractAllConditions(
  predicate: BasicExpression<boolean>,
): Array<BasicExpression<boolean>> {
  if (predicate.type === `func` && predicate.name === `and`) {
    const conditions: Array<BasicExpression<boolean>> = []
    for (const arg of predicate.args) {
      conditions.push(...extractAllConditions(arg as BasicExpression<boolean>))
    }
    return conditions
  }

  return [predicate]
}

/**
 * Remove specified conditions from a predicate.
 * Returns the predicate with the specified conditions removed, or undefined if all conditions are removed.
 */
function removeConditions(
  predicate: BasicExpression<boolean>,
  conditionsToRemove: Array<BasicExpression<boolean>>,
): BasicExpression<boolean> | undefined {
  if (predicate.type === `func` && predicate.name === `and`) {
    const remainingArgs = predicate.args.filter(
      (arg) =>
        !conditionsToRemove.some((cond) =>
          areExpressionsEqual(arg as BasicExpression<boolean>, cond),
        ),
    )

    if (remainingArgs.length === 0) {
      return undefined
    } else if (remainingArgs.length === 1) {
      return remainingArgs[0]!
    } else {
      return {
        type: `func`,
        name: `and`,
        args: remainingArgs,
      } as BasicExpression<boolean>
    }
  }

  // For non-AND predicates, don't remove anything
  return predicate
}

/**
 * Combine multiple conditions into a single predicate using AND logic.
 * Flattens nested AND operations to avoid unnecessary nesting.
 */
function combineConditions(
  conditions: Array<BasicExpression<boolean>>,
): BasicExpression<boolean> {
  if (conditions.length === 0) {
    return { type: `val`, value: true } as BasicExpression<boolean>
  } else if (conditions.length === 1) {
    return conditions[0]!
  } else {
    // Flatten all conditions, including those that are already AND operations
    const flattenedConditions: Array<BasicExpression<boolean>> = []

    for (const condition of conditions) {
      if (condition.type === `func` && condition.name === `and`) {
        // Flatten nested AND operations
        flattenedConditions.push(...condition.args)
      } else {
        flattenedConditions.push(condition)
      }
    }

    if (flattenedConditions.length === 1) {
      return flattenedConditions[0]!
    } else {
      return {
        type: `func`,
        name: `and`,
        args: flattenedConditions,
      } as BasicExpression<boolean>
    }
  }
}

/**
 * Find a predicate with a specific operator and value
 */
function findPredicateWithOperator(
  predicates: Array<BasicExpression<boolean>>,
  operator: string,
  value: any,
): BasicExpression<boolean> | undefined {
  return predicates.find((p) => {
    if (p.type === `func`) {
      const f = p as Func
      const field = extractComparisonField(f)
      return f.name === operator && field && areValuesEqual(field.value, value)
    }
    return false
  })
}

function areExpressionsEqual(a: BasicExpression, b: BasicExpression): boolean {
  if (a.type !== b.type) {
    return false
  }

  if (a.type === `val` && b.type === `val`) {
    return areValuesEqual(a.value, b.value)
  }

  if (a.type === `ref` && b.type === `ref`) {
    return areRefsEqual(a, b)
  }

  if (a.type === `func` && b.type === `func`) {
    const aFunc = a
    const bFunc = b
    if (aFunc.name !== bFunc.name) {
      return false
    }
    if (aFunc.args.length !== bFunc.args.length) {
      return false
    }
    return aFunc.args.every((arg, i) =>
      areExpressionsEqual(arg, bFunc.args[i]!),
    )
  }

  return false
}

function areValuesEqual(a: any, b: any): boolean {
  // Simple equality check - could be enhanced for deep object comparison
  if (a === b) {
    return true
  }

  // Handle NaN
  if (typeof a === `number` && typeof b === `number` && isNaN(a) && isNaN(b)) {
    return true
  }

  // Handle Date objects
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }

  // For arrays and objects, use reference equality
  // (In practice, we don't need deep equality for these cases -
  // same object reference means same value for our use case)
  if (
    typeof a === `object` &&
    typeof b === `object` &&
    a !== null &&
    b !== null
  ) {
    return a === b
  }

  return false
}

function areRefsEqual(a: PropRef, b: PropRef): boolean {
  if (a.path.length !== b.path.length) {
    return false
  }
  return a.path.every((segment, i) => segment === b.path[i])
}

/**
 * Check if a value is a primitive (string, number, boolean, null, undefined)
 * Primitives can use Set for fast lookups
 */
function isPrimitive(value: any): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === `string` ||
    typeof value === `number` ||
    typeof value === `boolean`
  )
}

/**
 * Check if all values in an array are primitives
 */
function areAllPrimitives(values: Array<any>): boolean {
  return values.every(isPrimitive)
}

/**
 * Check if a value is in an array, with optional pre-built Set for optimization.
 * The primitiveSet is cached in InField during extraction and reused for all lookups.
 */
function arrayIncludesWithSet(
  array: Array<any>,
  value: any,
  primitiveSet: Set<any> | null,
  arrayIsAllPrimitives?: boolean,
): boolean {
  // Fast path: use pre-built Set for O(1) lookup
  if (primitiveSet) {
    // Skip isPrimitive check if we know the value must be primitive for a match
    // (if array is all primitives, only primitives can match)
    if (arrayIsAllPrimitives || isPrimitive(value)) {
      return primitiveSet.has(value)
    }
    return false // Non-primitive can't be in primitive-only set
  }

  // Fallback: use areValuesEqual for Dates and objects
  return array.some((v) => areValuesEqual(v, value))
}

/**
 * Get the maximum of two values, handling both numbers and Dates
 */
function maxValue(a: any, b: any): any {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() > b.getTime() ? a : b
  }
  return Math.max(a, b)
}

/**
 * Get the minimum of two values, handling both numbers and Dates
 */
function minValue(a: any, b: any): any {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() < b.getTime() ? a : b
  }
  return Math.min(a, b)
}

function areCompareOptionsEqual(
  a: { direction?: `asc` | `desc`; [key: string]: any },
  b: { direction?: `asc` | `desc`; [key: string]: any },
): boolean {
  // For now, just compare direction - could be enhanced for other options
  return a.direction === b.direction
}

interface ComparisonField {
  ref: PropRef
  value: any
}

function extractComparisonField(func: Func): ComparisonField | null {
  // Handle comparison operators: eq, gt, gte, lt, lte
  if ([`eq`, `gt`, `gte`, `lt`, `lte`].includes(func.name)) {
    // Assume first arg is ref, second is value
    const firstArg = func.args[0]
    const secondArg = func.args[1]

    if (firstArg?.type === `ref` && secondArg?.type === `val`) {
      return {
        ref: firstArg,
        value: secondArg.value,
      }
    }
  }

  return null
}

function extractEqualityField(func: Func): ComparisonField | null {
  if (func.name === `eq`) {
    const firstArg = func.args[0]
    const secondArg = func.args[1]

    if (firstArg?.type === `ref` && secondArg?.type === `val`) {
      return {
        ref: firstArg,
        value: secondArg.value,
      }
    }
  }
  return null
}

interface InField {
  ref: PropRef
  values: Array<any>
  // Cached optimization data (computed once, reused many times)
  areAllPrimitives?: boolean
  primitiveSet?: Set<any> | null
}

function extractInField(func: Func): InField | null {
  if (func.name === `in`) {
    const firstArg = func.args[0]
    const secondArg = func.args[1]

    if (
      firstArg?.type === `ref` &&
      secondArg?.type === `val` &&
      Array.isArray(secondArg.value)
    ) {
      let values = secondArg.value
      // Precompute optimization metadata once
      const allPrimitives = areAllPrimitives(values)
      let primitiveSet: Set<any> | null = null

      if (allPrimitives && values.length > 10) {
        // Build Set and dedupe values at the same time
        primitiveSet = new Set(values)
        // If we found duplicates, use the deduped array going forward
        if (primitiveSet.size < values.length) {
          values = Array.from(primitiveSet)
        }
      }

      return {
        ref: firstArg,
        values,
        areAllPrimitives: allPrimitives,
        primitiveSet,
      }
    }
  }
  return null
}

function isComparisonSubset(
  subsetFunc: Func,
  subsetValue: any,
  supersetFunc: Func,
  supersetValue: any,
): boolean {
  const subOp = subsetFunc.name
  const superOp = supersetFunc.name

  // Handle same operator
  if (subOp === superOp) {
    if (subOp === `eq`) {
      // field = X is subset of field = X only
      // Fast path: primitives can use strict equality
      if (isPrimitive(subsetValue) && isPrimitive(supersetValue)) {
        return subsetValue === supersetValue
      }
      return areValuesEqual(subsetValue, supersetValue)
    } else if (subOp === `gt`) {
      // field > 20 is subset of field > 10 if 20 > 10
      return subsetValue >= supersetValue
    } else if (subOp === `gte`) {
      // field >= 20 is subset of field >= 10 if 20 >= 10
      return subsetValue >= supersetValue
    } else if (subOp === `lt`) {
      // field < 10 is subset of field < 20 if 10 <= 20
      return subsetValue <= supersetValue
    } else if (subOp === `lte`) {
      // field <= 10 is subset of field <= 20 if 10 <= 20
      return subsetValue <= supersetValue
    }
  }

  // Handle different operators on same field
  // eq vs gt/gte: field = 15 is subset of field > 10 if 15 > 10
  if (subOp === `eq` && superOp === `gt`) {
    return subsetValue > supersetValue
  }
  if (subOp === `eq` && superOp === `gte`) {
    return subsetValue >= supersetValue
  }
  if (subOp === `eq` && superOp === `lt`) {
    return subsetValue < supersetValue
  }
  if (subOp === `eq` && superOp === `lte`) {
    return subsetValue <= supersetValue
  }

  // gt/gte vs gte/gt
  if (subOp === `gt` && superOp === `gte`) {
    // field > 10 is subset of field >= 10 if 10 >= 10 (always true for same value)
    return subsetValue >= supersetValue
  }
  if (subOp === `gte` && superOp === `gt`) {
    // field >= 11 is subset of field > 10 if 11 > 10
    return subsetValue > supersetValue
  }

  // lt/lte vs lte/lt
  if (subOp === `lt` && superOp === `lte`) {
    // field < 10 is subset of field <= 10 if 10 <= 10
    return subsetValue <= supersetValue
  }
  if (subOp === `lte` && superOp === `lt`) {
    // field <= 9 is subset of field < 10 if 9 < 10
    return subsetValue < supersetValue
  }

  return false
}

function groupPredicatesByField(
  predicates: Array<BasicExpression<boolean>>,
): Map<string | null, Array<BasicExpression<boolean>>> {
  const groups = new Map<string | null, Array<BasicExpression<boolean>>>()

  for (const pred of predicates) {
    let fieldKey: string | null = null

    if (pred.type === `func`) {
      const func = pred as Func
      const field =
        extractComparisonField(func) ||
        extractEqualityField(func) ||
        extractInField(func)
      if (field) {
        fieldKey = field.ref.path.join(`.`)
      }
    }

    const group = groups.get(fieldKey) || []
    group.push(pred)
    groups.set(fieldKey, group)
  }

  return groups
}

function unionSameFieldPredicates(
  predicates: Array<BasicExpression<boolean>>,
): BasicExpression<boolean> | null {
  if (predicates.length === 1) {
    return predicates[0]!
  }

  // Try to extract range constraints
  let maxGt: number | null = null
  let maxGte: number | null = null
  let minLt: number | null = null
  let minLte: number | null = null
  const eqValues: Set<any> = new Set()
  const inValues: Set<any> = new Set()
  const otherPredicates: Array<BasicExpression<boolean>> = []

  for (const pred of predicates) {
    if (pred.type === `func`) {
      const func = pred as Func
      const field = extractComparisonField(func)

      if (field) {
        const value = field.value
        if (func.name === `gt`) {
          maxGt = maxGt === null ? value : minValue(maxGt, value)
        } else if (func.name === `gte`) {
          maxGte = maxGte === null ? value : minValue(maxGte, value)
        } else if (func.name === `lt`) {
          minLt = minLt === null ? value : maxValue(minLt, value)
        } else if (func.name === `lte`) {
          minLte = minLte === null ? value : maxValue(minLte, value)
        } else if (func.name === `eq`) {
          eqValues.add(value)
        } else {
          otherPredicates.push(pred)
        }
      } else {
        const inField = extractInField(func)
        if (inField) {
          for (const val of inField.values) {
            inValues.add(val)
          }
        } else {
          otherPredicates.push(pred)
        }
      }
    } else {
      otherPredicates.push(pred)
    }
  }

  // If we have multiple equality values, combine into IN
  if (eqValues.size > 1 || (eqValues.size > 0 && inValues.size > 0)) {
    const allValues = [...eqValues, ...inValues]
    const ref = predicates.find((p) => {
      if (p.type === `func`) {
        const field =
          extractComparisonField(p as Func) || extractInField(p as Func)
        return field !== null
      }
      return false
    })

    if (ref && ref.type === `func`) {
      const field =
        extractComparisonField(ref as Func) || extractInField(ref as Func)
      if (field) {
        return {
          type: `func`,
          name: `in`,
          args: [
            field.ref,
            { type: `val`, value: allValues } as BasicExpression,
          ],
        } as BasicExpression<boolean>
      }
    }
  }

  // Build the least restrictive range
  const result: Array<BasicExpression<boolean>> = []

  // Choose the least restrictive lower bound
  if (maxGt !== null && maxGte !== null) {
    // Take the smaller one (less restrictive)
    const pred =
      maxGte <= maxGt
        ? findPredicateWithOperator(predicates, `gte`, maxGte)
        : findPredicateWithOperator(predicates, `gt`, maxGt)
    if (pred) result.push(pred)
  } else if (maxGt !== null) {
    const pred = findPredicateWithOperator(predicates, `gt`, maxGt)
    if (pred) result.push(pred)
  } else if (maxGte !== null) {
    const pred = findPredicateWithOperator(predicates, `gte`, maxGte)
    if (pred) result.push(pred)
  }

  // Choose the least restrictive upper bound
  if (minLt !== null && minLte !== null) {
    const pred =
      minLte >= minLt
        ? findPredicateWithOperator(predicates, `lte`, minLte)
        : findPredicateWithOperator(predicates, `lt`, minLt)
    if (pred) result.push(pred)
  } else if (minLt !== null) {
    const pred = findPredicateWithOperator(predicates, `lt`, minLt)
    if (pred) result.push(pred)
  } else if (minLte !== null) {
    const pred = findPredicateWithOperator(predicates, `lte`, minLte)
    if (pred) result.push(pred)
  }

  // Add single eq value
  if (eqValues.size === 1 && inValues.size === 0) {
    const pred = findPredicateWithOperator(predicates, `eq`, [...eqValues][0])
    if (pred) result.push(pred)
  }

  // Add IN if only IN values
  if (eqValues.size === 0 && inValues.size > 0) {
    result.push(
      predicates.find((p) => {
        if (p.type === `func`) {
          return (p as Func).name === `in`
        }
        return false
      })!,
    )
  }

  // Add other predicates
  result.push(...otherPredicates)

  if (result.length === 0) {
    return { type: `val`, value: true } as BasicExpression<boolean>
  }

  if (result.length === 1) {
    return result[0]!
  }

  return {
    type: `func`,
    name: `or`,
    args: result,
  } as BasicExpression<boolean>
}
