import { ErrorObject } from 'ajv';
import { CustomValidator, ErrorTransformer, FormContextType, RJSFSchema, RJSFValidationError, StrictRJSFSchema, UiSchema, ValidatorType } from '@rjsf/utils';
export type RawValidationErrorsType<Result = any> = {
    errors?: Result[];
    validationError?: Error;
};
/** Transforming the error output from ajv to format used by @rjsf/utils.
 * At some point, components should be updated to support ajv.
 *
 * @param errors - The list of AJV errors to convert to `RJSFValidationErrors`
 * @param [uiSchema] - An optional uiSchema that is passed to `transformErrors` and `customValidate`
 */
export declare function transformRJSFValidationErrors<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(errors?: ErrorObject[], uiSchema?: UiSchema<T, S, F>): RJSFValidationError[];
/** This function processes the `formData` with an optional user contributed `customValidate` function, which receives
 * the form data and a `errorHandler` function that will be used to add custom validation errors for each field. Also
 * supports a `transformErrors` function that will take the raw AJV validation errors, prior to custom validation and
 * transform them in what ever way it chooses.
 *
 * @param validator - The `ValidatorType` implementation used for the `getDefaultFormState()` call
 * @param rawErrors - The list of raw `ErrorObject`s to process
 * @param formData - The form data to validate
 * @param schema - The schema against which to validate the form data
 * @param [customValidate] - An optional function that is used to perform custom validation
 * @param [transformErrors] - An optional function that is used to transform errors after AJV validation
 * @param [uiSchema] - An optional uiSchema that is passed to `transformErrors` and `customValidate`
 */
export default function processRawValidationErrors<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(validator: ValidatorType<T, S, F>, rawErrors: RawValidationErrorsType<ErrorObject>, formData: T | undefined, schema: S, customValidate?: CustomValidator<T, S, F>, transformErrors?: ErrorTransformer<T, S, F>, uiSchema?: UiSchema<T, S, F>): {
    errors: RJSFValidationError[];
    errorSchema: import("@rjsf/utils").ErrorSchema<T>;
};
