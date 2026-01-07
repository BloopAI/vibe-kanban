import { map } from '@tanstack/db-ivm'
import { PropRef, Value as ValClass, isExpressionLike } from '../ir.js'
import { AggregateNotSupportedError } from '../../errors.js'
import { compileExpression } from './evaluators.js'
import type { Aggregate, BasicExpression, Select } from '../ir.js'
import type {
  KeyedStream,
  NamespacedAndKeyedStream,
  NamespacedRow,
} from '../../types.js'

/**
 * Type for operations array used in select processing
 */
type SelectOp =
  | {
      kind: `merge`
      targetPath: Array<string>
      source: (row: NamespacedRow) => any
    }
  | { kind: `field`; alias: string; compiled: (row: NamespacedRow) => any }

/**
 * Unwraps any Value expressions
 */
function unwrapVal(input: any): any {
  if (input instanceof ValClass) return input.value
  return input
}

/**
 * Processes a merge operation by merging source values into the target path
 */
function processMerge(
  op: Extract<SelectOp, { kind: `merge` }>,
  namespacedRow: NamespacedRow,
  selectResults: Record<string, any>,
): void {
  const value = op.source(namespacedRow)
  if (value && typeof value === `object`) {
    // Ensure target object exists
    let cursor: any = selectResults
    const path = op.targetPath
    if (path.length === 0) {
      // Top-level merge
      for (const [k, v] of Object.entries(value)) {
        selectResults[k] = unwrapVal(v)
      }
    } else {
      for (let i = 0; i < path.length; i++) {
        const seg = path[i]!
        if (i === path.length - 1) {
          const dest = (cursor[seg] ??= {})
          if (typeof dest === `object`) {
            for (const [k, v] of Object.entries(value)) {
              dest[k] = unwrapVal(v)
            }
          }
        } else {
          const next = cursor[seg]
          if (next == null || typeof next !== `object`) {
            cursor[seg] = {}
          }
          cursor = cursor[seg]
        }
      }
    }
  }
}

/**
 * Processes a non-merge operation by setting the field value at the specified alias path
 */
function processNonMergeOp(
  op: Extract<SelectOp, { kind: `field` }>,
  namespacedRow: NamespacedRow,
  selectResults: Record<string, any>,
): void {
  // Support nested alias paths like "meta.author.name"
  const path = op.alias.split(`.`)
  if (path.length === 1) {
    selectResults[op.alias] = op.compiled(namespacedRow)
  } else {
    let cursor: any = selectResults
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i]!
      const next = cursor[seg]
      if (next == null || typeof next !== `object`) {
        cursor[seg] = {}
      }
      cursor = cursor[seg]
    }
    cursor[path[path.length - 1]!] = unwrapVal(op.compiled(namespacedRow))
  }
}

/**
 * Processes a single row to generate select results
 */
function processRow(
  [key, namespacedRow]: [unknown, NamespacedRow],
  ops: Array<SelectOp>,
): [unknown, typeof namespacedRow & { __select_results: any }] {
  const selectResults: Record<string, any> = {}

  for (const op of ops) {
    if (op.kind === `merge`) {
      processMerge(op, namespacedRow, selectResults)
    } else {
      processNonMergeOp(op, namespacedRow, selectResults)
    }
  }

  // Return the namespaced row with __select_results added
  return [
    key,
    {
      ...namespacedRow,
      __select_results: selectResults,
    },
  ] as [
    unknown,
    typeof namespacedRow & { __select_results: typeof selectResults },
  ]
}

/**
 * Processes the SELECT clause and places results in __select_results
 * while preserving the original namespaced row for ORDER BY access
 */
export function processSelect(
  pipeline: NamespacedAndKeyedStream,
  select: Select,
  _allInputs: Record<string, KeyedStream>,
): NamespacedAndKeyedStream {
  // Build ordered operations to preserve authoring order (spreads and fields)
  const ops: Array<SelectOp> = []

  addFromObject([], select, ops)

  return pipeline.pipe(map((row) => processRow(row, ops)))
}

/**
 * Helper function to check if an expression is an aggregate
 */
function isAggregateExpression(
  expr: BasicExpression | Aggregate,
): expr is Aggregate {
  return expr.type === `agg`
}

/**
 * Processes a single argument in a function context
 */
export function processArgument(
  arg: BasicExpression | Aggregate,
  namespacedRow: NamespacedRow,
): any {
  if (isAggregateExpression(arg)) {
    throw new AggregateNotSupportedError()
  }

  // Pre-compile the expression and evaluate immediately
  const compiledExpression = compileExpression(arg)
  const value = compiledExpression(namespacedRow)

  return value
}

/**
 * Helper function to check if an object is a nested select object
 *
 * .select({
 *   id: users.id,
 *   profile: { // <-- this is a nested select object
 *     name: users.name,
 *     email: users.email
 *   }
 * })
 */
function isNestedSelectObject(obj: any): boolean {
  return obj && typeof obj === `object` && !isExpressionLike(obj)
}

/**
 * Helper function to process select objects and build operations array
 */
function addFromObject(
  prefixPath: Array<string>,
  obj: any,
  ops: Array<SelectOp>,
) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith(`__SPREAD_SENTINEL__`)) {
      const rest = key.slice(`__SPREAD_SENTINEL__`.length)
      const splitIndex = rest.lastIndexOf(`__`)
      const pathStr = splitIndex >= 0 ? rest.slice(0, splitIndex) : rest
      const isRefExpr =
        value &&
        typeof value === `object` &&
        `type` in (value as any) &&
        (value as any).type === `ref`
      if (pathStr.includes(`.`) || isRefExpr) {
        // Merge into the current destination (prefixPath) from the referenced source path
        const targetPath = [...prefixPath]
        const expr = isRefExpr
          ? (value as BasicExpression)
          : (new PropRef(pathStr.split(`.`)) as BasicExpression)
        const compiled = compileExpression(expr)
        ops.push({ kind: `merge`, targetPath, source: compiled })
      } else {
        // Table-level: pathStr is the alias; merge from namespaced row at the current prefix
        const tableAlias = pathStr
        const targetPath = [...prefixPath]
        ops.push({
          kind: `merge`,
          targetPath,
          source: (row) => (row as any)[tableAlias],
        })
      }
      continue
    }

    const expression = value as any
    if (isNestedSelectObject(expression)) {
      // Nested selection object
      addFromObject([...prefixPath, key], expression, ops)
      continue
    }

    if (isAggregateExpression(expression)) {
      // Placeholder for group-by processing later
      ops.push({
        kind: `field`,
        alias: [...prefixPath, key].join(`.`),
        compiled: () => null,
      })
    } else {
      if (expression === undefined || !isExpressionLike(expression)) {
        ops.push({
          kind: `field`,
          alias: [...prefixPath, key].join(`.`),
          compiled: () => expression,
        })
        continue
      }
      // If the expression is a Value wrapper, embed the literal to avoid re-compilation mishaps
      if (expression instanceof ValClass) {
        const val = expression.value
        ops.push({
          kind: `field`,
          alias: [...prefixPath, key].join(`.`),
          compiled: () => val,
        })
      } else {
        ops.push({
          kind: `field`,
          alias: [...prefixPath, key].join(`.`),
          compiled: compileExpression(expression as BasicExpression),
        })
      }
    }
  }
}
