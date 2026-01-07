import { RJSFSchema, StrictRJSFSchema } from './types.js';
/** Returns the constant value from the schema when it is either a single value enum or has a const key. Otherwise
 * throws an error.
 *
 * @param schema - The schema from which to obtain the constant value
 * @returns - The constant value for the schema
 * @throws - Error when the schema does not have a constant value
 */
export default function toConstant<S extends StrictRJSFSchema = RJSFSchema>(schema: S): import("json-schema").JSONSchema7Type | undefined;
