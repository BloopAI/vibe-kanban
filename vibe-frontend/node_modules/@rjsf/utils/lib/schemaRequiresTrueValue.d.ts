import { RJSFSchema, StrictRJSFSchema } from './types.js';
/** Check to see if a `schema` specifies that a value must be true. This happens when:
 * - `schema.const` is truthy
 * - `schema.enum` == `[true]`
 * - `schema.anyOf` or `schema.oneOf` has a single value which recursively returns true
 * - `schema.allOf` has at least one value which recursively returns true
 *
 * @param schema - The schema to check
 * @returns - True if the schema specifies a value that must be true, false otherwise
 */
export default function schemaRequiresTrueValue<S extends StrictRJSFSchema = RJSFSchema>(schema: S): boolean;
