import { CONST_KEY, getSchemaType, isObject } from './';
import { RJSFSchema, StrictRJSFSchema } from './types';
import { JSONSchema7Type } from 'json-schema';
import isString from 'lodash/isString';

/**
 * Checks if the schema const property value is an AJV $data reference
 * and the current schema is not an object or array
 *
 * @param schema - The schema to check if the const is an AJV $data reference
 * @returns - true if the schema const property value is an AJV $data reference otherwise false.
 */
export default function constIsAjvDataReference<S extends StrictRJSFSchema = RJSFSchema>(schema: S): boolean {
  const schemaConst = schema[CONST_KEY] as JSONSchema7Type & { $data: string };
  const schemaType = getSchemaType<S>(schema);
  return isObject(schemaConst) && isString(schemaConst?.$data) && schemaType !== 'object' && schemaType !== 'array';
}
