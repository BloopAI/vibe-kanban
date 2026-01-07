import { Derived } from '@tanstack/store';
import { DeepKeys, DeepValue, UnwrapOneLevelOfArray } from './util-types.cjs';
import { StandardSchemaV1, StandardSchemaV1Issue, TStandardSchemaValidatorValue } from './standardSchemaValidator.cjs';
import { FieldInfo, FormApi, FormAsyncValidateOrFn, FormValidateAsyncFn, FormValidateFn, FormValidateOrFn } from './FormApi.cjs';
import { ListenerCause, UpdateMetaOptions, ValidationCause, ValidationError, ValidationErrorMap, ValidationErrorMapSource } from './types.cjs';
import { Updater } from './utils.cjs';
/**
 * @private
 */
type FieldErrorMapFromValidator<TFormData, TName extends DeepKeys<TFormData>, TData extends DeepValue<TFormData, TName>, TOnMount extends undefined | FieldValidateOrFn<TFormData, TName, TData>, TOnChange extends undefined | FieldValidateOrFn<TFormData, TName, TData>, TOnChangeAsync extends undefined | FieldAsyncValidateOrFn<TFormData, TName, TData>, TOnBlur extends undefined | FieldValidateOrFn<TFormData, TName, TData>, TOnBlurAsync extends undefined | FieldAsyncValidateOrFn<TFormData, TName, TData>, TOnSubmit extends undefined | FieldValidateOrFn<TFormData, TName, TData>, TOnSubmitAsync extends undefined | FieldAsyncValidateOrFn<TFormData, TName, TData>> = Partial<Record<DeepKeys<TFormData>, ValidationErrorMap<TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync>>>;
/**
 * @private
 */
export type FieldValidateFn<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>> = (props: {
    value: TData;
    fieldApi: FieldApi<TParentData, TName, TData, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>;
}) => unknown;
/**
 * @private
 */
export type FieldValidateOrFn<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>> = FieldValidateFn<TParentData, TName, TData> | StandardSchemaV1<TData, unknown>;
type StandardBrandedSchemaV1<T> = T & {
    __standardSchemaV1: true;
};
type UnwrapFormValidateOrFnForInner<TValidateOrFn extends undefined | FormValidateOrFn<any>> = [TValidateOrFn] extends [FormValidateFn<any>] ? ReturnType<TValidateOrFn> : [TValidateOrFn] extends [StandardSchemaV1<infer TOut, any>] ? StandardBrandedSchemaV1<TOut> : undefined;
export type UnwrapFieldValidateOrFn<TName extends string, TValidateOrFn extends undefined | FieldValidateOrFn<any, any, any>, TFormValidateOrFn extends undefined | FormValidateOrFn<any>> = ([TFormValidateOrFn] extends [StandardSchemaV1<any, infer TStandardOut>] ? TName extends keyof TStandardOut ? StandardSchemaV1Issue[] : undefined : undefined) | (UnwrapFormValidateOrFnForInner<TFormValidateOrFn> extends infer TFormValidateVal ? TFormValidateVal extends {
    __standardSchemaV1: true;
} ? [DeepValue<TFormValidateVal, TName>] extends [never] ? undefined : StandardSchemaV1Issue[] : TFormValidateVal extends {
    fields: any;
} ? TName extends keyof TFormValidateVal['fields'] ? TFormValidateVal['fields'][TName] : undefined : undefined : never) | ([TValidateOrFn] extends [FieldValidateFn<any, any, any>] ? ReturnType<TValidateOrFn> : [TValidateOrFn] extends [StandardSchemaV1<any, any>] ? StandardSchemaV1Issue[] : undefined);
/**
 * @private
 */
export type FieldValidateAsyncFn<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>> = (options: {
    value: TData;
    fieldApi: FieldApi<TParentData, TName, TData, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>;
    signal: AbortSignal;
}) => unknown | Promise<unknown>;
/**
 * @private
 */
