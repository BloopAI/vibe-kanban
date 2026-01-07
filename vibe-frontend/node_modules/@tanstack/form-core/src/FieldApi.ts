import { Derived, batch } from '@tanstack/store'
import {
  isStandardSchemaValidator,
  standardSchemaValidators,
} from './standardSchemaValidator'
import { defaultFieldMeta } from './metaHelper'
import {
  determineFieldLevelErrorSourceAndValue,
  evaluate,
  getAsyncValidatorArray,
  getBy,
  getSyncValidatorArray,
  mergeOpts,
} from './utils'
import { defaultValidationLogic } from './ValidationLogic'
import type { DeepKeys, DeepValue, UnwrapOneLevelOfArray } from './util-types'
import type {
  StandardSchemaV1,
  StandardSchemaV1Issue,
  TStandardSchemaValidatorValue,
} from './standardSchemaValidator'
import type {
  FieldInfo,
  FormApi,
  FormAsyncValidateOrFn,
  FormValidateAsyncFn,
  FormValidateFn,
  FormValidateOrFn,
} from './FormApi'
import type {
  ListenerCause,
  UpdateMetaOptions,
  ValidationCause,
  ValidationError,
  ValidationErrorMap,
  ValidationErrorMapSource,
} from './types'
import type { AsyncValidator, SyncValidator, Updater } from './utils'

/**
 * @private
 */
// TODO: Add the `Unwrap` type to the errors
type FieldErrorMapFromValidator<
  TFormData,
  TName extends DeepKeys<TFormData>,
  TData extends DeepValue<TFormData, TName>,
  TOnMount extends undefined | FieldValidateOrFn<TFormData, TName, TData>,
  TOnChange extends undefined | FieldValidateOrFn<TFormData, TName, TData>,
  TOnChangeAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TFormData, TName, TData>,
  TOnBlur extends undefined | FieldValidateOrFn<TFormData, TName, TData>,
  TOnBlurAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TFormData, TName, TData>,
  TOnSubmit extends undefined | FieldValidateOrFn<TFormData, TName, TData>,
  TOnSubmitAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TFormData, TName, TData>,
> = Partial<
  Record<
    DeepKeys<TFormData>,
    ValidationErrorMap<
      TOnMount,
      TOnChange,
      TOnChangeAsync,
      TOnBlur,
      TOnBlurAsync,
      TOnSubmit,
      TOnSubmitAsync
    >
  >
>

/**
 * @private
 */
export type FieldValidateFn<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = (props: {
  value: TData
  fieldApi: FieldApi<
    TParentData,
    TName,
    TData,
    // This is technically an edge-type; which we try to keep non-`any`, but in this case
    // It's referring to an inaccessible type from the field validate function inner types, so it's not a big deal
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >
}) => unknown

/**
 * @private
 */
export type FieldValidateOrFn<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> =
  | FieldValidateFn<TParentData, TName, TData>
  | StandardSchemaV1<TData, unknown>

type StandardBrandedSchemaV1<T> = T & { __standardSchemaV1: true }

type UnwrapFormValidateOrFnForInner<
  TValidateOrFn extends undefined | FormValidateOrFn<any>,
> = [TValidateOrFn] extends [FormValidateFn<any>]
  ? ReturnType<TValidateOrFn>
  : [TValidateOrFn] extends [StandardSchemaV1<infer TOut, any>]
    ? StandardBrandedSchemaV1<TOut>
    : undefined

export type UnwrapFieldValidateOrFn<
  TName extends string,
  TValidateOrFn extends undefined | FieldValidateOrFn<any, any, any>,
  TFormValidateOrFn extends undefined | FormValidateOrFn<any>,
> =
  | ([TFormValidateOrFn] extends [StandardSchemaV1<any, infer TStandardOut>]
      ? TName extends keyof TStandardOut
        ? StandardSchemaV1Issue[]
        : undefined
      : undefined)
  | (UnwrapFormValidateOrFnForInner<TFormValidateOrFn> extends infer TFormValidateVal
      ? TFormValidateVal extends { __standardSchemaV1: true }
        ? [DeepValue<TFormValidateVal, TName>] extends [never]
          ? undefined
          : StandardSchemaV1Issue[]
        : TFormValidateVal extends { fields: any }
          ? TName extends keyof TFormValidateVal['fields']
            ? TFormValidateVal['fields'][TName]
            : undefined
          : undefined
      : never)
  | ([TValidateOrFn] extends [FieldValidateFn<any, any, any>]
      ? ReturnType<TValidateOrFn>
      : [TValidateOrFn] extends [StandardSchemaV1<any, any>]
        ? // TODO: Check if `disableErrorFlat` is enabled, if so, return StandardSchemaV1Issue[][]
          StandardSchemaV1Issue[]
        : undefined)

/**
 * @private
 */
export type FieldValidateAsyncFn<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = (options: {
  value: TData
  fieldApi: FieldApi<
    TParentData,
    TName,
    TData,
    // This is technically an edge-type; which we try to keep non-`any`, but in this case
    // It's referring to an inaccessible type from the field validate function inner types, so it's not a big deal
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >
  signal: AbortSignal
}) => unknown | Promise<unknown>

/**
 * @private
 */
export type FieldAsyncValidateOrFn<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> =
  | FieldValidateAsyncFn<TParentData, TName, TData>
  | StandardSchemaV1<TData, unknown>

type UnwrapFormAsyncValidateOrFnForInner<
  TValidateOrFn extends undefined | FormAsyncValidateOrFn<any>,
> = [TValidateOrFn] extends [FormValidateAsyncFn<any>]
  ? Awaited<ReturnType<TValidateOrFn>>
  : [TValidateOrFn] extends [StandardSchemaV1<infer TOut, any>]
    ? StandardBrandedSchemaV1<TOut>
    : undefined

export type UnwrapFieldAsyncValidateOrFn<
  TName extends string,
  TValidateOrFn extends undefined | FieldAsyncValidateOrFn<any, any, any>,
  TFormValidateOrFn extends undefined | FormAsyncValidateOrFn<any>,
