import { Experimental_CustomMergeAllOf, FormContextType, PathSchema, RJSFSchema, StrictRJSFSchema, ValidatorType } from '../types.js';
/** Generates an `PathSchema` object for the `schema`, recursively
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param schema - The schema for which the `PathSchema` is desired
 * @param [name=''] - The base name for the schema
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s
 * @param [formData] - The current formData, if any, to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The `PathSchema` object for the `schema`
 */
export default function toPathSchema<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(validator: ValidatorType<T, S, F>, schema: S, name?: string, rootSchema?: S, formData?: T, experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>): PathSchema<T>;