export type FieldAsyncValidateOrFn<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>> = FieldValidateAsyncFn<TParentData, TName, TData> | StandardSchemaV1<TData, unknown>;
type UnwrapFormAsyncValidateOrFnForInner<TValidateOrFn extends undefined | FormAsyncValidateOrFn<any>> = [TValidateOrFn] extends [FormValidateAsyncFn<any>] ? Awaited<ReturnType<TValidateOrFn>> : [TValidateOrFn] extends [StandardSchemaV1<infer TOut, any>] ? StandardBrandedSchemaV1<TOut> : undefined;
export type UnwrapFieldAsyncValidateOrFn<TName extends string, TValidateOrFn extends undefined | FieldAsyncValidateOrFn<any, any, any>, TFormValidateOrFn extends undefined | FormAsyncValidateOrFn<any>> = ([TFormValidateOrFn] extends [StandardSchemaV1<any, infer TStandardOut>] ? TName extends keyof TStandardOut ? StandardSchemaV1Issue[] : undefined : undefined) | (UnwrapFormAsyncValidateOrFnForInner<TFormValidateOrFn> extends infer TFormValidateVal ? TFormValidateVal extends {
    __standardSchemaV1: true;
} ? [DeepValue<TFormValidateVal, TName>] extends [never] ? undefined : StandardSchemaV1Issue[] : TFormValidateVal extends {
    fields: any;
} ? TName extends keyof TFormValidateVal['fields'] ? TFormValidateVal['fields'][TName] : undefined : undefined : never) | ([TValidateOrFn] extends [FieldValidateAsyncFn<any, any, any>] ? Awaited<ReturnType<TValidateOrFn>> : [TValidateOrFn] extends [StandardSchemaV1<any, any>] ? StandardSchemaV1Issue[] : undefined);
/**
 * @private
 */
export type FieldListenerFn<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>> = (props: {
    value: TData;
    fieldApi: FieldApi<TParentData, TName, TData, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>;
}) => void;
export interface FieldValidators<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName>, TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChangeAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnBlurAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnSubmitAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnDynamicAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>> {
    /**
     * An optional function, that runs on the mount event of input.
     */
    onMount?: TOnMount;
    /**
     * An optional function, that runs on the change event of input.
     *
     * @example z.string().min(1)
     */
    onChange?: TOnChange;
    /**
     * An optional property similar to `onChange` but async validation
     *
     * @example z.string().refine(async (val) => val.length > 3, { message: 'Testing 123' })
     */
    onChangeAsync?: TOnChangeAsync;
    /**
     * An optional number to represent how long the `onChangeAsync` should wait before running
     *
     * If set to a number larger than 0, will debounce the async validation event by this length of time in milliseconds
     */
    onChangeAsyncDebounceMs?: number;
    /**
     * An optional list of field names that should trigger this field's `onChange` and `onChangeAsync` events when its value changes
     */
    onChangeListenTo?: DeepKeys<TParentData>[];
    /**
     * An optional function, that runs on the blur event of input.
     *
     * @example z.string().min(1)
     */
    onBlur?: TOnBlur;
    /**
     * An optional property similar to `onBlur` but async validation.
     *
     * @example z.string().refine(async (val) => val.length > 3, { message: 'Testing 123' })
     */
    onBlurAsync?: TOnBlurAsync;
    /**
     * An optional number to represent how long the `onBlurAsync` should wait before running
     *
     * If set to a number larger than 0, will debounce the async validation event by this length of time in milliseconds
     */
    onBlurAsyncDebounceMs?: number;
    /**
     * An optional list of field names that should trigger this field's `onBlur` and `onBlurAsync` events when its value changes
     */
    onBlurListenTo?: DeepKeys<TParentData>[];
    /**
     * An optional function, that runs on the submit event of form.
     *
     * @example z.string().min(1)
     */
    onSubmit?: TOnSubmit;
    /**
     * An optional property similar to `onSubmit` but async validation.
     *
     * @example z.string().refine(async (val) => val.length > 3, { message: 'Testing 123' })
     */
    onSubmitAsync?: TOnSubmitAsync;
    onDynamic?: TOnDynamic;
    onDynamicAsync?: TOnDynamicAsync;
    onDynamicAsyncDebounceMs?: number;
}
export interface FieldListeners<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>> {
    onChange?: FieldListenerFn<TParentData, TName, TData>;
    onChangeDebounceMs?: number;
    onBlur?: FieldListenerFn<TParentData, TName, TData>;
    onBlurDebounceMs?: number;
    onMount?: FieldListenerFn<TParentData, TName, TData>;
    onSubmit?: FieldListenerFn<TParentData, TName, TData>;
}
/**
 * An object type representing the options for a field in a form.
 */