> =
  | ([TFormValidateOrFn] extends [StandardSchemaV1<any, infer TStandardOut>]
      ? TName extends keyof TStandardOut
        ? StandardSchemaV1Issue[]
        : undefined
      : undefined)
  | (UnwrapFormAsyncValidateOrFnForInner<TFormValidateOrFn> extends infer TFormValidateVal
      ? TFormValidateVal extends { __standardSchemaV1: true }
        ? [DeepValue<TFormValidateVal, TName>] extends [never]
          ? undefined
          : StandardSchemaV1Issue[]
        : TFormValidateVal extends { fields: any }
          ? TName extends keyof TFormValidateVal['fields']
            ? TFormValidateVal['fields'][TName]
            : undefined
          : undefined
      : never)
  | ([TValidateOrFn] extends [FieldValidateAsyncFn<any, any, any>]
      ? Awaited<ReturnType<TValidateOrFn>>
      : [TValidateOrFn] extends [StandardSchemaV1<any, any>]
        ? // TODO: Check if `disableErrorFlat` is enabled, if so, return StandardSchemaV1Issue[][]
          StandardSchemaV1Issue[]
        : undefined)

/**
 * @private
 */
export type FieldListenerFn<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = (props: {
  value: TData
  fieldApi: FieldApi<
    TParentData,
    TName,
    TData,
    // This is technically an edge-type; which we try to keep non-`any`, but in this case
    // It's referring to an inaccessible type from the field listener function inner types, so it's not a big deal
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >
}) => void

export interface FieldValidators<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChangeAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnBlurAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnSubmitAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnDynamicAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
> {
  /**
   * An optional function, that runs on the mount event of input.
   */
  onMount?: TOnMount
  /**
   * An optional function, that runs on the change event of input.
   *
   * @example z.string().min(1)
   */
  onChange?: TOnChange
  /**
   * An optional property similar to `onChange` but async validation
   *
   * @example z.string().refine(async (val) => val.length > 3, { message: 'Testing 123' })
   */
  onChangeAsync?: TOnChangeAsync
  /**
   * An optional number to represent how long the `onChangeAsync` should wait before running
   *
   * If set to a number larger than 0, will debounce the async validation event by this length of time in milliseconds
   */
  onChangeAsyncDebounceMs?: number
  /**
   * An optional list of field names that should trigger this field's `onChange` and `onChangeAsync` events when its value changes
   */
  onChangeListenTo?: DeepKeys<TParentData>[]
  /**
   * An optional function, that runs on the blur event of input.
   *
   * @example z.string().min(1)
   */
  onBlur?: TOnBlur
  /**
   * An optional property similar to `onBlur` but async validation.
   *
   * @example z.string().refine(async (val) => val.length > 3, { message: 'Testing 123' })
   */
  onBlurAsync?: TOnBlurAsync

  /**
   * An optional number to represent how long the `onBlurAsync` should wait before running
   *
   * If set to a number larger than 0, will debounce the async validation event by this length of time in milliseconds
   */
  onBlurAsyncDebounceMs?: number
  /**
   * An optional list of field names that should trigger this field's `onBlur` and `onBlurAsync` events when its value changes
   */
  onBlurListenTo?: DeepKeys<TParentData>[]
  /**
   * An optional function, that runs on the submit event of form.
   *
   * @example z.string().min(1)
   */
  onSubmit?: TOnSubmit
  /**
   * An optional property similar to `onSubmit` but async validation.
   *
   * @example z.string().refine(async (val) => val.length > 3, { message: 'Testing 123' })
   */
  onSubmitAsync?: TOnSubmitAsync
  onDynamic?: TOnDynamic
  onDynamicAsync?: TOnDynamicAsync
  onDynamicAsyncDebounceMs?: number
}

export interface FieldListeners<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> {
  onChange?: FieldListenerFn<TParentData, TName, TData>
  onChangeDebounceMs?: number
  onBlur?: FieldListenerFn<TParentData, TName, TData>
  onBlurDebounceMs?: number
  onMount?: FieldListenerFn<TParentData, TName, TData>
  onSubmit?: FieldListenerFn<TParentData, TName, TData>
}

/**
 * An object type representing the options for a field in a form.
 */
export interface FieldOptions<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChangeAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnBlurAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnSubmitAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnDynamicAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
> {
  /**
   * The field name. The type will be `DeepKeys<TParentData>` to ensure your name is a deep key of the parent dataset.
   */
  name: TName
  /**
   * An optional default value for the field.
   */
  defaultValue?: NoInfer<TData>
  /**
   * The default time to debounce async validation if there is not a more specific debounce time passed.
   */
  asyncDebounceMs?: number
  /**
   * If `true`, always run async validation, even if there are errors emitted during synchronous validation.
   */
  asyncAlways?: boolean
  /**
   * A list of validators to pass to the field
   */
  validators?: FieldValidators<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync
  >
  /**
   * An optional object with default metadata for the field.
   */
  defaultMeta?: Partial<
    FieldMeta<
      TParentData,
      TName,
      TData,
      TOnMount,
      TOnChange,
      TOnChangeAsync,
      TOnBlur,
      TOnBlurAsync,
      TOnSubmit,
      TOnSubmitAsync,
      TOnDynamic,
      TOnDynamicAsync,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >
  >
  /**
   * A list of listeners which attach to the corresponding events
   */
  listeners?: FieldListeners<TParentData, TName, TData>
  /**
   * Disable the `flat(1)` operation on `field.errors`. This is useful if you want to keep the error structure as is. Not suggested for most use-cases.
   */
  disableErrorFlat?: boolean
}

/**
 * An object type representing the required options for the FieldApi class.
 */
