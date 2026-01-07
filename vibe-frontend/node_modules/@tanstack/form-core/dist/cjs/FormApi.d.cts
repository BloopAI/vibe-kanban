import { Derived, Store } from '@tanstack/store';
import { ValidationLogicFn } from './ValidationLogic.cjs';
import { StandardSchemaV1, StandardSchemaV1Issue, TStandardSchemaValidatorValue } from './standardSchemaValidator.cjs';
import { AnyFieldApi, AnyFieldMeta, AnyFieldMetaBase, FieldApi } from './FieldApi.cjs';
import { ExtractGlobalFormError, FieldManipulator, FormValidationError, FormValidationErrorMap, ListenerCause, UpdateMetaOptions, ValidationCause, ValidationError, ValidationErrorMap, ValidationErrorMapKeys } from './types.cjs';
import { DeepKeys, DeepKeysOfType, DeepValue } from './util-types.cjs';
import { Updater } from './utils.cjs';
/**
 * @private
 */
type FormErrorMapFromValidator<TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>> = Partial<Record<DeepKeys<TFormData>, ValidationErrorMap<TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync>>>;
export type FormValidateFn<TFormData> = (props: {
    value: TFormData;
    formApi: FormApi<TFormData, any, any, any, any, any, any, any, any, any, any, any>;
}) => unknown;
/**
 * @private
 */
export type FormValidateOrFn<TFormData> = FormValidateFn<TFormData> | StandardSchemaV1<TFormData, unknown>;
export type UnwrapFormValidateOrFn<TValidateOrFn extends undefined | FormValidateOrFn<any>> = [TValidateOrFn] extends [FormValidateFn<any>] ? ExtractGlobalFormError<ReturnType<TValidateOrFn>> : [TValidateOrFn] extends [StandardSchemaV1<any, any>] ? Record<string, StandardSchemaV1Issue[]> : undefined;
/**
 * @private
 */
export type FormValidateAsyncFn<TFormData> = (props: {
    value: TFormData;
    formApi: FormApi<TFormData, any, any, any, any, any, any, any, any, any, any, any>;
    signal: AbortSignal;
}) => unknown | Promise<unknown>;
export type FormValidator<TFormData, TType, TFn = unknown> = {
    validate(options: {
        value: TType;
    }, fn: TFn): ValidationError;
    validateAsync(options: {
        value: TType;
    }, fn: TFn): Promise<FormValidationError<TFormData>>;
};
/**
 * @private
 */
export type FormAsyncValidateOrFn<TFormData> = FormValidateAsyncFn<TFormData> | StandardSchemaV1<TFormData, unknown>;
export type UnwrapFormAsyncValidateOrFn<TValidateOrFn extends undefined | FormAsyncValidateOrFn<any>> = [TValidateOrFn] extends [FormValidateAsyncFn<any>] ? ExtractGlobalFormError<Awaited<ReturnType<TValidateOrFn>>> : [TValidateOrFn] extends [StandardSchemaV1<any, any>] ? Record<string, StandardSchemaV1Issue[]> : undefined;
export interface FormValidators<TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>> {
    /**
     * Optional function that fires as soon as the component mounts.
     */
    onMount?: TOnMount;
    /**
     * Optional function that checks the validity of your data whenever a value changes
     */
    onChange?: TOnChange;
    /**
     * Optional onChange asynchronous counterpart to onChange. Useful for more complex validation logic that might involve server requests.
     */
    onChangeAsync?: TOnChangeAsync;
    /**
     * The default time in milliseconds that if set to a number larger than 0, will debounce the async validation event by this length of time in milliseconds.
     */
    onChangeAsyncDebounceMs?: number;
    /**
     * Optional function that validates the form data when a field loses focus, returns a `FormValidationError`
     */
    onBlur?: TOnBlur;
    /**
     * Optional onBlur asynchronous validation method for when a field loses focus returns a ` FormValidationError` or a promise of `Promise<FormValidationError>`
     */
    onBlurAsync?: TOnBlurAsync;
    /**
     * The default time in milliseconds that if set to a number larger than 0, will debounce the async validation event by this length of time in milliseconds.
     */
    onBlurAsyncDebounceMs?: number;
    onSubmit?: TOnSubmit;
    onSubmitAsync?: TOnSubmitAsync;
    onDynamic?: TOnDynamic;
    onDynamicAsync?: TOnDynamicAsync;
    onDynamicAsyncDebounceMs?: number;
}
/**
 * @private
 */