export interface FieldOptions<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName>, TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChangeAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnBlurAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnSubmitAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnDynamicAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>> {
    /**
     * The field name. The type will be `DeepKeys<TParentData>` to ensure your name is a deep key of the parent dataset.
     */
    name: TName;
    /**
     * An optional default value for the field.
     */
    defaultValue?: NoInfer<TData>;
    /**
     * The default time to debounce async validation if there is not a more specific debounce time passed.
     */
    asyncDebounceMs?: number;
    /**
     * If `true`, always run async validation, even if there are errors emitted during synchronous validation.
     */
    asyncAlways?: boolean;
    /**
     * A list of validators to pass to the field
     */
    validators?: FieldValidators<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync>;
    /**
     * An optional object with default metadata for the field.
     */
    defaultMeta?: Partial<FieldMeta<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, any, any, any, any, any, any, any, any, any>>;
    /**
     * A list of listeners which attach to the corresponding events
     */
    listeners?: FieldListeners<TParentData, TName, TData>;
    /**
     * Disable the `flat(1)` operation on `field.errors`. This is useful if you want to keep the error structure as is. Not suggested for most use-cases.
     */
    disableErrorFlat?: boolean;
}
/**
 * An object type representing the required options for the FieldApi class.
 */
export interface FieldApiOptions<in out TParentData, in out TName extends DeepKeys<TParentData>, in out TData extends DeepValue<TParentData, TName>, in out TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnChangeAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, in out TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnBlurAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, in out TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnSubmitAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, in out TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnDynamicAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, in out TFormOnMount extends undefined | FormValidateOrFn<TParentData>, in out TFormOnChange extends undefined | FormValidateOrFn<TParentData>, in out TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>, in out TFormOnBlur extends undefined | FormValidateOrFn<TParentData>, in out TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>, in out TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>, in out TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>, in out TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>, in out TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>, in out TFormOnServer extends undefined | FormAsyncValidateOrFn<TParentData>, in out TParentSubmitMeta> extends FieldOptions<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync> {
    form: FormApi<TParentData, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync, TFormOnServer, TParentSubmitMeta>;
}
export type FieldMetaBase<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName>, TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChangeAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnBlurAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnSubmitAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnDynamicAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TFormOnMount extends undefined | FormValidateOrFn<TParentData>, TFormOnChange extends undefined | FormValidateOrFn<TParentData>, TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnBlur extends undefined | FormValidateOrFn<TParentData>, TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>, TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>, TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>> = {
    /**
     * A flag indicating whether the field has been touched.
     */
    isTouched: boolean;
    /**
     * A flag indicating whether the field has been blurred.
     */
    isBlurred: boolean;
    /**
     * A flag that is `true` if the field's value has been modified by the user. Opposite of `isPristine`.
     */
    isDirty: boolean;
    /**
     * A map of errors related to the field value.
     */
    errorMap: ValidationErrorMap<UnwrapFieldValidateOrFn<TName, TOnMount, TFormOnMount>, UnwrapFieldValidateOrFn<TName, TOnChange, TFormOnChange>, UnwrapFieldAsyncValidateOrFn<TName, TOnChangeAsync, TFormOnChangeAsync>, UnwrapFieldValidateOrFn<TName, TOnBlur, TFormOnBlur>, UnwrapFieldAsyncValidateOrFn<TName, TOnBlurAsync, TFormOnBlurAsync>, UnwrapFieldValidateOrFn<TName, TOnSubmit, TFormOnSubmit>, UnwrapFieldAsyncValidateOrFn<TName, TOnSubmitAsync, TFormOnSubmitAsync>, UnwrapFieldValidateOrFn<TName, TOnDynamic, TFormOnDynamic>, UnwrapFieldAsyncValidateOrFn<TName, TOnDynamicAsync, TFormOnDynamicAsync>>;
    /**
     * @private allows tracking the source of the errors in the error map
     */
    errorSourceMap: ValidationErrorMapSource;
    /**
     * A flag indicating whether the field is currently being validated.
     */
    isValidating: boolean;
};
export type AnyFieldMetaBase = FieldMetaBase<any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>;
export type FieldMetaDerived<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName>, TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChangeAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnBlurAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnSubmitAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnDynamicAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TFormOnMount extends undefined | FormValidateOrFn<TParentData>, TFormOnChange extends undefined | FormValidateOrFn<TParentData>, TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnBlur extends undefined | FormValidateOrFn<TParentData>, TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>, TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>, TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>> = {
    /**
     * An array of errors related to the field value.
     */
    errors: Array<UnwrapOneLevelOfArray<UnwrapFieldValidateOrFn<TName, TOnMount, TFormOnMount>> | UnwrapOneLevelOfArray<UnwrapFieldValidateOrFn<TName, TOnChange, TFormOnChange>> | UnwrapOneLevelOfArray<UnwrapFieldAsyncValidateOrFn<TName, TOnChangeAsync, TFormOnChangeAsync>> | UnwrapOneLevelOfArray<UnwrapFieldValidateOrFn<TName, TOnBlur, TFormOnBlur>> | UnwrapOneLevelOfArray<UnwrapFieldAsyncValidateOrFn<TName, TOnBlurAsync, TFormOnBlurAsync>> | UnwrapOneLevelOfArray<UnwrapFieldValidateOrFn<TName, TOnSubmit, TFormOnSubmit>> | UnwrapOneLevelOfArray<UnwrapFieldAsyncValidateOrFn<TName, TOnSubmitAsync, TFormOnSubmitAsync>> | UnwrapOneLevelOfArray<UnwrapFieldValidateOrFn<TName, TOnDynamic, TFormOnDynamic>> | UnwrapOneLevelOfArray<UnwrapFieldAsyncValidateOrFn<TName, TOnDynamicAsync, TFormOnDynamicAsync>>>;
    /**
     * A flag that is `true` if the field's value has not been modified by the user. Opposite of `isDirty`.
     */
    isPristine: boolean;
    /**
     * A boolean indicating if the field is valid. Evaluates `true` if there are no field errors.
     */
    isValid: boolean;
    /**
     * A flag indicating whether the field's current value is the default value
     */
    isDefaultValue: boolean;
};
export type AnyFieldMetaDerived = FieldMetaDerived<any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>;
/**
 * An object type representing the metadata of a field in a form.
 */
