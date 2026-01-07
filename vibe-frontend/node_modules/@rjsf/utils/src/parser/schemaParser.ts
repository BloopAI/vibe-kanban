import forEach from 'lodash/forEach';

import { FormContextType, RJSFSchema, StrictRJSFSchema } from '../types';
import { ITEMS_KEY, PROPERTIES_KEY } from '../constants';
import ParserValidator, { SchemaMap } from './ParserValidator';
import { resolveAnyOrOneOfSchemas, retrieveSchemaInternal } from '../schema/retrieveSchema';
import deepEquals from '../deepEquals';

/** Recursive function used to parse the given `schema` belonging to the `rootSchema`. The `validator` is used to
 * capture the sub-schemas that the `isValid()` function is called with. For each schema returned by the
 * `retrieveSchemaInternal()`, the `resolveAnyOrOneOfSchemas()` function is called. For each of the schemas returned
 * from THAT call have `properties`, then each of the sub-schema property objects are then recursively parsed.
 *
 * @param validator - The `ParserValidator` implementation used to capture `isValid()` calls during parsing
 * @param recurseList - The list of schemas returned from the `retrieveSchemaInternal`, preventing infinite recursion
 * @param rootSchema - The root schema from which the schema parsing began
 * @param schema - The current schema element being parsed
 */
function parseSchema<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ParserValidator<T, S, F>,
  recurseList: S[],
  rootSchema: S,
  schema: S,
) {
  const schemas = retrieveSchemaInternal<T, S, F>(validator, schema, rootSchema, undefined, true);
  schemas.forEach((schema) => {
    const sameSchemaIndex = recurseList.findIndex((item) => deepEquals(item, schema));
    if (sameSchemaIndex === -1) {
      recurseList.push(schema);
      const allOptions = resolveAnyOrOneOfSchemas<T, S, F>(validator, schema, rootSchema, true);
      allOptions.forEach((s) => {
        if (PROPERTIES_KEY in s && s[PROPERTIES_KEY]) {
          forEach(schema[PROPERTIES_KEY], (value) => {
            parseSchema<T, S, F>(validator, recurseList, rootSchema, value as S);
          });
        }
      });
      if (ITEMS_KEY in schema && !Array.isArray(schema.items) && typeof schema.items !== 'boolean') {
        parseSchema<T, S, F>(validator, recurseList, rootSchema, schema.items as S);
      }
    }
  });
}

/** Parses the given `rootSchema` to extract out all the sub-schemas that maybe contained within it. Returns a map of
 * the hash of the schema to schema/sub-schema.
 *
 * @param rootSchema - The root schema to parse for sub-schemas used by `isValid()` calls
 * @returns - The `SchemaMap` of all schemas that were parsed
 */
export default function schemaParser<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  rootSchema: S,
): SchemaMap<S> {
  const validator = new ParserValidator<T, S, F>(rootSchema);
  const recurseList: S[] = [];

  parseSchema(validator, recurseList, rootSchema, rootSchema);

  return validator.getSchemaMap();
}
