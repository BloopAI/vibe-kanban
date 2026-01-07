import { FormValidation } from './types.js';
/** Given a `formData` object, recursively creates a `FormValidation` error handling structure around it
 *
 * @param formData - The form data around which the error handler is created
 * @returns - A `FormValidation` object based on the `formData` structure
 */
export default function createErrorHandler<T = any>(formData: T): FormValidation<T>;