export type FieldMeta<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName>, TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChangeAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnBlurAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnSubmitAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnDynamicAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TFormOnMount extends undefined | FormValidateOrFn<TParentData>, TFormOnChange extends undefined | FormValidateOrFn<TParentData>, TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnBlur extends undefined | FormValidateOrFn<TParentData>, TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>, TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>, TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>> = FieldMetaBase<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync> & FieldMetaDerived<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync>;
export type AnyFieldMeta = FieldMeta<any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>;
/**
 * An object type representing the state of a field.
 */
export type FieldState<TParentData, TName extends DeepKeys<TParentData>, TData extends DeepValue<TParentData, TName>, TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnChangeAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnBlurAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnSubmitAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>, TOnDynamicAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, TFormOnMount extends undefined | FormValidateOrFn<TParentData>, TFormOnChange extends undefined | FormValidateOrFn<TParentData>, TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnBlur extends undefined | FormValidateOrFn<TParentData>, TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>, TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>, TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>, TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>> = {
    /**
     * The current value of the field.
     */
    value: TData;
    /**
     * The current metadata of the field.
     */
    meta: FieldMeta<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync>;
};
/**
 * @public
 *
 * A type representing the Field API with all generics set to `any` for convenience.
 */
export type AnyFieldApi = FieldApi<any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>;
/**
 * We cannot use methods and must use arrow functions. Otherwise, our React adapters
 * will break due to loss of the method when using spread.
 */
