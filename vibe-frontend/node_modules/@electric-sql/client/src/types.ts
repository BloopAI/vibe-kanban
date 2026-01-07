/**
 * Default types for SQL but can be extended with additional types when using a custom parser.
 * @typeParam Extensions - Additional value types.
 */
export type Value<Extensions = never> =
  | string
  | number
  | boolean
  | bigint
  | null
  | Extensions
  | Value<Extensions>[]
  | { [key: string]: Value<Extensions> }

export type Row<Extensions = never> = Record<string, Value<Extensions>>

// Check if `T` extends the base Row type without extensions
// if yes, it has no extensions so we return `never`
// otherwise, we infer the extensions from the Row type
export type GetExtensions<T> = [T] extends [Row<never>]
  ? never
  : [T] extends [Row<infer E>]
    ? E
    : never

export type Offset =
  | `-1`
  | `now`
  | `${number}_${number}`
  | `${bigint}_${number}`

/** Information about transaction visibility for a snapshot. All fields are encoded as strings, but should be treated as uint64. */
export type PostgresSnapshot = {
  xmin: `${bigint}`
  xmax: `${bigint}`
  xip_list: `${bigint}`[]
}

export type NormalizedPgSnapshot = {
  xmin: bigint
  xmax: bigint
  xip_list: bigint[]
}

interface Header {
  [key: Exclude<string, `operation` | `control` | `event`>]: Value
}

export type Operation = `insert` | `update` | `delete`
/**
 * A tag is a string identifying a reason for this row to be part of the shape.
 *
 * Tags can be composite, but they are always sent as a single string. Compound tags
 * are separated by `|`. It's up to the client to split the tag into its components
 * in order to react to move-outs correctly. Tag parts are guaranteed to not contain an
 * unescaped `|` character (escaped as `\\|`) or be a literal `*`.
 *
 * Composite tag width is guaranteed to be fixed for a given shape.
 */
export type MoveTag = string

/**
 * A move-out pattern is a position and a value. The position is the index of the column
 * that is being moved out. The value is the value of the column that is being moved out.
 *
 * Tag width and value order is fixed for a given shape, so the client can determine
 * which tags match this pattern.
 */
export type MoveOutPattern = { pos: number; value: string }

/**
 * Serialized expression types for structured subset queries.
 * These allow Electric to properly apply columnMapper transformations
 * before generating the final SQL.
 */
export type SerializedExpression =
  | { type: `ref`; column: string } // Column reference
  | { type: `val`; paramIndex: number } // Parameter placeholder ($1, $2, etc.)
  | { type: `func`; name: string; args: SerializedExpression[] } // Operator/function

/**
 * Serialized ORDER BY clause for structured subset queries.
 */
export type SerializedOrderByClause = {
  column: string
  direction?: `asc` | `desc` // omitted means 'asc'
  nulls?: `first` | `last`
}

export type SubsetParams = {
  /** Legacy string format WHERE clause */
  where?: string
  /** Positional parameter values for WHERE clause */
  params?: Record<string, string>
  /** Maximum number of rows to return */
  limit?: number
  /** Number of rows to skip */
  offset?: number
  /** Legacy string format ORDER BY clause */
  orderBy?: string
  /** Structured WHERE expression (preferred when available) */
  whereExpr?: SerializedExpression
  /** Structured ORDER BY clauses (preferred when available) */
  orderByExpr?: SerializedOrderByClause[]
}

export type ControlMessage = {
  headers:
    | (Header & {
        control: `up-to-date` | `must-refetch`
        global_last_seen_lsn?: string
      })
    | (Header & { control: `snapshot-end` } & PostgresSnapshot)
    | (Header & { control: `subset-end` } & SubsetParams)
}

export type EventMessage = {
  headers: Header & { event: `move-out`; patterns: MoveOutPattern[] }
}

export type ChangeMessage<T extends Row<unknown> = Row> = {
  key: string
  value: T
  old_value?: Partial<T> // Only provided for updates if `replica` is `full`
  headers: Header & {
    operation: Operation
    txids?: number[]
    /** Tags will always be present for changes if the shape has a subquery in its where clause, and are omitted otherwise.*/
    tags?: MoveTag[]
    removed_tags?: MoveTag[]
  }
}

// Define the type for a record
export type Message<T extends Row<unknown> = Row> =
  | ControlMessage
  | EventMessage
  | ChangeMessage<T>

/**
 * Common properties for all columns.
 * `dims` is the number of dimensions of the column. Only provided if the column is an array.
 * `not_null` is true if the column has a `NOT NULL` constraint and is omitted otherwise.
 */
export type CommonColumnProps = {
  dims?: number
  not_null?: boolean
}

export type RegularColumn = {
  type: string
} & CommonColumnProps

export type VarcharColumn = {
  type: `varchar`
  max_length?: number
} & CommonColumnProps

export type BpcharColumn = {
  type: `bpchar`
  length?: number
} & CommonColumnProps

export type TimeColumn = {
  type: `time` | `timetz` | `timestamp` | `timestamptz`
  precision?: number
} & CommonColumnProps

export type IntervalColumn = {
  type: `interval`
  fields?:
    | `YEAR`
    | `MONTH`
    | `DAY`
    | `HOUR`
    | `MINUTE`
    | `YEAR TO MONTH`
    | `DAY TO HOUR`
    | `DAY TO MINUTE`
    | `DAY TO SECOND`
    | `HOUR TO MINUTE`
    | `HOUR TO SECOND`
    | `MINUTE TO SECOND`
} & CommonColumnProps

export type IntervalColumnWithPrecision = {
  type: `interval`
  precision?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  fields?: `SECOND`
} & CommonColumnProps

export type BitColumn = {
  type: `bit`
  length: number
} & CommonColumnProps

export type NumericColumn = {
  type: `numeric`
  precision?: number
  scale?: number
} & CommonColumnProps

export type ColumnInfo =
  | RegularColumn
  | VarcharColumn
  | BpcharColumn
  | TimeColumn
  | IntervalColumn
  | IntervalColumnWithPrecision
  | BitColumn
  | NumericColumn

export type Schema = { [key: string]: ColumnInfo }

export type TypedMessages<T extends Row<unknown> = Row> = {
  messages: Array<Message<T>>
  schema: ColumnInfo
}

export type MaybePromise<T> = T | Promise<T>

/**
 * Metadata that allows the consumer to know which changes have been incorporated into this snapshot.
 *
 * For any data that has a known transaction ID `xid` (and e.g. a key that's part of the snapshot):
 * - if `xid` < `xmin` - included, change can be skipped
 * - if `xid` < `xmax` AND `xid` not in `xip` - included, change can be skipped
 * - if `xid` < `xmax` AND `xid` in `xip` - parallel, not included, change must be processed
 * - if `xid` >= `xmax` - not included, change must be processed, and we can stop filtering after we see this
 */
export type SnapshotMetadata = {
  /** Random number that's reflected in the `snapshot_mark` header on the snapshot items. */
  snapshot_mark: number
  database_lsn: string
} & PostgresSnapshot
