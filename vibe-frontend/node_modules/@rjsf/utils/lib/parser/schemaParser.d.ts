import { FormContextType, RJSFSchema, StrictRJSFSchema } from '../types.js';
import { SchemaMap } from './ParserValidator.js';
/** Parses the given `rootSchema` to extract out all the sub-schemas that maybe contained within it. Returns a map of
 * the hash of the schema to schema/sub-schema.
 *
 * @param rootSchema - The root schema to parse for sub-schemas used by `isValid()` calls
 * @returns - The `SchemaMap` of all schemas that were parsed
 */
export default function schemaParser<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(rootSchema: S): SchemaMap<S>;
