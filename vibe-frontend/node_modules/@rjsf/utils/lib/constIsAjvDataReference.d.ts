import { RJSFSchema, StrictRJSFSchema } from './types.js';
/**
 * Checks if the schema const property value is an AJV $data reference
 * and the current schema is not an object or array
 *
 * @param schema - The schema to check if the const is an AJV $data reference
 * @returns - true if the schema const property value is an AJV $data reference otherwise false.
 */
export default function constIsAjvDataReference<S extends StrictRJSFSchema = RJSFSchema>(schema: S): boolean;
