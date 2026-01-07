import { Experimental_CustomMergeAllOf, FormContextType, RJSFSchema, SchemaUtilsType, StrictRJSFSchema, ValidatorType } from './types.js';
/** Creates a `SchemaUtilsType` interface that is based around the given `validator` and `rootSchema` parameters. The
 * resulting interface implementation will forward the `validator` and `rootSchema` to all the wrapped APIs.
 *
 * @param validator - an implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param [experimental_defaultFormStateBehavior] Optional configuration object, if provided, allows users to override default form state behavior
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - An implementation of a `SchemaUtilsType` interface
 */
export default function createSchemaUtils<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(validator: ValidatorType<T, S, F>, rootSchema: S, experimental_defaultFormStateBehavior?: {}, experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>): SchemaUtilsType<T, S, F>;
