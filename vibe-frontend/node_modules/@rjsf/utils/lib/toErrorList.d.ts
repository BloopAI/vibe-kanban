import { ErrorSchema, RJSFValidationError } from './types.js';
/** Converts an `errorSchema` into a list of `RJSFValidationErrors`
 *
 * @param errorSchema - The `ErrorSchema` instance to convert
 * @param [fieldPath=[]] - The current field path, defaults to [] if not specified
 * @returns - The list of `RJSFValidationErrors` extracted from the `errorSchema`
 */
export default function toErrorList<T = any>(errorSchema?: ErrorSchema<T>, fieldPath?: string[]): RJSFValidationError[];
