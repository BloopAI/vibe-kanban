import { RJSFSchema, StrictRJSFSchema } from './types.js';
/** Checks the schema to see if it is allowing additional items, by verifying that `schema.additionalItems` is an
 * object. The user is warned in the console if `schema.additionalItems` has the value `true`.
 *
 * @param schema - The schema object to check
 * @returns - True if additional items is allowed, otherwise false
 */
export default function allowAdditionalItems<S extends StrictRJSFSchema = RJSFSchema>(schema: S): boolean;