export interface FieldApiOptions<
  in out TParentData,
  in out TName extends DeepKeys<TParentData>,
  in out TData extends DeepValue<TParentData, TName>,
  in out TOnMount extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnChange extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnChangeAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  in out TOnBlur extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnBlurAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  in out TOnSubmit extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnSubmitAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  in out TOnDynamic extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnDynamicAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  in out TFormOnMount extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnChange extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnChangeAsync extends
    | undefined
    | FormAsyncValidateOrFn<TParentData>,
  in out TFormOnBlur extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnBlurAsync extends
    | undefined
    | FormAsyncValidateOrFn<TParentData>,
  in out TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnSubmitAsync extends
    | undefined
    | FormAsyncValidateOrFn<TParentData>,
  in out TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnDynamicAsync extends
    | undefined
    | FormAsyncValidateOrFn<TParentData>,
  in out TFormOnServer extends undefined | FormAsyncValidateOrFn<TParentData>,
  in out TParentSubmitMeta,
> extends FieldOptions<
  TParentData,
  TName,
  TData,
  TOnMount,
  TOnChange,
  TOnChangeAsync,
  TOnBlur,
  TOnBlurAsync,
  TOnSubmit,
  TOnSubmitAsync,
  TOnDynamic,
  TOnDynamicAsync
> {
  form: FormApi<
    TParentData,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync,
    TFormOnServer,
    TParentSubmitMeta
  >
}

export type FieldMetaBase<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChangeAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnBlurAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnSubmitAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnDynamicAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TFormOnMount extends undefined | FormValidateOrFn<TParentData>,
  TFormOnChange extends undefined | FormValidateOrFn<TParentData>,
  TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnBlur extends undefined | FormValidateOrFn<TParentData>,
  TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>,
  TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>,
  TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
> = {
  /**
   * A flag indicating whether the field has been touched.
   */
  isTouched: boolean
  /**
   * A flag indicating whether the field has been blurred.
   */
  isBlurred: boolean
  /**
   * A flag that is `true` if the field's value has been modified by the user. Opposite of `isPristine`.
   */
  isDirty: boolean
  /**
   * A map of errors related to the field value.
   */
  errorMap: ValidationErrorMap<
    UnwrapFieldValidateOrFn<TName, TOnMount, TFormOnMount>,
    UnwrapFieldValidateOrFn<TName, TOnChange, TFormOnChange>,
    UnwrapFieldAsyncValidateOrFn<TName, TOnChangeAsync, TFormOnChangeAsync>,
    UnwrapFieldValidateOrFn<TName, TOnBlur, TFormOnBlur>,
    UnwrapFieldAsyncValidateOrFn<TName, TOnBlurAsync, TFormOnBlurAsync>,
    UnwrapFieldValidateOrFn<TName, TOnSubmit, TFormOnSubmit>,
    UnwrapFieldAsyncValidateOrFn<TName, TOnSubmitAsync, TFormOnSubmitAsync>,
    UnwrapFieldValidateOrFn<TName, TOnDynamic, TFormOnDynamic>,
    UnwrapFieldAsyncValidateOrFn<TName, TOnDynamicAsync, TFormOnDynamicAsync>
  >

  /**
   * @private allows tracking the source of the errors in the error map
   */
  errorSourceMap: ValidationErrorMapSource
  /**
   * A flag indicating whether the field is currently being validated.
   */
  isValidating: boolean
}

export type AnyFieldMetaBase = FieldMetaBase<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

export type FieldMetaDerived<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChangeAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnBlurAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnSubmitAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnDynamicAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TFormOnMount extends undefined | FormValidateOrFn<TParentData>,
  TFormOnChange extends undefined | FormValidateOrFn<TParentData>,
  TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnBlur extends undefined | FormValidateOrFn<TParentData>,
  TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>,
  TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>,
  TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
> = {
  /**
   * An array of errors related to the field value.
   */
  errors: Array<
    | UnwrapOneLevelOfArray<
        UnwrapFieldValidateOrFn<TName, TOnMount, TFormOnMount>
      >
    | UnwrapOneLevelOfArray<
        UnwrapFieldValidateOrFn<TName, TOnChange, TFormOnChange>
      >
    | UnwrapOneLevelOfArray<
        UnwrapFieldAsyncValidateOrFn<TName, TOnChangeAsync, TFormOnChangeAsync>
      >
    | UnwrapOneLevelOfArray<
        UnwrapFieldValidateOrFn<TName, TOnBlur, TFormOnBlur>
      >
    | UnwrapOneLevelOfArray<
        UnwrapFieldAsyncValidateOrFn<TName, TOnBlurAsync, TFormOnBlurAsync>
      >
    | UnwrapOneLevelOfArray<
        UnwrapFieldValidateOrFn<TName, TOnSubmit, TFormOnSubmit>
      >
    | UnwrapOneLevelOfArray<
        UnwrapFieldAsyncValidateOrFn<TName, TOnSubmitAsync, TFormOnSubmitAsync>
      >
    | UnwrapOneLevelOfArray<
        UnwrapFieldValidateOrFn<TName, TOnDynamic, TFormOnDynamic>
      >
    | UnwrapOneLevelOfArray<
        UnwrapFieldAsyncValidateOrFn<
          TName,
          TOnDynamicAsync,
          TFormOnDynamicAsync
        >
      >
  >
  /**
   * A flag that is `true` if the field's value has not been modified by the user. Opposite of `isDirty`.
   */
  isPristine: boolean
  /**
   * A boolean indicating if the field is valid. Evaluates `true` if there are no field errors.
   */
  isValid: boolean
  /**
   * A flag indicating whether the field's current value is the default value
   */
  isDefaultValue: boolean
}

export type AnyFieldMetaDerived = FieldMetaDerived<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

/**
 * An object type representing the metadata of a field in a form.
 */
export type FieldMeta<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChangeAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnBlurAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnSubmitAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnDynamicAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TFormOnMount extends undefined | FormValidateOrFn<TParentData>,
  TFormOnChange extends undefined | FormValidateOrFn<TParentData>,
  TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnBlur extends undefined | FormValidateOrFn<TParentData>,
  TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>,
  TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>,
  TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
