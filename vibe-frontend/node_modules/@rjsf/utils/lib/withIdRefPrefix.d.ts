import { RJSFSchema, StrictRJSFSchema } from './types.js';
/** Recursively prefixes all `$ref`s in a schema with the value of the `ROOT_SCHEMA_PREFIX` constant.
 * This is used in isValid to make references to the rootSchema
 *
 * @param schemaNode - The object node to which a ROOT_SCHEMA_PREFIX is added when a REF_KEY is part of it
 * @returns - A copy of the `schemaNode` with updated `$ref`s
 */
export default function withIdRefPrefix<S extends StrictRJSFSchema = RJSFSchema>(schemaNode: S | S[] | S[keyof S]): S | S[] | S[keyof S];
