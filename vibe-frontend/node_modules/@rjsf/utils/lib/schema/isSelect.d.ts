import { FormContextType, RJSFSchema, StrictRJSFSchema, ValidatorType, Experimental_CustomMergeAllOf } from '../types.js';
/** Checks to see if the `schema` combination represents a select
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param theSchema - The schema for which check for a select flag is desired
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - True if schema contains a select, otherwise false
 */
export default function isSelect<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(validator: ValidatorType<T, S, F>, theSchema: S, rootSchema?: S, experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>): boolean;