> = FieldMetaBase<
  TParentData,
  TName,
  TData,
  TOnMount,
  TOnChange,
  TOnChangeAsync,
  TOnBlur,
  TOnBlurAsync,
  TOnSubmit,
  TOnSubmitAsync,
  TOnDynamic,
  TOnDynamicAsync,
  TFormOnMount,
  TFormOnChange,
  TFormOnChangeAsync,
  TFormOnBlur,
  TFormOnBlurAsync,
  TFormOnSubmit,
  TFormOnSubmitAsync,
  TFormOnDynamic,
  TFormOnDynamicAsync
> &
  FieldMetaDerived<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync
  >

export type AnyFieldMeta = FieldMeta<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

/**
 * An object type representing the state of a field.
 */
export type FieldState<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChange extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnChangeAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnBlur extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnBlurAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnSubmit extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnSubmitAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TOnDynamic extends undefined | FieldValidateOrFn<TParentData, TName, TData>,
  TOnDynamicAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  TFormOnMount extends undefined | FormValidateOrFn<TParentData>,
  TFormOnChange extends undefined | FormValidateOrFn<TParentData>,
  TFormOnChangeAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnBlur extends undefined | FormValidateOrFn<TParentData>,
  TFormOnBlurAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>,
  TFormOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
  TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>,
  TFormOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TParentData>,
> = {
  /**
   * The current value of the field.
   */
  value: TData
  /**
   * The current metadata of the field.
   */
  meta: FieldMeta<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync
  >
}

/**
 * @public
 *
 * A type representing the Field API with all generics set to `any` for convenience.
 */
export type AnyFieldApi = FieldApi<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

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
export class FieldApi<
  in out TParentData,
  in out TName extends DeepKeys<TParentData>,
  in out TData extends DeepValue<TParentData, TName>,
  in out TOnMount extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnChange extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnChangeAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  in out TOnBlur extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnBlurAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  in out TOnSubmit extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnSubmitAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  in out TOnDynamic extends
    | undefined
    | FieldValidateOrFn<TParentData, TName, TData>,
  in out TOnDynamicAsync extends
    | undefined
    | FieldAsyncValidateOrFn<TParentData, TName, TData>,
  in out TFormOnMount extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnChange extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnChangeAsync extends
    | undefined
    | FormAsyncValidateOrFn<TParentData>,
  in out TFormOnBlur extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnBlurAsync extends
    | undefined
    | FormAsyncValidateOrFn<TParentData>,
  in out TFormOnSubmit extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnSubmitAsync extends
    | undefined
    | FormAsyncValidateOrFn<TParentData>,
  in out TFormOnDynamic extends undefined | FormValidateOrFn<TParentData>,
  in out TFormOnDynamicAsync extends
    | undefined
    | FormAsyncValidateOrFn<TParentData>,
  in out TFormOnServer extends undefined | FormAsyncValidateOrFn<TParentData>,
  in out TParentSubmitMeta,
