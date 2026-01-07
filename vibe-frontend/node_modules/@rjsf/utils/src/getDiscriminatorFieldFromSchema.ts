import get from 'lodash/get';
import isString from 'lodash/isString';

import { RJSFSchema, StrictRJSFSchema } from './types';
import { DISCRIMINATOR_PATH } from './constants';

/** Returns the `discriminator.propertyName` when defined in the `schema` if it is a string. A warning is generated when
 * it is not a string. Returns `undefined` when a valid discriminator is not present.
 *
 * @param schema - The schema from which the discriminator is potentially obtained
 * @returns - The `discriminator.propertyName` if it exists in the schema, otherwise `undefined`
 */
export default function getDiscriminatorFieldFromSchema<S extends StrictRJSFSchema = RJSFSchema>(schema: S) {
  let discriminator: string | undefined;
  const maybeString = get(schema, DISCRIMINATOR_PATH);
  if (isString(maybeString)) {
    discriminator = maybeString;
  } else if (maybeString !== undefined) {
    console.warn(`Expecting discriminator to be a string, got "${typeof maybeString}" instead`);
  }
  return discriminator;
}
