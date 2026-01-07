import { AnyFieldMeta, AnyFieldMetaBase } from './FieldApi.cjs';
import { DeepKeys, DeepKeysOfType, DeepValue } from './util-types.cjs';
import { Updater } from './utils.cjs';
export type ValidationError = unknown;
export type ValidationSource = 'form' | 'field';
/**
 * "server" is only intended for SSR/SSG validation and should not execute anything
 * @private
 */
export type ValidationCause = 'change' | 'blur' | 'submit' | 'mount' | 'server' | 'dynamic';
/**
 * @private
 */
export type ListenerCause = 'change' | 'blur' | 'submit' | 'mount';
/**
 * @private
 */
export type ValidationErrorMapKeys = `on${Capitalize<ValidationCause>}`;
/**
 * @private
 */
export type ValidationErrorMap<TOnMountReturn = unknown, TOnChangeReturn = unknown, TOnChangeAsyncReturn = unknown, TOnBlurReturn = unknown, TOnBlurAsyncReturn = unknown, TOnSubmitReturn = unknown, TOnSubmitAsyncReturn = unknown, TOnDynamicReturn = unknown, TOnDynamicAsyncReturn = unknown, TOnServerReturn = unknown> = {
    onMount?: TOnMountReturn;
    onChange?: TOnChangeReturn | TOnChangeAsyncReturn;
    onBlur?: TOnBlurReturn | TOnBlurAsyncReturn;
    onSubmit?: TOnSubmitReturn | TOnSubmitAsyncReturn;
    onDynamic?: TOnDynamicReturn | TOnDynamicAsyncReturn;
    onServer?: TOnServerReturn;
};
/**
 * @private allows tracking the source of the errors in the error map
 */
export type ValidationErrorMapSource = {
    onMount?: ValidationSource;
    onChange?: ValidationSource;
    onBlur?: ValidationSource;
    onSubmit?: ValidationSource;
    onServer?: ValidationSource;
    onDynamic?: ValidationSource;
};
/**
 * @private
 */
export type FormValidationErrorMap<TFormData = unknown, TOnMountReturn = unknown, TOnChangeReturn = unknown, TOnChangeAsyncReturn = unknown, TOnBlurReturn = unknown, TOnBlurAsyncReturn = unknown, TOnSubmitReturn = unknown, TOnSubmitAsyncReturn = unknown, TOnDynamicReturn = unknown, TOnDynamicAsyncReturn = unknown, TOnServerReturn = unknown> = {
    onMount?: TOnMountReturn | GlobalFormValidationError<TFormData>;
    onChange?: TOnChangeReturn | TOnChangeAsyncReturn | GlobalFormValidationError<TFormData>;
    onBlur?: TOnBlurReturn | TOnBlurAsyncReturn | GlobalFormValidationError<TFormData>;
    onSubmit?: TOnSubmitReturn | TOnSubmitAsyncReturn | GlobalFormValidationError<TFormData>;
    onDynamic?: TOnDynamicReturn | TOnDynamicAsyncReturn | GlobalFormValidationError<TFormData>;
    onServer?: TOnServerReturn;
};
export type FormValidationError<TFormData> = ValidationError | GlobalFormValidationError<TFormData>;
/**
 * @private
 *
 * @example
 * ```tsx
 * {
 *   form: 'This form contains an error',
 *   fields: {
 *     age: "Must be 13 or older to register"
 *   }
 * }
 * ````
 */
export type GlobalFormValidationError<TFormData> = {
    form?: ValidationError;
    fields: Partial<Record<DeepKeys<TFormData>, ValidationError>>;
};
export type ExtractGlobalFormError<TFormError> = TFormError extends GlobalFormValidationError<any> ? TFormError['form'] : TFormError;
/**
 * @private
 */
export interface UpdateMetaOptions {
    /**
     * @default false
     */
    dontUpdateMeta?: boolean;
    /**
     * @default false
     */
    dontValidate?: boolean;
    /**
     * @default false
     */
    dontRunListeners?: boolean;
}
/**
 * @private
 * A list of field manipulation methods that a form-like API must implement.
 */
export interface FieldManipulator<TFormData, TSubmitMeta> {
    /**
     * Validates all fields using the correct handlers for a given validation cause.
     */
    validateAllFields: (cause: ValidationCause) => Promise<unknown[]>;
    /**
     * Validates the children of a specified array in the form starting from a given index until the end using the correct handlers for a given validation type.
     */
    validateArrayFieldsStartingFrom: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index: number, cause: ValidationCause) => Promise<unknown[]>;
    /**
     * Validates a specified field in the form using the correct handlers for a given validation type.
     */
    validateField: <TField extends DeepKeys<TFormData>>(field: TField, cause: ValidationCause) => unknown[] | Promise<unknown[]>;
    /**
     * Handles the form submission, performs validation, and calls the appropriate onSubmit or onSubmitInvalid callbacks.
     */
    handleSubmit(): Promise<void>;
    handleSubmit(submitMeta: TSubmitMeta): Promise<void>;
    /**
     * Gets the value of the specified field.
     */
    getFieldValue: <TField extends DeepKeys<TFormData>>(field: TField) => DeepValue<TFormData, TField>;
    /**
     * Gets the metadata of the specified field.
     */
    getFieldMeta: <TField extends DeepKeys<TFormData>>(field: TField) => AnyFieldMeta | undefined;
    /**
     * Updates the metadata of the specified field.
     */
    setFieldMeta: <TField extends DeepKeys<TFormData>>(field: TField, updater: Updater<AnyFieldMetaBase>) => void;
    /**
     * Sets the value of the specified field and optionally updates the touched state.
     */
    setFieldValue: <TField extends DeepKeys<TFormData>>(field: TField, updater: Updater<DeepValue<TFormData, TField>>, opts?: UpdateMetaOptions) => void;
    /**
     * Delete the specified field. Also deletes all subfields if there are any.
     */
    deleteField: <TField extends DeepKeys<TFormData>>(field: TField) => void;
    /**
     * Pushes a value into an array field.
     */
    pushFieldValue: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, value: DeepValue<TFormData, TField> extends any[] ? DeepValue<TFormData, TField>[number] : never, opts?: UpdateMetaOptions) => void;
    /**
     * Insert a value into an array field at the specified index.
     */
    insertFieldValue: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index: number, value: DeepValue<TFormData, TField> extends any[] ? DeepValue<TFormData, TField>[number] : never, opts?: UpdateMetaOptions) => Promise<void>;
    /**
     * Replaces a value into an array field at the specified index.
     */
    replaceFieldValue: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index: number, value: DeepValue<TFormData, TField> extends any[] ? DeepValue<TFormData, TField>[number] : never, opts?: UpdateMetaOptions) => Promise<void>;
    /**
     * Removes a value from an array field at the specified index.
     */
    removeFieldValue: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index: number, opts?: UpdateMetaOptions) => Promise<void>;
    /**
     * Swaps the values at the specified indices within an array field.
     */
    swapFieldValues: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index1: number, index2: number, opts?: UpdateMetaOptions) => void;
    /**
     * Moves the value at the first specified index to the second specified index within an array field.
     */
    moveFieldValues: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index1: number, index2: number, opts?: UpdateMetaOptions) => void;
    /**
     * Clear all values within an array field.
     */
    clearFieldValues: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, opts?: UpdateMetaOptions) => void;
    /**
     * Resets the field value and meta to default state
     */
    resetField: <TField extends DeepKeys<TFormData>>(field: TField) => void;
}
