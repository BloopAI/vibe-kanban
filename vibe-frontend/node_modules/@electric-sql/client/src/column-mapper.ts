import { Schema } from './types'

type DbColumnName = string
type AppColumnName = string

/**
 * Quote a PostgreSQL identifier for safe use in query parameters.
 *
 * Wraps the identifier in double quotes and escapes any internal
 * double quotes by doubling them. This ensures identifiers with
 * special characters (commas, spaces, etc.) are handled correctly.
 *
 * @param identifier - The identifier to quote
 * @returns The quoted identifier
 *
 * @example
 * ```typescript
 * quoteIdentifier('user_id')        // '"user_id"'
 * quoteIdentifier('foo,bar')        // '"foo,bar"'
 * quoteIdentifier('has"quote')      // '"has""quote"'
 * ```
 *
 * @internal
 */
export function quoteIdentifier(identifier: string): string {
  // Escape internal double quotes by doubling them
  const escaped = identifier.replace(/"/g, `""`)
  return `"${escaped}"`
}

/**
 * A bidirectional column mapper that handles transforming column **names**
 * between database format (e.g., snake_case) and application format (e.g., camelCase).
 *
 * **Important**: ColumnMapper only transforms column names, not column values or types.
 * For type conversions (e.g., string → Date), use the `parser` option.
 * For value transformations (e.g., encryption), use the `transformer` option.
 *
 * @example
 * ```typescript
 * const mapper = snakeCamelMapper()
 * mapper.decode('user_id') // 'userId'
 * mapper.encode('userId') // 'user_id'
 * ```
 */
export interface ColumnMapper {
  /**
   * Transform a column name from database format to application format.
   * Applied to column names in query results.
   */
  decode: (dbColumnName: DbColumnName) => AppColumnName

  /**
   * Transform a column name from application format to database format.
   * Applied to column names in WHERE clauses and other query parameters.
   */
  encode: (appColumnName: AppColumnName) => DbColumnName
}

/**
 * Converts a snake_case string to camelCase.
 *
 * Handles edge cases:
 * - Preserves leading underscores: `_user_id` → `_userId`
 * - Preserves trailing underscores: `user_id_` → `userId_`
 * - Collapses multiple underscores: `user__id` → `userId`
 * - Normalizes to lowercase first: `user_Column` → `userColumn`
 *
 * @example
 * snakeToCamel('user_id') // 'userId'
 * snakeToCamel('project_id') // 'projectId'
 * snakeToCamel('created_at') // 'createdAt'
 * snakeToCamel('_private') // '_private'
 * snakeToCamel('user__id') // 'userId'
 * snakeToCamel('user_id_') // 'userId_'
 */
export function snakeToCamel(str: string): string {
  // Preserve leading underscores
  const leadingUnderscores = str.match(/^_+/)?.[0] ?? ``
  const withoutLeading = str.slice(leadingUnderscores.length)

  // Preserve trailing underscores for round-trip safety
  const trailingUnderscores = withoutLeading.match(/_+$/)?.[0] ?? ``
  const core = trailingUnderscores
    ? withoutLeading.slice(
        0,
        withoutLeading.length - trailingUnderscores.length
      )
    : withoutLeading

  // Convert to lowercase
  const normalized = core.toLowerCase()

  // Convert snake_case to camelCase (handling multiple underscores)
  const camelCased = normalized.replace(/_+([a-z])/g, (_, letter) =>
    letter.toUpperCase()
  )

  return leadingUnderscores + camelCased + trailingUnderscores
}

/**
 * Converts a camelCase string to snake_case.
 *
 * Handles consecutive capitals (acronyms) properly:
 * - `userID` → `user_id`
 * - `userHTTPSURL` → `user_https_url`
 *
 * @example
 * camelToSnake('userId') // 'user_id'
 * camelToSnake('projectId') // 'project_id'
 * camelToSnake('createdAt') // 'created_at'
 * camelToSnake('userID') // 'user_id'
 * camelToSnake('parseHTMLString') // 'parse_html_string'
 */
export function camelToSnake(str: string): string {
  return (
    str
      // Insert underscore before uppercase letters that follow lowercase letters
      // e.g., userId -> user_Id
      .replace(/([a-z])([A-Z])/g, `$1_$2`)
      // Insert underscore before uppercase letters that are followed by lowercase letters
      // This handles acronyms: userID -> user_ID, but parseHTMLString -> parse_HTML_String
      .replace(/([A-Z]+)([A-Z][a-z])/g, `$1_$2`)
      .toLowerCase()
  )
}

/**
 * Creates a column mapper from an explicit mapping of database columns to application columns.
 *
 * @param mapping - Object mapping database column names (keys) to application column names (values)
 * @returns A ColumnMapper that can encode and decode column names bidirectionally
 *
 * @example
 * const mapper = createColumnMapper({
 *   user_id: 'userId',
 *   project_id: 'projectId',
 *   created_at: 'createdAt'
 * })
 *
 * // Use with ShapeStream
 * const stream = new ShapeStream({
 *   url: 'http://localhost:3000/v1/shape',
 *   params: { table: 'todos' },
 *   columnMapper: mapper
 * })
 */
export function createColumnMapper(
  mapping: Record<string, string>
): ColumnMapper {
  // Build reverse mapping: app name -> db name
  const reverseMapping: Record<string, string> = {}
  for (const [dbName, appName] of Object.entries(mapping)) {
    reverseMapping[appName] = dbName
  }

  return {
    decode: (dbColumnName: string) => {
      return mapping[dbColumnName] ?? dbColumnName
    },

    encode: (appColumnName: string) => {
      return reverseMapping[appColumnName] ?? appColumnName
    },
  }
}

/**
 * Encodes column names in a WHERE clause using the provided encoder function.
 * Uses regex to identify column references and replace them.
 *
 * Handles common SQL patterns:
 * - Simple comparisons: columnName = $1
 * - Function calls: LOWER(columnName)
 * - Qualified names: table.columnName
 * - Operators: columnName IS NULL, columnName IN (...)
 * - Quoted strings: Preserves string literals unchanged
 *
 * Note: This uses regex-based replacement which works for most common cases
 * but may not handle all complex SQL expressions perfectly. For complex queries,
 * test thoroughly or use database column names directly in WHERE clauses.
 *
 * @param whereClause - The WHERE clause string to encode
 * @param encode - Optional encoder function. If undefined, returns whereClause unchanged.
 * @returns The encoded WHERE clause
 *
 * @internal
 */
export function encodeWhereClause(
  whereClause: string | undefined,
  encode?: (columnName: string) => string
): string {
  if (!whereClause || !encode) return whereClause ?? ``

  // SQL keywords that should not be transformed (common ones)
  const sqlKeywords = new Set([
    `SELECT`,
    `FROM`,
    `WHERE`,
    `AND`,
    `OR`,
    `NOT`,
    `IN`,
    `IS`,
    `NULL`,
    `NULLS`,
    `FIRST`,
    `LAST`,
    `TRUE`,
    `FALSE`,
    `LIKE`,
    `ILIKE`,
    `BETWEEN`,
    `ASC`,
    `DESC`,
    `LIMIT`,
    `OFFSET`,
    `ORDER`,
    `BY`,
    `GROUP`,
    `HAVING`,
    `DISTINCT`,
    `AS`,
    `ON`,
    `JOIN`,
    `LEFT`,
    `RIGHT`,
    `INNER`,
    `OUTER`,
    `CROSS`,
    `CASE`,
    `WHEN`,
    `THEN`,
    `ELSE`,
    `END`,
    `CAST`,
    `LOWER`,
    `UPPER`,
    `COALESCE`,
    `NULLIF`,
  ])

  // Track positions of quoted strings and double-quoted identifiers to skip them
  const quotedRanges: Array<{ start: number; end: number }> = []

  // Find all single-quoted strings and double-quoted identifiers
  let pos = 0
  while (pos < whereClause.length) {
    const ch = whereClause[pos]
    if (ch === `'` || ch === `"`) {
      const start = pos
      const quoteChar = ch
      pos++ // Skip opening quote
      // Find closing quote, handling escaped quotes ('' or "")
      while (pos < whereClause.length) {
        if (whereClause[pos] === quoteChar) {
          if (whereClause[pos + 1] === quoteChar) {
            pos += 2 // Skip escaped quote
          } else {
            pos++ // Skip closing quote
            break
          }
        } else {
          pos++
        }
      }
      quotedRanges.push({ start, end: pos })
    } else {
      pos++
    }
  }

  // Helper to check if position is within a quoted string or double-quoted identifier
  const isInQuotedString = (pos: number): boolean => {
    return quotedRanges.some((range) => pos >= range.start && pos < range.end)
  }

  // Pattern explanation:
  // (?<![a-zA-Z0-9_]) - negative lookbehind: not preceded by identifier char
  // ([a-zA-Z_][a-zA-Z0-9_]*) - capture: valid SQL identifier
  // (?![a-zA-Z0-9_]) - negative lookahead: not followed by identifier char
  //
  // This avoids matching:
  // - Parts of longer identifiers
  // - SQL keywords (handled by checking if result differs from input)
  const identifierPattern =
    /(?<![a-zA-Z0-9_])([a-zA-Z_][a-zA-Z0-9_]*)(?![a-zA-Z0-9_])/g

  return whereClause.replace(identifierPattern, (match, _p1, offset) => {
    // Don't transform if inside quoted string
    if (isInQuotedString(offset)) {
      return match
    }

    // Don't transform SQL keywords
    if (sqlKeywords.has(match.toUpperCase())) {
      return match
    }

    // Don't transform parameter placeholders ($1, $2, etc.)
    // This regex won't match them anyway, but being explicit
    if (match.startsWith(`$`)) {
      return match
    }

    // Apply encoding
    const encoded = encode(match)
    return encoded
  })
}

/**
 * Creates a column mapper that automatically converts between snake_case and camelCase.
 * This is the most common use case for column mapping.
 *
 * When a schema is provided, it will only map columns that exist in the schema.
 * Otherwise, it will map any column name it encounters.
 *
 * **⚠️ Limitations and Edge Cases:**
 * - **WHERE clause encoding**: Uses regex-based parsing which may not handle all complex
 *   SQL expressions. Test thoroughly with your queries, especially those with:
 *   - Complex nested expressions
 *   - Custom operators or functions
 *   - Column names that conflict with SQL keywords
 *   - Quoted identifiers (e.g., `"$price"`, `"user-id"`) - not supported
 *   - Column names with special characters (non-alphanumeric except underscore)
 * - **Acronym ambiguity**: `userID` → `user_id` → `userId` (ID becomes Id after roundtrip)
 *   Use `createColumnMapper()` with explicit mapping if you need exact control
 * - **Type conversion**: This only renames columns, not values. Use `parser` for type conversion
 *
 * **When to use explicit mapping instead:**
 * - You have column names that don't follow snake_case/camelCase patterns
 * - You need exact control over mappings (e.g., `id` → `identifier`)
 * - Your WHERE clauses are complex and automatic encoding fails
 * - You have quoted identifiers or column names with special characters
 *
 * @param schema - Optional database schema to constrain mapping to known columns
 * @returns A ColumnMapper for snake_case ↔ camelCase conversion
 *
 * @example
 * // Basic usage
 * const mapper = snakeCamelMapper()
 *
 * // With schema - only maps columns in schema (recommended)
 * const mapper = snakeCamelMapper(schema)
 *
 * // Use with ShapeStream
 * const stream = new ShapeStream({
 *   url: 'http://localhost:3000/v1/shape',
 *   params: { table: 'todos' },
 *   columnMapper: snakeCamelMapper()
 * })
 *
 * @example
 * // If automatic encoding fails, fall back to manual column names in WHERE clauses:
 * stream.requestSnapshot({
 *   where: "user_id = $1", // Use database column names directly if needed
 *   params: { "1": "123" }
 * })
 */
export function snakeCamelMapper(schema?: Schema): ColumnMapper {
  // If schema provided, build explicit mapping
  if (schema) {
    const mapping: Record<string, string> = {}
    for (const dbColumn of Object.keys(schema)) {
      mapping[dbColumn] = snakeToCamel(dbColumn)
    }
    return createColumnMapper(mapping)
  }

  // Otherwise, map dynamically
  return {
    decode: (dbColumnName: string) => {
      return snakeToCamel(dbColumnName)
    },

    encode: (appColumnName: string) => {
      return camelToSnake(appColumnName)
    },
  }
}
