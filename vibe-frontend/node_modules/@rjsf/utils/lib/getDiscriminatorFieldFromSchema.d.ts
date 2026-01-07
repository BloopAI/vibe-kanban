import { RJSFSchema, StrictRJSFSchema } from './types.js';
/** Returns the `discriminator.propertyName` when defined in the `schema` if it is a string. A warning is generated when
 * it is not a string. Returns `undefined` when a valid discriminator is not present.
 *
 * @param schema - The schema from which the discriminator is potentially obtained
 * @returns - The `discriminator.propertyName` if it exists in the schema, otherwise `undefined`
 */
export default function getDiscriminatorFieldFromSchema<S extends StrictRJSFSchema = RJSFSchema>(schema: S): string | undefined;
