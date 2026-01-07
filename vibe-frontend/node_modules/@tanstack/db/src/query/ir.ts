/*
This is the intermediate representation of the query.
*/

import type { CompareOptions } from './builder/types'
import type { Collection, CollectionImpl } from '../collection/index.js'
import type { NamespacedRow } from '../types'

export interface QueryIR {
  from: From
  select?: Select
  join?: Join
  where?: Array<Where>
  groupBy?: GroupBy
  having?: Array<Having>
  orderBy?: OrderBy
  limit?: Limit
  offset?: Offset
  distinct?: true
  singleResult?: true

  // Functional variants
  fnSelect?: (row: NamespacedRow) => any
  fnWhere?: Array<(row: NamespacedRow) => any>
  fnHaving?: Array<(row: NamespacedRow) => any>
}

export type From = CollectionRef | QueryRef

export type Select = {
  [alias: string]: BasicExpression | Aggregate | Select
}

export type Join = Array<JoinClause>

export interface JoinClause {
  from: CollectionRef | QueryRef
  type: `left` | `right` | `inner` | `outer` | `full` | `cross`
  left: BasicExpression
  right: BasicExpression
}

export type Where =
  | BasicExpression<boolean>
  | { expression: BasicExpression<boolean>; residual?: boolean }

export type GroupBy = Array<BasicExpression>

export type Having = Where

export type OrderBy = Array<OrderByClause>

export type OrderByClause = {
  expression: BasicExpression
  compareOptions: CompareOptions
}

export type OrderByDirection = `asc` | `desc`

export type Limit = number

export type Offset = number

/* Expressions */

abstract class BaseExpression<T = any> {
  public abstract type: string
  /** @internal - Type brand for TypeScript inference */
  declare readonly __returnType: T
}

export class CollectionRef extends BaseExpression {
  public type = `collectionRef` as const
  constructor(
    public collection: CollectionImpl,
    public alias: string,
  ) {
    super()
  }
}

export class QueryRef extends BaseExpression {
  public type = `queryRef` as const
  constructor(
    public query: QueryIR,
    public alias: string,
  ) {
    super()
  }
}

export class PropRef<T = any> extends BaseExpression<T> {
  public type = `ref` as const
  constructor(
    public path: Array<string>, // path to the property in the collection, with the alias as the first element
  ) {
    super()
  }
}

export class Value<T = any> extends BaseExpression<T> {
  public type = `val` as const
  constructor(
    public value: T, // any js value
  ) {
    super()
  }
}

export class Func<T = any> extends BaseExpression<T> {
  public type = `func` as const
  constructor(
    public name: string, // such as eq, gt, lt, upper, lower, etc.
    public args: Array<BasicExpression>,
  ) {
    super()
  }
}

// This is the basic expression type that is used in the majority of expression
// builder callbacks (select, where, groupBy, having, orderBy, etc.)
// it doesn't include aggregate functions as those are only used in the select clause
export type BasicExpression<T = any> = PropRef<T> | Value<T> | Func<T>

export class Aggregate<T = any> extends BaseExpression<T> {
  public type = `agg` as const
  constructor(
    public name: string, // such as count, avg, sum, min, max, etc.
    public args: Array<BasicExpression>,
  ) {
    super()
  }
}

/**
 * Runtime helper to detect IR expression-like objects.
 * Prefer this over ad-hoc local implementations to keep behavior consistent.
 */
export function isExpressionLike(value: any): boolean {
  return (
    value instanceof Aggregate ||
    value instanceof Func ||
    value instanceof PropRef ||
    value instanceof Value
  )
}

/**
 * Helper functions for working with Where clauses
 */

/**
 * Extract the expression from a Where clause
 */
export function getWhereExpression(where: Where): BasicExpression<boolean> {
  return typeof where === `object` && `expression` in where
    ? where.expression
    : where
}

/**
 * Extract the expression from a HAVING clause
 * HAVING clauses can contain aggregates, unlike regular WHERE clauses
 */
export function getHavingExpression(
  having: Having,
): BasicExpression | Aggregate {
  return typeof having === `object` && `expression` in having
    ? having.expression
    : having
}

/**
 * Check if a Where clause is marked as residual
 */
export function isResidualWhere(where: Where): boolean {
  return (
    typeof where === `object` &&
    `expression` in where &&
    where.residual === true
  )
}

/**
 * Create a residual Where clause from an expression
 */
export function createResidualWhere(
  expression: BasicExpression<boolean>,
): Where {
  return { expression, residual: true }
}

function getRefFromAlias(
  query: QueryIR,
  alias: string,
): CollectionRef | QueryRef | void {
  if (query.from.alias === alias) {
    return query.from
  }

  for (const join of query.join || []) {
    if (join.from.alias === alias) {
      return join.from
    }
  }
}

/**
 * Follows the given reference in a query
 * until its finds the root field the reference points to.
 * @returns The collection, its alias, and the path to the root field in this collection
 */
export function followRef(
  query: QueryIR,
  ref: PropRef<any>,
  collection: Collection,
): { collection: Collection; path: Array<string> } | void {
  if (ref.path.length === 0) {
    return
  }

  if (ref.path.length === 1) {
    // This field should be part of this collection
    const field = ref.path[0]!
    // is it part of the select clause?
    if (query.select) {
      const selectedField = query.select[field]
      if (selectedField && selectedField.type === `ref`) {
        return followRef(query, selectedField, collection)
      }
    }

    // Either this field is not part of the select clause
    // and thus it must be part of the collection itself
    // or it is part of the select but is not a reference
    // so we can stop here and don't have to follow it
    return { collection, path: [field] }
  }

  if (ref.path.length > 1) {
    // This is a nested field
    const [alias, ...rest] = ref.path
    const aliasRef = getRefFromAlias(query, alias!)
    if (!aliasRef) {
      return
    }

    if (aliasRef.type === `queryRef`) {
      return followRef(aliasRef.query, new PropRef(rest), collection)
    } else {
      // This is a reference to a collection
      // we can't follow it further
      // so the field must be on the collection itself
      return { collection: aliasRef.collection, path: rest }
    }
  }
}