/**
 * A class representing the API for managing a form field.
 *
 * Normally, you will not need to create a new `FieldApi` instance directly.
 * Instead, you will use a framework hook/function like `useField` or `createField`
 * to create a new instance for you that uses your framework's reactivity model.
 * However, if you need to create a new instance manually, you can do so by calling
 * the `new FieldApi` constructor.
 */
export declare class FieldApi<in out TParentData, in out TName extends DeepKeys<TParentData>, in out TData extends DeepValue<TParentData, TName>, in out TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnChangeAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, in out TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnBlurAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, in out TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnSubmitAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, in out TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>, in out TOnDynamicAsync extends undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>, in out TFormOnMount extends undefined | FormValidateOrFn<TParentData>, in out TFormOnChange extends undefined | FormValidateOrFn<TParentData>, in out TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>, in out TFormOnBlur extends undefined | FormValidateOrFn<TParentData>, in out TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>, in out TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>, in out TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>, in out TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>, in out TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>, in out TFormOnServer extends undefined | FormAsyncValidateOrFn<TParentData>, in out TParentSubmitMeta> {
    /**
     * A reference to the form API instance.
     */
    form: FieldApiOptions<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync, TFormOnServer, TParentSubmitMeta>['form'];
    /**
     * The field name.
     */
    name: TName;
    /**
     * The field options.
     */
    options: FieldApiOptions<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync, TFormOnServer, TParentSubmitMeta>;
    /**
     * The field state store.
     */
    store: Derived<FieldState<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync>>;
    /**
     * The current field state.
     */
    get state(): FieldState<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync>;
    timeoutIds: {
        validations: Record<ValidationCause, ReturnType<typeof setTimeout> | null>;
        listeners: Record<ListenerCause, ReturnType<typeof setTimeout> | null>;
        formListeners: Record<ListenerCause, ReturnType<typeof setTimeout> | null>;
    };
    /**
     * Initializes a new `FieldApi` instance.
     */
    constructor(opts: FieldApiOptions<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync, TFormOnServer, TParentSubmitMeta>);
    /**
     * @private
     */
    runValidator<TValue extends TStandardSchemaValidatorValue<TData> & {
        fieldApi: AnyFieldApi;
    }, TType extends 'validate' | 'validateAsync'>(props: {
        validate: TType extends 'validate' ? FieldValidateOrFn<any, any, any> : FieldAsyncValidateOrFn<any, any, any>;
        value: TValue;
        type: TType;
    }): unknown;
    /**
     * Mounts the field instance to the form.
     */
    mount: () => () => void;
    /**
     * Updates the field instance with new options.
     */
    update: (opts: FieldApiOptions<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync, TFormOnServer, TParentSubmitMeta>) => void;
    /**
     * Gets the current field value.
     * @deprecated Use `field.state.value` instead.
     */
    getValue: () => TData;
    /**
     * Sets the field value and run the `change` validator.
     */
    setValue: (updater: Updater<TData>, options?: UpdateMetaOptions) => void;
    getMeta: () => FieldMeta<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync>;
    /**
     * Sets the field metadata.
     */
    setMeta: (updater: Updater<FieldMetaBase<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TFormOnMount, TFormOnChange, TFormOnChangeAsync, TFormOnBlur, TFormOnBlurAsync, TFormOnSubmit, TFormOnSubmitAsync, TFormOnDynamic, TFormOnDynamicAsync>>) => void;
    /**
     * Gets the field information object.
     */
    getInfo: () => FieldInfo<TParentData>;
    /**
     * Pushes a new value to the field.
     */
    pushValue: (value: TData extends any[] ? TData[number] : never, options?: UpdateMetaOptions) => void;
    /**
     * Inserts a value at the specified index, shifting the subsequent values to the right.
     */
    insertValue: (index: number, value: TData extends any[] ? TData[number] : never, options?: UpdateMetaOptions) => void;
    /**
     * Replaces a value at the specified index.
     */
    replaceValue: (index: number, value: TData extends any[] ? TData[number] : never, options?: UpdateMetaOptions) => void;
    /**
     * Removes a value at the specified index.
     */
    removeValue: (index: number, options?: UpdateMetaOptions) => void;
    /**
     * Swaps the values at the specified indices.
     */
    swapValues: (aIndex: number, bIndex: number, options?: UpdateMetaOptions) => void;
    /**
     * Moves the value at the first specified index to the second specified index.
     */
    moveValue: (aIndex: number, bIndex: number, options?: UpdateMetaOptions) => void;
    /**
     * Clear all values from the array.
     */
    clearValues: (options?: UpdateMetaOptions) => void;
    /**
     * @private
     */
    getLinkedFields: (cause: ValidationCause) => AnyFieldApi[];
    /**
     * @private
     */
    validateSync: (cause: ValidationCause, errorFromForm: ValidationErrorMap) => {
        hasErrored: boolean;
    };
    /**
     * @private
     */
    validateAsync: (cause: ValidationCause, formValidationResultPromise: Promise<FieldErrorMapFromValidator<TParentData, TName, TData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync>>) => Promise<unknown[]>;
    /**
     * Validates the field value.
     */
    validate: (cause: ValidationCause, opts?: {
        skipFormValidation?: boolean;
    }) => ValidationError[] | Promise<ValidationError[]>;
    /**
     * Handles the change event.
     */
    handleChange: (updater: Updater<TData>) => void;
    /**
     * Handles the blur event.
     */
    handleBlur: () => void;
    /**
     * Updates the field's errorMap
     */
    setErrorMap: (errorMap: ValidationErrorMap<UnwrapFieldValidateOrFn<TName, TOnMount, TFormOnMount>, UnwrapFieldValidateOrFn<TName, TOnChange, TFormOnChange>, UnwrapFieldAsyncValidateOrFn<TName, TOnChangeAsync, TFormOnChangeAsync>, UnwrapFieldValidateOrFn<TName, TOnBlur, TFormOnBlur>, UnwrapFieldAsyncValidateOrFn<TName, TOnBlurAsync, TFormOnBlurAsync>, UnwrapFieldValidateOrFn<TName, TOnSubmit, TFormOnSubmit>, UnwrapFieldAsyncValidateOrFn<TName, TOnSubmitAsync, TFormOnSubmitAsync>, UnwrapFieldValidateOrFn<TName, TOnDynamic, TFormOnDynamic>, UnwrapFieldAsyncValidateOrFn<TName, TOnDynamicAsync, TFormOnDynamicAsync>>) => void;
    /**
     * Parses the field's value with the given schema and returns
     * issues (if any). This method does NOT set any internal errors.
     * @param schema The standard schema to parse this field's value with.
     */
    parseValueWithSchema: (schema: StandardSchemaV1<TData, unknown>) => StandardSchemaV1Issue[] | undefined;
    /**
     * Parses the field's value with the given schema and returns
     * issues (if any). This method does NOT set any internal errors.
     * @param schema The standard schema to parse this field's value with.
     */
    parseValueWithSchemaAsync: (schema: StandardSchemaV1<TData, unknown>) => Promise<StandardSchemaV1Issue[] | undefined>;
    private triggerOnBlurListener;
    /**
     * @private
     */
    triggerOnChangeListener: () => void;
}
export {};