> {
  /**
   * A reference to the form API instance.
   */
  form: FieldApiOptions<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync,
    TFormOnServer,
    TParentSubmitMeta
  >['form']
  /**
   * The field name.
   */
  name: TName
  /**
   * The field options.
   */
  options: FieldApiOptions<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync,
    TFormOnServer,
    TParentSubmitMeta
  > = {} as any
  /**
   * The field state store.
   */
  store!: Derived<
    FieldState<
      TParentData,
      TName,
      TData,
      TOnMount,
      TOnChange,
      TOnChangeAsync,
      TOnBlur,
      TOnBlurAsync,
      TOnSubmit,
      TOnSubmitAsync,
      TOnDynamic,
      TOnDynamicAsync,
      TFormOnMount,
      TFormOnChange,
      TFormOnChangeAsync,
      TFormOnBlur,
      TFormOnBlurAsync,
      TFormOnSubmit,
      TFormOnSubmitAsync,
      TFormOnDynamic,
      TFormOnDynamicAsync
    >
  >
  /**
   * The current field state.
   */
  get state() {
    return this.store.state
  }
  timeoutIds: {
    validations: Record<ValidationCause, ReturnType<typeof setTimeout> | null>
    listeners: Record<ListenerCause, ReturnType<typeof setTimeout> | null>
    formListeners: Record<ListenerCause, ReturnType<typeof setTimeout> | null>
  }

  /**
   * Initializes a new `FieldApi` instance.
   */
  constructor(
    opts: FieldApiOptions<
      TParentData,
      TName,
      TData,
      TOnMount,
      TOnChange,
      TOnChangeAsync,
      TOnBlur,
      TOnBlurAsync,
      TOnSubmit,
      TOnSubmitAsync,
      TOnDynamic,
      TOnDynamicAsync,
      TFormOnMount,
      TFormOnChange,
      TFormOnChangeAsync,
      TFormOnBlur,
      TFormOnBlurAsync,
      TFormOnSubmit,
      TFormOnSubmitAsync,
      TFormOnDynamic,
      TFormOnDynamicAsync,
      TFormOnServer,
      TParentSubmitMeta
    >,
  ) {
    this.form = opts.form
    this.name = opts.name
    this.options = opts

    this.timeoutIds = {
      validations: {} as Record<ValidationCause, never>,
      listeners: {} as Record<ListenerCause, never>,
      formListeners: {} as Record<ListenerCause, never>,
    }

    this.store = new Derived({
      deps: [this.form.store],
      fn: ({ prevVal: _prevVal }) => {
        const prevVal = _prevVal as
          | FieldState<
              TParentData,
              TName,
              TData,
              TOnMount,
              TOnChange,
              TOnChangeAsync,
              TOnBlur,
              TOnBlurAsync,
              TOnSubmit,
              TOnSubmitAsync,
              TOnDynamic,
              TOnDynamicAsync,
              TFormOnMount,
              TFormOnChange,
              TFormOnChangeAsync,
              TFormOnBlur,
              TFormOnBlurAsync,
              TFormOnSubmit,
              TFormOnSubmitAsync,
              TFormOnDynamic,
              TFormOnDynamicAsync
            >
          | undefined

        const meta = this.form.getFieldMeta(this.name) ?? {
          ...defaultFieldMeta,
          ...opts.defaultMeta,
        }

        let value = this.form.getFieldValue(this.name)
        if (
          !meta.isTouched &&
          (value as unknown) === undefined &&
          this.options.defaultValue !== undefined &&
          !evaluate(value, this.options.defaultValue)
        ) {
          value = this.options.defaultValue
        }

        if (prevVal && prevVal.value === value && prevVal.meta === meta) {
          return prevVal
        }

        return {
          value,
          meta,
        } as FieldState<
          TParentData,
          TName,
          TData,
          TOnMount,
          TOnChange,
          TOnChangeAsync,
          TOnBlur,
          TOnBlurAsync,
          TOnSubmit,
          TOnSubmitAsync,
          TOnDynamic,
          TOnDynamicAsync,
          TFormOnMount,
          TFormOnChange,
          TFormOnChangeAsync,
          TFormOnBlur,
          TFormOnBlurAsync,
          TFormOnSubmit,
          TFormOnSubmitAsync,
          TFormOnDynamic,
          TFormOnDynamicAsync
        >
      },
    })
  }

  /**
   * @private
   */
  runValidator<
    TValue extends TStandardSchemaValidatorValue<TData> & {
      fieldApi: AnyFieldApi
    },
    TType extends 'validate' | 'validateAsync',
  >(props: {
    validate: TType extends 'validate'
      ? FieldValidateOrFn<any, any, any>
      : FieldAsyncValidateOrFn<any, any, any>
    value: TValue
    type: TType
    // When `api` is 'field', the return type cannot be `FormValidationError`
  }): unknown {
    if (isStandardSchemaValidator(props.validate)) {
      return standardSchemaValidators[props.type](
        props.value,
        props.validate,
      ) as never
    }

    return (props.validate as FieldValidateFn<any, any>)(props.value) as never
  }

  /**
   * Mounts the field instance to the form.
   */
  mount = () => {
    const cleanup = this.store.mount()

    if (this.options.defaultValue !== undefined && !this.getMeta().isTouched) {
      this.form.setFieldValue(this.name, this.options.defaultValue, {
        dontUpdateMeta: true,
      })
    }

    const info = this.getInfo()
    info.instance = this as never

    this.update(this.options as never)

    const { onMount } = this.options.validators || {}

    if (onMount) {
      const error = this.runValidator({
        validate: onMount,
        value: {
          value: this.state.value,
          fieldApi: this,
          validationSource: 'field',
        },
        type: 'validate',
      })
      if (error) {
        this.setMeta(
          (prev) =>
            ({
              ...prev,
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              errorMap: { ...prev?.errorMap, onMount: error },
              errorSourceMap: {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                ...prev?.errorSourceMap,
                onMount: 'field',
              },
            }) as never,
        )
      }
    }

    this.options.listeners?.onMount?.({
      value: this.state.value,
      fieldApi: this,
    })

    return cleanup
  }

  /**
   * Updates the field instance with new options.
   */
  update = (
    opts: FieldApiOptions<
      TParentData,
      TName,
      TData,
      TOnMount,
      TOnChange,
      TOnChangeAsync,
      TOnBlur,
      TOnBlurAsync,
      TOnSubmit,
      TOnSubmitAsync,
      TOnDynamic,
      TOnDynamicAsync,
      TFormOnMount,
      TFormOnChange,
      TFormOnChangeAsync,
      TFormOnBlur,
      TFormOnBlurAsync,
      TFormOnSubmit,
      TFormOnSubmitAsync,
      TFormOnDynamic,
      TFormOnDynamicAsync,
      TFormOnServer,
      TParentSubmitMeta
    >,
  ) => {
    this.options = opts
    this.name = opts.name

    // Default Value
    if (!this.state.meta.isTouched && this.options.defaultValue !== undefined) {
      const formField = this.form.getFieldValue(this.name)
      if (!evaluate(formField, opts.defaultValue)) {
        this.form.setFieldValue(this.name, opts.defaultValue as never, {
          dontUpdateMeta: true,
          dontValidate: true,
          dontRunListeners: true,
        })
      }
    }

    if (!this.form.getFieldMeta(this.name)) {
      this.form.setFieldMeta(this.name, this.state.meta)
    }
  }

  /**
   * Gets the current field value.
   * @deprecated Use `field.state.value` instead.
   */
  getValue = (): TData => {
    return this.form.getFieldValue(this.name) as TData
  }

  /**
   * Sets the field value and run the `change` validator.
   */
  setValue = (updater: Updater<TData>, options?: UpdateMetaOptions) => {
    this.form.setFieldValue(
      this.name,
      updater as never,
      mergeOpts(options, { dontRunListeners: true, dontValidate: true }),
    )

    if (!options?.dontRunListeners) {
      this.triggerOnChangeListener()
    }

    if (!options?.dontValidate) {
      this.validate('change')
    }
  }

  getMeta = () => this.store.state.meta

  /**
   * Sets the field metadata.
   */
  setMeta = (
    updater: Updater<
      FieldMetaBase<
        TParentData,
        TName,
        TData,
        TOnMount,
        TOnChange,
        TOnChangeAsync,
        TOnBlur,
        TOnBlurAsync,
        TOnSubmit,
        TOnSubmitAsync,
        TOnDynamic,
        TOnDynamicAsync,
        TFormOnMount,
        TFormOnChange,
        TFormOnChangeAsync,
        TFormOnBlur,
        TFormOnBlurAsync,
        TFormOnSubmit,
        TFormOnSubmitAsync,
        TFormOnDynamic,
        TFormOnDynamicAsync
      >
    >,
  ) => this.form.setFieldMeta(this.name, updater)

  /**
   * Gets the field information object.
   */
  getInfo = () => this.form.getFieldInfo(this.name)

  /**
   * Pushes a new value to the field.
   */
  pushValue = (
    value: TData extends any[] ? TData[number] : never,
    options?: UpdateMetaOptions,
  ) => {
    this.form.pushFieldValue(
      this.name,
      value as any,
      mergeOpts(options, { dontRunListeners: true }),
    )

    if (!options?.dontRunListeners) {
      this.triggerOnChangeListener()
    }
  }

  /**
   * Inserts a value at the specified index, shifting the subsequent values to the right.
   */
  insertValue = (
    index: number,
    value: TData extends any[] ? TData[number] : never,
    options?: UpdateMetaOptions,
  ) => {
    this.form.insertFieldValue(
      this.name,
      index,
      value as any,
      mergeOpts(options, { dontRunListeners: true }),
    )

    if (!options?.dontRunListeners) {
      this.triggerOnChangeListener()
    }
  }

  /**
   * Replaces a value at the specified index.
   */
  replaceValue = (
    index: number,
    value: TData extends any[] ? TData[number] : never,
    options?: UpdateMetaOptions,
  ) => {
    this.form.replaceFieldValue(
      this.name,
      index,
      value as any,
      mergeOpts(options, { dontRunListeners: true }),
    )

    if (!options?.dontRunListeners) {
      this.triggerOnChangeListener()
    }
  }

  /**
   * Removes a value at the specified index.
   */
  removeValue = (index: number, options?: UpdateMetaOptions) => {
    this.form.removeFieldValue(
      this.name,
      index,
      mergeOpts(options, { dontRunListeners: true }),
    )

    if (!options?.dontRunListeners) {
      this.triggerOnChangeListener()
    }
  }

  /**
   * Swaps the values at the specified indices.
   */
  swapValues = (
    aIndex: number,
    bIndex: number,
    options?: UpdateMetaOptions,
  ) => {
    this.form.swapFieldValues(
      this.name,
      aIndex,
      bIndex,
      mergeOpts(options, { dontRunListeners: true }),
    )

    if (!options?.dontRunListeners) {
      this.triggerOnChangeListener()
    }
  }

  /**
   * Moves the value at the first specified index to the second specified index.
   */
  moveValue = (aIndex: number, bIndex: number, options?: UpdateMetaOptions) => {
    this.form.moveFieldValues(
      this.name,
      aIndex,
      bIndex,
      mergeOpts(options, { dontRunListeners: true }),
    )

    if (!options?.dontRunListeners) {
      this.triggerOnChangeListener()
    }
  }

  /**
   * Clear all values from the array.
   */
  clearValues = (options?: UpdateMetaOptions) => {
    this.form.clearFieldValues(
      this.name,
      mergeOpts(options, { dontRunListeners: true }),
    )

    if (!options?.dontRunListeners) {
      this.triggerOnChangeListener()
    }
  }

  /**
   * @private
   */
  getLinkedFields = (cause: ValidationCause) => {
    const fields = Object.values(this.form.fieldInfo) as FieldInfo<any>[]

    const linkedFields: AnyFieldApi[] = []
    for (const field of fields) {
      if (!field.instance) continue
      const { onChangeListenTo, onBlurListenTo } =
        field.instance.options.validators || {}
      if (cause === 'change' && onChangeListenTo?.includes(this.name)) {
        linkedFields.push(field.instance)
      }
      if (cause === 'blur' && onBlurListenTo?.includes(this.name as string)) {
        linkedFields.push(field.instance)
      }
    }

    return linkedFields
  }

  /**
   * @private
   */
  validateSync = (
    cause: ValidationCause,
    errorFromForm: ValidationErrorMap,
  ) => {
    const validates = getSyncValidatorArray(cause, {
      ...this.options,
      form: this.form,
      validationLogic:
        this.form.options.validationLogic || defaultValidationLogic,
    })

    const linkedFields = this.getLinkedFields(cause)
    const linkedFieldValidates = linkedFields.reduce(
      (acc, field) => {
        const fieldValidates = getSyncValidatorArray(cause, {
          ...field.options,
          form: field.form,
          validationLogic:
            field.form.options.validationLogic || defaultValidationLogic,
        })
        fieldValidates.forEach((validate) => {
          ;(validate as any).field = field
        })
        return acc.concat(fieldValidates as never)
      },
      [] as Array<
        SyncValidator<any> & {
          field: AnyFieldApi
        }
      >,
    )

    // Needs type cast as eslint errantly believes this is always falsy
    let hasErrored = false as boolean

    batch(() => {
      const validateFieldFn = (
        field: AnyFieldApi,
        validateObj: SyncValidator<any>,
      ) => {
        const errorMapKey = getErrorMapKey(validateObj.cause)

        const fieldLevelError = validateObj.validate
          ? normalizeError(
              field.runValidator({
                validate: validateObj.validate,
                value: {
                  value: field.store.state.value,
                  validationSource: 'field',
                  fieldApi: field,
                },
                type: 'validate',
              }),
            )
          : undefined

        const formLevelError = errorFromForm[errorMapKey]

        const { newErrorValue, newSource } =
          determineFieldLevelErrorSourceAndValue({
            formLevelError,
            fieldLevelError,
          })

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (field.state.meta.errorMap?.[errorMapKey] !== newErrorValue) {
          field.setMeta((prev) => ({
            ...prev,
            errorMap: {
              ...prev.errorMap,
              [errorMapKey]: newErrorValue,
            },
            errorSourceMap: {
              ...prev.errorSourceMap,
              [errorMapKey]: newSource,
            },
          }))
        }
        if (newErrorValue) {
          hasErrored = true
        }
      }

      for (const validateObj of validates) {
        validateFieldFn(this, validateObj)
      }
      for (const fieldValitateObj of linkedFieldValidates) {
        if (!fieldValitateObj.validate) continue
        validateFieldFn(fieldValitateObj.field, fieldValitateObj)
      }
    })

    /**
     *  when we have an error for onSubmit in the state, we want
     *  to clear the error as soon as the user enters a valid value in the field
     */
    const submitErrKey = getErrorMapKey('submit')

    if (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      this.state.meta.errorMap?.[submitErrKey] &&
      cause !== 'submit' &&
      !hasErrored
    ) {
      this.setMeta((prev) => ({
        ...prev,
        errorMap: {
          ...prev.errorMap,
          [submitErrKey]: undefined,
        },
        errorSourceMap: {
          ...prev.errorSourceMap,
          [submitErrKey]: undefined,
        },
      }))
    }

    return { hasErrored }
  }

  /**
   * @private
   */
  validateAsync = async (
    cause: ValidationCause,
    formValidationResultPromise: Promise<
      FieldErrorMapFromValidator<
        TParentData,
        TName,
        TData,
        TOnMount,
        TOnChange,
        TOnChangeAsync,
        TOnBlur,
        TOnBlurAsync,
        TOnSubmit,
        TOnSubmitAsync
      >
    >,
  ) => {
    const validates = getAsyncValidatorArray(cause, {
      ...this.options,
      form: this.form,
      validationLogic:
        this.form.options.validationLogic || defaultValidationLogic,
    })

    // Get the field-specific error messages that are coming from the form's validator
    const asyncFormValidationResults = await formValidationResultPromise

    const linkedFields = this.getLinkedFields(cause)
    const linkedFieldValidates = linkedFields.reduce(
      (acc, field) => {
        const fieldValidates = getAsyncValidatorArray(cause, {
          ...field.options,
          form: field.form,
          validationLogic:
            field.form.options.validationLogic || defaultValidationLogic,
        })
        fieldValidates.forEach((validate) => {
          ;(validate as any).field = field
        })
        return acc.concat(fieldValidates as never)
      },
      [] as Array<
        AsyncValidator<any> & {
          field: AnyFieldApi
        }
      >,
    )

    /**
     * We have to use a for loop and generate our promises this way, otherwise it won't be sync
     * when there are no validators needed to be run
     */
    const validatesPromises: Promise<ValidationError | undefined>[] = []
    const linkedPromises: Promise<ValidationError | undefined>[] = []

    // Check if there are actual async validators to run before setting isValidating
    // This prevents unnecessary re-renders when there are no async validators
    // See: https://github.com/TanStack/form/issues/1130
    const hasAsyncValidators =
      validates.some((v) => v.validate) ||
      linkedFieldValidates.some((v) => v.validate)

    if (hasAsyncValidators) {
      if (!this.state.meta.isValidating) {
        this.setMeta((prev) => ({ ...prev, isValidating: true }))
      }

      for (const linkedField of linkedFields) {
        linkedField.setMeta((prev) => ({ ...prev, isValidating: true }))
      }
    }

    const validateFieldAsyncFn = (
      field: AnyFieldApi,
      validateObj: AsyncValidator<any>,
      promises: Promise<ValidationError | undefined>[],
    ) => {
      const errorMapKey = getErrorMapKey(validateObj.cause)
      const fieldValidatorMeta = field.getInfo().validationMetaMap[errorMapKey]

      fieldValidatorMeta?.lastAbortController.abort()
      const controller = new AbortController()

      this.getInfo().validationMetaMap[errorMapKey] = {
        lastAbortController: controller,
      }

      promises.push(
        new Promise<ValidationError | undefined>(async (resolve) => {
          let rawError!: ValidationError | undefined
          try {
            rawError = await new Promise((rawResolve, rawReject) => {
              if (this.timeoutIds.validations[validateObj.cause]) {
                clearTimeout(this.timeoutIds.validations[validateObj.cause]!)
              }

              this.timeoutIds.validations[validateObj.cause] = setTimeout(
                async () => {
                  if (controller.signal.aborted) return rawResolve(undefined)
                  try {
                    rawResolve(
                      await this.runValidator({
                        validate: validateObj.validate,
                        value: {
                          value: field.store.state.value,
                          fieldApi: field,
                          signal: controller.signal,
                          validationSource: 'field',
                        },
                        type: 'validateAsync',
                      }),
                    )
                  } catch (e) {
                    rawReject(e)
                  }
                },
                validateObj.debounceMs,
              )
            })
          } catch (e: unknown) {
            rawError = e as ValidationError
          }
          if (controller.signal.aborted) return resolve(undefined)

          const fieldLevelError = normalizeError(rawError)
          const formLevelError =
            asyncFormValidationResults[this.name]?.[errorMapKey]

          const { newErrorValue, newSource } =
            determineFieldLevelErrorSourceAndValue({
              formLevelError,
              fieldLevelError,
            })

          field.setMeta((prev) => {
            return {
              ...prev,
              errorMap: {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                ...prev?.errorMap,
                [errorMapKey]: newErrorValue,
              },
              errorSourceMap: {
                ...prev.errorSourceMap,
                [errorMapKey]: newSource,
              },
            }
          })

          resolve(newErrorValue)
        }),
      )
    }

    // TODO: Dedupe this logic to reduce bundle size
    for (const validateObj of validates) {
      if (!validateObj.validate) continue
      validateFieldAsyncFn(this, validateObj, validatesPromises)
    }
    for (const fieldValitateObj of linkedFieldValidates) {
      if (!fieldValitateObj.validate) continue
      validateFieldAsyncFn(
        fieldValitateObj.field,
        fieldValitateObj,
        linkedPromises,
      )
    }

    let results: ValidationError[] = []
    if (validatesPromises.length || linkedPromises.length) {
      results = await Promise.all(validatesPromises)
      await Promise.all(linkedPromises)
    }

    // Only reset isValidating if we set it to true earlier
    if (hasAsyncValidators) {
      this.setMeta((prev) => ({ ...prev, isValidating: false }))

      for (const linkedField of linkedFields) {
        linkedField.setMeta((prev) => ({ ...prev, isValidating: false }))
      }
    }

    return results.filter(Boolean)
  }

  /**
   * Validates the field value.
   */
  validate = (
    cause: ValidationCause,
    opts?: { skipFormValidation?: boolean },
  ): ValidationError[] | Promise<ValidationError[]> => {
    // If the field is pristine, do not validate
    if (!this.state.meta.isTouched) return []

    // Attempt to sync validate first
    const { fieldsErrorMap } = opts?.skipFormValidation
      ? { fieldsErrorMap: {} as never }
      : this.form.validateSync(cause)
    const { hasErrored } = this.validateSync(
      cause,
      fieldsErrorMap[this.name] ?? {},
    )

    if (hasErrored && !this.options.asyncAlways) {
      this.getInfo().validationMetaMap[
        getErrorMapKey(cause)
      ]?.lastAbortController.abort()
      return this.state.meta.errors
    }

    // No error? Attempt async validation
    const formValidationResultPromise = opts?.skipFormValidation
      ? Promise.resolve({})
      : this.form.validateAsync(cause)
    return this.validateAsync(cause, formValidationResultPromise)
  }

  /**
   * Handles the change event.
   */
  handleChange = (updater: Updater<TData>) => {
    this.setValue(updater)
  }

  /**
   * Handles the blur event.
   */
  handleBlur = () => {
    const prevTouched = this.state.meta.isTouched
    if (!prevTouched) {
      this.setMeta((prev) => ({ ...prev, isTouched: true }))
    }
    if (!this.state.meta.isBlurred) {
      this.setMeta((prev) => ({ ...prev, isBlurred: true }))
    }
    this.validate('blur')

    this.triggerOnBlurListener()
  }

  /**
   * Updates the field's errorMap
   */
  setErrorMap = (
    errorMap: ValidationErrorMap<
      UnwrapFieldValidateOrFn<TName, TOnMount, TFormOnMount>,
      UnwrapFieldValidateOrFn<TName, TOnChange, TFormOnChange>,
      UnwrapFieldAsyncValidateOrFn<TName, TOnChangeAsync, TFormOnChangeAsync>,
      UnwrapFieldValidateOrFn<TName, TOnBlur, TFormOnBlur>,
      UnwrapFieldAsyncValidateOrFn<TName, TOnBlurAsync, TFormOnBlurAsync>,
      UnwrapFieldValidateOrFn<TName, TOnSubmit, TFormOnSubmit>,
      UnwrapFieldAsyncValidateOrFn<TName, TOnSubmitAsync, TFormOnSubmitAsync>,
      UnwrapFieldValidateOrFn<TName, TOnDynamic, TFormOnDynamic>,
      UnwrapFieldAsyncValidateOrFn<TName, TOnDynamicAsync, TFormOnDynamicAsync>
    >,
  ) => {
    this.setMeta((prev) => ({
      ...prev,
      errorMap: {
        ...prev.errorMap,
        ...errorMap,
      },
    }))
  }

  /**
   * Parses the field's value with the given schema and returns
   * issues (if any). This method does NOT set any internal errors.
   * @param schema The standard schema to parse this field's value with.
   */
  parseValueWithSchema = (schema: StandardSchemaV1<TData, unknown>) => {
    return standardSchemaValidators.validate(
      { value: this.state.value, validationSource: 'field' },
      schema,
    )
  }

  /**
   * Parses the field's value with the given schema and returns
   * issues (if any). This method does NOT set any internal errors.
   * @param schema The standard schema to parse this field's value with.
   */
  parseValueWithSchemaAsync = (schema: StandardSchemaV1<TData, unknown>) => {
    return standardSchemaValidators.validateAsync(
      { value: this.state.value, validationSource: 'field' },
      schema,
    )
  }

  private triggerOnBlurListener() {
    const formDebounceMs = this.form.options.listeners?.onBlurDebounceMs
    if (formDebounceMs && formDebounceMs > 0) {
      if (this.timeoutIds.formListeners.blur) {
        clearTimeout(this.timeoutIds.formListeners.blur)
      }

      this.timeoutIds.formListeners.blur = setTimeout(() => {
        this.form.options.listeners?.onBlur?.({
          formApi: this.form,
          fieldApi: this,
        })
      }, formDebounceMs)
    } else {
      this.form.options.listeners?.onBlur?.({
        formApi: this.form,
        fieldApi: this,
      })
    }

    const fieldDebounceMs = this.options.listeners?.onBlurDebounceMs
    if (fieldDebounceMs && fieldDebounceMs > 0) {
      if (this.timeoutIds.listeners.blur) {
        clearTimeout(this.timeoutIds.listeners.blur)
      }

      this.timeoutIds.listeners.blur = setTimeout(() => {
        this.options.listeners?.onBlur?.({
          value: this.state.value,
          fieldApi: this,
        })
      }, fieldDebounceMs)
    } else {
      this.options.listeners?.onBlur?.({
        value: this.state.value,
        fieldApi: this,
      })
    }
  }

  /**
   * @private
   */
  triggerOnChangeListener = () => {
    const formDebounceMs = this.form.options.listeners?.onChangeDebounceMs
    if (formDebounceMs && formDebounceMs > 0) {
      if (this.timeoutIds.formListeners.change) {
        clearTimeout(this.timeoutIds.formListeners.change)
      }

      this.timeoutIds.formListeners.change = setTimeout(() => {
        this.form.options.listeners?.onChange?.({
          formApi: this.form,
          fieldApi: this,
        })
      }, formDebounceMs)
    } else {
      this.form.options.listeners?.onChange?.({
        formApi: this.form,
        fieldApi: this,
      })
    }

    const fieldDebounceMs = this.options.listeners?.onChangeDebounceMs
    if (fieldDebounceMs && fieldDebounceMs > 0) {
      if (this.timeoutIds.listeners.change) {
        clearTimeout(this.timeoutIds.listeners.change)
      }

      this.timeoutIds.listeners.change = setTimeout(() => {
        this.options.listeners?.onChange?.({
          value: this.state.value,
          fieldApi: this,
        })
      }, fieldDebounceMs)
    } else {
      this.options.listeners?.onChange?.({
        value: this.state.value,
        fieldApi: this,
      })
    }
  }
}

function normalizeError(rawError?: ValidationError) {
  if (rawError) {
    return rawError
  }

  return undefined
}

function getErrorMapKey(cause: ValidationCause) {
  switch (cause) {
    case 'submit':
      return 'onSubmit'
    case 'blur':
      return 'onBlur'
    case 'mount':
      return 'onMount'
    case 'server':
      return 'onServer'
    case 'dynamic':
      return 'onDynamic'
    case 'change':
    default:
      return 'onChange'
  }
}
