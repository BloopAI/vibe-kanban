/**
 * Serialize values for Electric SQL subset parameters.
 *
 * IMPORTANT: Electric expects RAW values, NOT SQL-formatted literals.
 * Electric handles all type casting and escaping on the server side.
 * The params Record<string, string> contains the actual values as strings,
 * and Electric will parse/cast them based on the column type in the WHERE clause.
 *
 * @param value - The value to serialize
 * @returns The raw value as a string (no SQL formatting/quoting)
 */
export function serialize(value: unknown): string {
  // Handle null/undefined - return empty string
  // Electric interprets empty string as NULL in typed column context
  if (value === null || value === undefined) {
    return ``
  }

  // Handle strings - return as-is (NO quotes, Electric handles escaping)
  if (typeof value === `string`) {
    return value
  }

  // Handle numbers - convert to string
  if (typeof value === `number`) {
    return value.toString()
  }

  // Handle bigints - convert to string
  if (typeof value === `bigint`) {
    return value.toString()
  }

  // Handle booleans - return as lowercase string
  if (typeof value === `boolean`) {
    return value ? `true` : `false`
  }

  // Handle dates - return ISO format (NO quotes)
  if (value instanceof Date) {
    return value.toISOString()
  }

  // Handle arrays - for = ANY() operator, serialize as Postgres array literal
  // Format: {val1,val2,val3} with proper escaping
  if (Array.isArray(value)) {
    // Postgres array literal format uses curly braces
    const elements = value.map((item) => {
      if (item === null || item === undefined) {
        return `NULL`
      }
      if (typeof item === `string`) {
        // Escape quotes and backslashes for Postgres array literals
        const escaped = item.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`)
        return `"${escaped}"`
      }
      return serialize(item)
    })
    return `{${elements.join(`,`)}}`
  }

  // Safely stringify the value for the error message
  // JSON.stringify can't handle BigInt and other types, so we use a try-catch
  let valueStr: string
  try {
    valueStr = JSON.stringify(value)
  } catch {
    valueStr = String(value)
  }
  throw new Error(`Cannot serialize value: ${valueStr}`)
}
