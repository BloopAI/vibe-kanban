import { RJSFSchema, StrictRJSFSchema } from './types.js';
/** This function checks if the given `schema` matches a single constant value. This happens when either the schema has
 * an `enum` array with a single value or there is a `const` defined.
 *
 * @param schema - The schema for a field
 * @returns - True if the `schema` has a single constant value, false otherwise
 */
export default function isConstant<S extends StrictRJSFSchema = RJSFSchema>(schema: S): boolean;