export interface FormTransform<TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TSubmitMeta = never> {
    fn: (formBase: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>) => FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
    deps: unknown[];
}
export interface FormListeners<TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TSubmitMeta = never> {
    onChange?: (props: {
        formApi: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
        fieldApi: AnyFieldApi;
    }) => void;
    onChangeDebounceMs?: number;
    onBlur?: (props: {
        formApi: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
        fieldApi: AnyFieldApi;
    }) => void;
    onBlurDebounceMs?: number;
    onMount?: (props: {
        formApi: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
    }) => void;
    onSubmit?: (props: {
        formApi: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
        meta: TSubmitMeta;
    }) => void;
}
/**
 * An object representing the base properties of a form, unrelated to any validators
 */
export interface BaseFormOptions<in out TFormData, in out TSubmitMeta = never> {
    /**
     * Set initial values for your form.
     */
    defaultValues?: TFormData;
    /**
     * onSubmitMeta, the data passed from the handleSubmit handler, to the onSubmit function props
     */
    onSubmitMeta?: TSubmitMeta;
}
/**
 * An object representing the options for a form.
 */
export interface FormOptions<in out TFormData, in out TOnMount extends undefined | FormValidateOrFn<TFormData>, in out TOnChange extends undefined | FormValidateOrFn<TFormData>, in out TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnBlur extends undefined | FormValidateOrFn<TFormData>, in out TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnSubmit extends undefined | FormValidateOrFn<TFormData>, in out TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnDynamic extends undefined | FormValidateOrFn<TFormData>, in out TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, in out TSubmitMeta = never> extends BaseFormOptions<TFormData, TSubmitMeta> {
    /**
     * The form name, used for devtools and identification
     */
    formId?: string;
    /**
     * The default state for the form.
     */
    defaultState?: Partial<FormState<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer>>;
    /**
     * If true, always run async validation, even when sync validation has produced an error. Defaults to undefined.
     */
    asyncAlways?: boolean;
    /**
     * Optional time in milliseconds if you want to introduce a delay before firing off an async action.
     */
    asyncDebounceMs?: number;
    /**
     * If true, allows the form to be submitted in an invalid state i.e. canSubmit will remain true regardless of validation errors. Defaults to undefined.
     */
    canSubmitWhenInvalid?: boolean;
    /**
     * A list of validators to pass to the form
     */
    validators?: FormValidators<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync>;
    validationLogic?: ValidationLogicFn;
    /**
     * form level listeners
     */
    listeners?: FormListeners<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
    /**
     * A function to be called when the form is submitted, what should happen once the user submits a valid form returns `any` or a promise `Promise<any>`
     */
    onSubmit?: (props: {
        value: TFormData;
        formApi: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
        meta: TSubmitMeta;
    }) => any | Promise<any>;
    /**
     * Specify an action for scenarios where the user tries to submit an invalid form.
     */
    onSubmitInvalid?: (props: {
        value: TFormData;
        formApi: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
        meta: TSubmitMeta;
    }) => void;
    transform?: FormTransform<NoInfer<TFormData>, NoInfer<TOnMount>, NoInfer<TOnChange>, NoInfer<TOnChangeAsync>, NoInfer<TOnBlur>, NoInfer<TOnBlurAsync>, NoInfer<TOnSubmit>, NoInfer<TOnSubmitAsync>, NoInfer<TOnDynamic>, NoInfer<TOnDynamicAsync>, NoInfer<TOnServer>, NoInfer<TSubmitMeta>>;
}
export type AnyFormOptions = FormOptions<any, any, any, any, any, any, any, any, any, any, any, any>;
/**
 * An object representing the validation metadata for a field. Not intended for public usage.
 */
export type ValidationMeta = {
    /**
     * An abort controller stored in memory to cancel previous async validation attempts.
     */
    lastAbortController: AbortController;
};
/**
 * An object representing the field information for a specific field within the form.
 */
