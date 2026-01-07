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
export declare function serialize(value: unknown): string;
