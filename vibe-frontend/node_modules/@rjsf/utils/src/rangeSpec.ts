import { RangeSpecType, StrictRJSFSchema } from './types';
import { RJSFSchema } from './types';

/** Extracts the range spec information `{ step?: number, min?: number, max?: number }` that can be spread onto an HTML
 * input from the range analog in the schema `{ multipleOf?: number, minimum?: number, maximum?: number }`.
 *
 * @param schema - The schema from which to extract the range spec
 * @returns - A range specification from the schema
 */
export default function rangeSpec<S extends StrictRJSFSchema = RJSFSchema>(schema: S) {
  const spec: RangeSpecType = {};
  if (schema.multipleOf) {
    spec.step = schema.multipleOf;
  }
  if (schema.minimum || schema.minimum === 0) {
    spec.min = schema.minimum;
  }
  if (schema.maximum || schema.maximum === 0) {
    spec.max = schema.maximum;
  }
  return spec;
}