export type FieldInfo<TFormData> = {
    /**
     * An instance of the FieldAPI.
     */
    instance: FieldApi<TFormData, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any> | null;
    /**
     * A record of field validation internal handling.
     */
    validationMetaMap: Record<ValidationErrorMapKeys, ValidationMeta | undefined>;
};
/**
 * An object representing the current state of the form.
 */
export type BaseFormState<in out TFormData, in out TOnMount extends undefined | FormValidateOrFn<TFormData>, in out TOnChange extends undefined | FormValidateOrFn<TFormData>, in out TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnBlur extends undefined | FormValidateOrFn<TFormData>, in out TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnSubmit extends undefined | FormValidateOrFn<TFormData>, in out TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnDynamic extends undefined | FormValidateOrFn<TFormData>, in out TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>> = {
    /**
     * The current values of the form fields.
     */
    values: TFormData;
    /**
     * The error map for the form itself.
     */
    errorMap: ValidationErrorMap<UnwrapFormValidateOrFn<TOnMount>, UnwrapFormValidateOrFn<TOnChange>, UnwrapFormAsyncValidateOrFn<TOnChangeAsync>, UnwrapFormValidateOrFn<TOnBlur>, UnwrapFormAsyncValidateOrFn<TOnBlurAsync>, UnwrapFormValidateOrFn<TOnSubmit>, UnwrapFormAsyncValidateOrFn<TOnSubmitAsync>, UnwrapFormValidateOrFn<TOnDynamic>, UnwrapFormAsyncValidateOrFn<TOnDynamicAsync>, UnwrapFormAsyncValidateOrFn<TOnServer>>;
    /**
     * An internal mechanism used for keeping track of validation logic in a form.
     */
    validationMetaMap: Record<ValidationErrorMapKeys, ValidationMeta | undefined>;
    /**
     * A record of field metadata for each field in the form, not including the derived properties, like `errors` and such
     */
    fieldMetaBase: Partial<Record<DeepKeys<TFormData>, AnyFieldMetaBase>>;
    /**
     * A boolean indicating if the form is currently in the process of being submitted after `handleSubmit` is called.
     *
     * Goes back to `false` when submission completes for one of the following reasons:
     * - the validation step returned errors.
     * - the `onSubmit` function has completed.
     *
     * Note: if you're running async operations in your `onSubmit` function make sure to await them to ensure `isSubmitting` is set to `false` only when the async operation completes.
     *
     * This is useful for displaying loading indicators or disabling form inputs during submission.
     *
     */
    isSubmitting: boolean;
    /**
     * A boolean indicating if the `onSubmit` function has completed successfully.
     *
     * Goes back to `false` at each new submission attempt.
     *
     * Note: you can use isSubmitting to check if the form is currently submitting.
     */
    isSubmitted: boolean;
    /**
     * A boolean indicating if the form or any of its fields are currently validating.
     */
    isValidating: boolean;
    /**
     * A counter for tracking the number of submission attempts.
     */
    submissionAttempts: number;
    /**
     * A boolean indicating if the last submission was successful.
     */
    isSubmitSuccessful: boolean;
    /**
     * @private, used to force a re-evaluation of the form state when options change
     */
    _force_re_eval?: boolean;
};
export type DerivedFormState<in out TFormData, in out TOnMount extends undefined | FormValidateOrFn<TFormData>, in out TOnChange extends undefined | FormValidateOrFn<TFormData>, in out TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnBlur extends undefined | FormValidateOrFn<TFormData>, in out TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnSubmit extends undefined | FormValidateOrFn<TFormData>, in out TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnDynamic extends undefined | FormValidateOrFn<TFormData>, in out TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>> = {
    /**
     * A boolean indicating if the form is currently validating.
     */
    isFormValidating: boolean;
    /**
     * A boolean indicating if the form is valid.
     */
    isFormValid: boolean;
    /**
     * The error array for the form itself.
     */
    errors: Array<UnwrapFormValidateOrFn<TOnMount> | UnwrapFormValidateOrFn<TOnChange> | UnwrapFormAsyncValidateOrFn<TOnChangeAsync> | UnwrapFormValidateOrFn<TOnBlur> | UnwrapFormAsyncValidateOrFn<TOnBlurAsync> | UnwrapFormValidateOrFn<TOnSubmit> | UnwrapFormAsyncValidateOrFn<TOnSubmitAsync> | UnwrapFormValidateOrFn<TOnDynamic> | UnwrapFormAsyncValidateOrFn<TOnDynamicAsync> | UnwrapFormAsyncValidateOrFn<TOnServer>>;
    /**
     * A boolean indicating if any of the form fields are currently validating.
     */
    isFieldsValidating: boolean;
    /**
     * A boolean indicating if all the form fields are valid. Evaluates `true` if there are no field errors.
     */
    isFieldsValid: boolean;
    /**
     * A boolean indicating if any of the form fields have been touched.
     */
    isTouched: boolean;
    /**
     * A boolean indicating if any of the form fields have been blurred.
     */
    isBlurred: boolean;
    /**
     * A boolean indicating if any of the form's fields' values have been modified by the user. Evaluates `true` if the user have modified at least one of the fields. Opposite of `isPristine`.
     */
    isDirty: boolean;
    /**
     * A boolean indicating if none of the form's fields' values have been modified by the user. Evaluates `true` if the user have not modified any of the fields. Opposite of `isDirty`.
     */
    isPristine: boolean;
    /**
     * A boolean indicating if all of the form's fields are the same as default values.
     */
    isDefaultValue: boolean;
    /**
     * A boolean indicating if the form and all its fields are valid. Evaluates `true` if there are no errors.
     */
    isValid: boolean;
    /**
     * A boolean indicating if the form can be submitted based on its current state.
     */
    canSubmit: boolean;
    /**
     * A record of field metadata for each field in the form.
     */
    fieldMeta: Partial<Record<DeepKeys<TFormData>, AnyFieldMeta>>;
};
export interface FormState<in out TFormData, in out TOnMount extends undefined | FormValidateOrFn<TFormData>, in out TOnChange extends undefined | FormValidateOrFn<TFormData>, in out TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnBlur extends undefined | FormValidateOrFn<TFormData>, in out TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnSubmit extends undefined | FormValidateOrFn<TFormData>, in out TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnDynamic extends undefined | FormValidateOrFn<TFormData>, in out TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>> extends BaseFormState<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer>, DerivedFormState<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer> {
}
export type AnyFormState = FormState<any, any, any, any, any, any, any, any, any, any, any>;
/**
 * @public
 *
 * A type representing the Form API with all generics set to `any` for convenience.
 */
export type AnyFormApi = FormApi<any, any, any, any, any, any, any, any, any, any, any, any>;
/**
 * We cannot use methods and must use arrow functions. Otherwise, our React adapters
 * will break due to loss of the method when using spread.
 */
/**
 * A class representing the Form API. It handles the logic and interactions with the form state.
 *
 * Normally, you will not need to create a new `FormApi` instance directly. Instead, you will use a framework
 * hook/function like `useForm` or `createForm` to create a new instance for you that uses your framework's reactivity model.
 * However, if you need to create a new instance manually, you can do so by calling the `new FormApi` constructor.
 */
export declare class FormApi<in out TFormData, in out TOnMount extends undefined | FormValidateOrFn<TFormData>, in out TOnChange extends undefined | FormValidateOrFn<TFormData>, in out TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnBlur extends undefined | FormValidateOrFn<TFormData>, in out TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnSubmit extends undefined | FormValidateOrFn<TFormData>, in out TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnDynamic extends undefined | FormValidateOrFn<TFormData>, in out TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, in out TSubmitMeta = never> implements FieldManipulator<TFormData, TSubmitMeta> {
    /**
     * The options for the form.
     */
    options: FormOptions<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
    baseStore: Store<BaseFormState<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer>>;
    fieldMetaDerived: Derived<FormState<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer>['fieldMeta']>;
    store: Derived<FormState<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer>>;
    /**
     * A record of field information for each field in the form.
     */
    fieldInfo: Record<DeepKeys<TFormData>, FieldInfo<TFormData>>;
    get state(): FormState<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer>;
    /**
     * @private
     */
    prevTransformArray: unknown[];
    /**
     * @private
     */
    timeoutIds: {
        validations: Record<ValidationCause, ReturnType<typeof setTimeout> | null>;
        listeners: Record<ListenerCause, ReturnType<typeof setTimeout> | null>;
        formListeners: Record<ListenerCause, ReturnType<typeof setTimeout> | null>;
    };
    /**
     * @private
     */
    _formId: string;
    /**
     * @private
     */
    private _devtoolsSubmissionOverride;
    /**
     * Constructs a new `FormApi` instance with the given form options.
     */
    constructor(opts?: FormOptions<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>);
    get formId(): string;
    /**
     * @private
     */
    runValidator<TValue extends TStandardSchemaValidatorValue<TFormData> & {
        formApi: AnyFormApi;
    }, TType extends 'validate' | 'validateAsync'>(props: {
        validate: TType extends 'validate' ? FormValidateOrFn<TFormData> : FormAsyncValidateOrFn<TFormData>;
        value: TValue;
        type: TType;
    }): unknown;
    mount: () => () => void;
    /**
     * Updates the form options and form state.
     */
    update: (options?: FormOptions<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>) => void;
    /**
     * Resets the form state to the default values.
     * If values are provided, the form will be reset to those values instead and the default values will be updated.
     *
     * @param values - Optional values to reset the form to.
     * @param opts - Optional options to control the reset behavior.
     */
    reset: (values?: TFormData, opts?: {
        keepDefaultValues?: boolean;
    }) => void;
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
     * TODO: This code is copied from FieldApi, we should refactor to share
     * @private
     */
    validateSync: (cause: ValidationCause) => {
        hasErrored: boolean;
        fieldsErrorMap: FormErrorMapFromValidator<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync>;
    };
    /**
     * @private
     */
    validateAsync: (cause: ValidationCause) => Promise<FormErrorMapFromValidator<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync>>;
    /**
     * @private
     */
    validate: (cause: ValidationCause) => FormErrorMapFromValidator<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync> | Promise<FormErrorMapFromValidator<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync>>;
    handleSubmit(): Promise<void>;
    handleSubmit(submitMeta: TSubmitMeta): Promise<void>;
    /**
     * Handles the form submission, performs validation, and calls the appropriate onSubmit or onSubmitInvalid callbacks.
     */
    _handleSubmit: (submitMeta?: TSubmitMeta) => Promise<void>;
    /**
     * Gets the value of the specified field.
     */
    getFieldValue: <TField extends DeepKeys<TFormData>>(field: TField) => DeepValue<TFormData, TField>;
    /**
     * Gets the metadata of the specified field.
     */
    getFieldMeta: <TField extends DeepKeys<TFormData>>(field: TField) => AnyFieldMeta | undefined;
    /**
     * Gets the field info of the specified field.
     */
    getFieldInfo: <TField extends DeepKeys<TFormData>>(field: TField) => FieldInfo<TFormData>;
    /**
     * Updates the metadata of the specified field.
     */
    setFieldMeta: <TField extends DeepKeys<TFormData>>(field: TField, updater: Updater<AnyFieldMetaBase>) => void;
    /**
     * resets every field's meta
     */
    resetFieldMeta: <TField extends DeepKeys<TFormData>>(fieldMeta: Partial<Record<TField, AnyFieldMeta>>) => Partial<Record<TField, AnyFieldMeta>>;
    /**
     * Sets the value of the specified field and optionally updates the touched state.
     */
    setFieldValue: <TField extends DeepKeys<TFormData>>(field: TField, updater: Updater<DeepValue<TFormData, TField>>, opts?: UpdateMetaOptions) => void;
    deleteField: <TField extends DeepKeys<TFormData>>(field: TField) => void;
    /**
     * Pushes a value into an array field.
     */
    pushFieldValue: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, value: DeepValue<TFormData, TField> extends any[] ? DeepValue<TFormData, TField>[number] : never, options?: UpdateMetaOptions) => void;
    insertFieldValue: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index: number, value: DeepValue<TFormData, TField> extends any[] ? DeepValue<TFormData, TField>[number] : never, options?: UpdateMetaOptions) => Promise<void>;
    /**
     * Replaces a value into an array field at the specified index.
     */
    replaceFieldValue: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index: number, value: DeepValue<TFormData, TField> extends any[] ? DeepValue<TFormData, TField>[number] : never, options?: UpdateMetaOptions) => Promise<void>;
    /**
     * Removes a value from an array field at the specified index.
     */
    removeFieldValue: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index: number, options?: UpdateMetaOptions) => Promise<void>;
    /**
     * Swaps the values at the specified indices within an array field.
     */
    swapFieldValues: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index1: number, index2: number, options?: UpdateMetaOptions) => void;
    /**
     * Moves the value at the first specified index to the second specified index within an array field.
     */
    moveFieldValues: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, index1: number, index2: number, options?: UpdateMetaOptions) => void;
    /**
     * Clear all values within an array field.
     */
    clearFieldValues: <TField extends DeepKeysOfType<TFormData, any[]>>(field: TField, options?: UpdateMetaOptions) => void;
    /**
     * Resets the field value and meta to default state
     */
    resetField: <TField extends DeepKeys<TFormData>>(field: TField) => void;
    /**
     * Updates the form's errorMap
     */
    setErrorMap: (errorMap: FormValidationErrorMap<TFormData, UnwrapFormValidateOrFn<TOnMount>, UnwrapFormValidateOrFn<TOnChange>, UnwrapFormAsyncValidateOrFn<TOnChangeAsync>, UnwrapFormValidateOrFn<TOnBlur>, UnwrapFormAsyncValidateOrFn<TOnBlurAsync>, UnwrapFormValidateOrFn<TOnSubmit>, UnwrapFormAsyncValidateOrFn<TOnSubmitAsync>, UnwrapFormValidateOrFn<TOnDynamic>, UnwrapFormAsyncValidateOrFn<TOnDynamicAsync>, UnwrapFormAsyncValidateOrFn<TOnServer>>) => void;
    /**
     * Returns form and field level errors
     */
    getAllErrors: () => {
        form: {
            errors: Array<UnwrapFormValidateOrFn<TOnMount> | UnwrapFormValidateOrFn<TOnChange> | UnwrapFormAsyncValidateOrFn<TOnChangeAsync> | UnwrapFormValidateOrFn<TOnBlur> | UnwrapFormAsyncValidateOrFn<TOnBlurAsync> | UnwrapFormValidateOrFn<TOnSubmit> | UnwrapFormAsyncValidateOrFn<TOnSubmitAsync> | UnwrapFormValidateOrFn<TOnDynamic> | UnwrapFormAsyncValidateOrFn<TOnDynamicAsync> | UnwrapFormAsyncValidateOrFn<TOnServer>>;
            errorMap: ValidationErrorMap<UnwrapFormValidateOrFn<TOnMount>, UnwrapFormValidateOrFn<TOnChange>, UnwrapFormAsyncValidateOrFn<TOnChangeAsync>, UnwrapFormValidateOrFn<TOnBlur>, UnwrapFormAsyncValidateOrFn<TOnBlurAsync>, UnwrapFormValidateOrFn<TOnSubmit>, UnwrapFormAsyncValidateOrFn<TOnSubmitAsync>, UnwrapFormValidateOrFn<TOnDynamic>, UnwrapFormAsyncValidateOrFn<TOnDynamicAsync>, UnwrapFormAsyncValidateOrFn<TOnServer>>;
        };
        fields: Record<DeepKeys<TFormData>, {
            errors: ValidationError[];
            errorMap: ValidationErrorMap;
        }>;
    };
    /**
     * Parses the form's values with a given standard schema and returns
     * issues (if any). This method does NOT set any internal errors.
     * @param schema The standard schema to parse the form values with.
     */
    parseValuesWithSchema: (schema: StandardSchemaV1<TFormData, unknown>) => {
        form: Record<string, StandardSchemaV1Issue[]>;
        fields: Record<string, StandardSchemaV1Issue[]>;
    } | undefined;
    /**
     * Parses the form's values with a given standard schema and returns
     * issues (if any). This method does NOT set any internal errors.
     * @param schema The standard schema to parse the form values with.
     */
    parseValuesWithSchemaAsync: (schema: StandardSchemaV1<TFormData, unknown>) => Promise<{
        form: Record<string, StandardSchemaV1Issue[]>;
        fields: Record<string, StandardSchemaV1Issue[]>;
    } | undefined>;
}
export {};
