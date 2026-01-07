import { Derived } from '@tanstack/store'
import { concatenatePaths, getBy, makePathArray } from './utils'
import type { Updater } from './utils'
import type {
  FormApi,
  FormAsyncValidateOrFn,
  FormValidateOrFn,
} from './FormApi'
import type { AnyFieldMetaBase, FieldOptions } from './FieldApi'
import type {
  DeepKeys,
  DeepKeysOfType,
  DeepValue,
  FieldsMap,
} from './util-types'
import type {
  FieldManipulator,
  UpdateMetaOptions,
  ValidationCause,
} from './types'

export type AnyFieldGroupApi = FieldGroupApi<
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

export interface FieldGroupState<in out TFieldGroupData> {
  /**
   * The current values of the field group
   */
  values: TFieldGroupData
}

/**
 * An object representing the options for a field group.
 */
export interface FieldGroupOptions<
  in out TFormData,
  in out TFieldGroupData,
  in out TFields extends
    | DeepKeysOfType<TFormData, TFieldGroupData | null | undefined>
    | FieldsMap<TFormData, TFieldGroupData>,
  in out TOnMount extends undefined | FormValidateOrFn<TFormData>,
  in out TOnChange extends undefined | FormValidateOrFn<TFormData>,
  in out TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TOnBlur extends undefined | FormValidateOrFn<TFormData>,
  in out TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
  in out TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
  in out TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TSubmitMeta = never,
> {
  form:
    | FormApi<
        TFormData,
        TOnMount,
        TOnChange,
        TOnChangeAsync,
        TOnBlur,
        TOnBlurAsync,
        TOnSubmit,
        TOnSubmitAsync,
        TOnDynamic,
        TOnDynamicAsync,
        TOnServer,
        TSubmitMeta
      >
    | FieldGroupApi<
        any,
        TFormData,
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
        TSubmitMeta
      >
  /**
   * The path to the field group data.
   */
  fields: TFields
  /**
   * The expected subsetValues that the form must provide.
   */
  defaultValues?: TFieldGroupData
  /**
   * onSubmitMeta, the data passed from the handleSubmit handler, to the onSubmit function props
   */
  onSubmitMeta?: TSubmitMeta
}

export class FieldGroupApi<
  in out TFormData,
  in out TFieldGroupData,
  in out TFields extends
    | DeepKeysOfType<TFormData, TFieldGroupData | null | undefined>
    | FieldsMap<TFormData, TFieldGroupData>,
  in out TOnMount extends undefined | FormValidateOrFn<TFormData>,
  in out TOnChange extends undefined | FormValidateOrFn<TFormData>,
  in out TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TOnBlur extends undefined | FormValidateOrFn<TFormData>,
  in out TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
  in out TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
  in out TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
  in out TSubmitMeta = never,
> implements FieldManipulator<TFieldGroupData, TSubmitMeta> {
  /**
   * The form that called this field group.
   */
  readonly form: FormApi<
    TFormData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  >

  readonly fieldsMap: TFields

  /**
   * Get the true name of the field. Not required within `Field` or `AppField`.
   * @private
   */
  getFormFieldName = <TField extends DeepKeys<TFieldGroupData>>(
    subfield: TField,
  ): DeepKeys<TFormData> => {
    if (typeof this.fieldsMap === 'string') {
      return concatenatePaths(this.fieldsMap, subfield)
    }

    const firstAccessor = makePathArray(subfield)[0]
    if (typeof firstAccessor !== 'string') {
      // top-level arrays cannot be mapped
      return ''
    }

    const restOfPath = subfield.slice(firstAccessor.length)
    const formMappedPath =
      // TFields is either a string or this. See guard above.
      (this.fieldsMap as FieldsMap<TFormData, TFieldGroupData>)[
        firstAccessor as keyof TFieldGroupData
      ]

    return concatenatePaths(formMappedPath, restOfPath)
  }

  /**
   * Get the field options with the true form DeepKeys for validators
   * @private
   */
  getFormFieldOptions = <
    TOptions extends FieldOptions<
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
    >,
  >(
    props: TOptions,
  ): TOptions => {
    const newProps = { ...props }
    const validators = newProps.validators

    newProps.name = this.getFormFieldName(props.name)

    if (
      validators &&
      (validators.onChangeListenTo || validators.onBlurListenTo)
    ) {
      const newValidators = { ...validators }

      const remapListenTo = (listenTo: DeepKeys<any>[] | undefined) => {
        if (!listenTo) return undefined
        return listenTo.map((localFieldName) =>
          this.getFormFieldName(localFieldName),
        )
      }

      newValidators.onChangeListenTo = remapListenTo(
        validators.onChangeListenTo,
      )
      newValidators.onBlurListenTo = remapListenTo(validators.onBlurListenTo)

      newProps.validators = newValidators
    }

    return newProps
  }

  store: Derived<FieldGroupState<TFieldGroupData>>

  get state() {
    return this.store.state
  }

  /**
   * Constructs a new `FieldGroupApi` instance with the given form options.
   */
  constructor(
    opts: FieldGroupOptions<
      TFormData,
      TFieldGroupData,
      TFields,
      TOnMount,
      TOnChange,
      TOnChangeAsync,
      TOnBlur,
      TOnBlurAsync,
      TOnSubmit,
      TOnSubmitAsync,
      TOnDynamic,
      TOnDynamicAsync,
      TOnServer,
      TSubmitMeta
    >,
  ) {
    if (opts.form instanceof FieldGroupApi) {
      const group = opts.form
      this.form = group.form as never

      // the DeepKey is already namespaced, so we need to ensure that we reference
      // the form and not the group
      if (typeof opts.fields === 'string') {
        this.fieldsMap = group.getFormFieldName(opts.fields) as TFields
      } else {
        // TypeScript has a tough time with generics being a union for some reason
        const fields = {
          ...(opts.fields as FieldsMap<TFormData, TFieldGroupData>),
        }
        for (const key in fields) {
          fields[key] = group.getFormFieldName(fields[key]) as never
        }
        this.fieldsMap = fields as never
      }
    } else {
      this.form = opts.form
      this.fieldsMap = opts.fields
    }

    this.store = new Derived({
      deps: [this.form.store],
      fn: ({ currDepVals }) => {
        const currFormStore = currDepVals[0]
        let values: TFieldGroupData
        if (typeof this.fieldsMap === 'string') {
          // all values live at that name, so we can directly fetch it
          values = getBy(currFormStore.values, this.fieldsMap)
        } else {
          // we need to fetch the values from all places where they were mapped from
          values = {} as never
          const fields: Record<keyof TFieldGroupData, string> = this
            .fieldsMap as never
          for (const key in fields) {
            values[key] = getBy(currFormStore.values, fields[key])
          }
        }

        return {
          values,
        }
      },
    })
  }

  /**
   * Mounts the field group instance to listen to value changes.
   */
  mount = () => {
    const cleanup = this.store.mount()

    return cleanup
  }

  /**
   * Validates the children of a specified array in the form starting from a given index until the end using the correct handlers for a given validation type.
   */
  validateArrayFieldsStartingFrom = async <
    TField extends DeepKeysOfType<TFieldGroupData, any[]>,
  >(
    field: TField,
    index: number,
    cause: ValidationCause,
  ) => {
    return this.form.validateArrayFieldsStartingFrom(
      this.getFormFieldName(field),
      index,
      cause,
    )
  }

  /**
   * Validates a specified field in the form using the correct handlers for a given validation type.
   */
  validateField = <TField extends DeepKeys<TFieldGroupData>>(
    field: TField,
    cause: ValidationCause,
  ) => {
    return this.form.validateField(this.getFormFieldName(field), cause)
  }

  /**
   * Handles the form submission, performs validation, and calls the appropriate onSubmit or onSubmitInvalid callbacks.
   */
  handleSubmit(): Promise<void>
  handleSubmit(submitMeta: TSubmitMeta): Promise<void>
  async handleSubmit(submitMeta?: TSubmitMeta): Promise<void> {
    // cast is required since the implementation isn't one of the two overloads
    return this.form.handleSubmit(submitMeta as any)
  }

  /**
   * Gets the value of the specified field.
   */
  getFieldValue = <TField extends DeepKeys<TFieldGroupData>>(
    field: TField,
  ): DeepValue<TFieldGroupData, TField> => {
    return this.form.getFieldValue(this.getFormFieldName(field)) as DeepValue<
      TFieldGroupData,
      TField
    >
  }

  /**
   * Gets the metadata of the specified field.
   */
  getFieldMeta = <TField extends DeepKeys<TFieldGroupData>>(field: TField) => {
    return this.form.getFieldMeta(this.getFormFieldName(field))
  }

  /**
   * Updates the metadata of the specified field.
   */
  setFieldMeta = <TField extends DeepKeys<TFieldGroupData>>(
    field: TField,
    updater: Updater<AnyFieldMetaBase>,
  ) => {
    return this.form.setFieldMeta(this.getFormFieldName(field), updater)
  }

  /**
   * Sets the value of the specified field and optionally updates the touched state.
   */
  setFieldValue = <TField extends DeepKeys<TFieldGroupData>>(
    field: TField,
    updater: Updater<DeepValue<TFieldGroupData, TField>>,
    opts?: UpdateMetaOptions,
  ) => {
    return this.form.setFieldValue(
      this.getFormFieldName(field) as never,
      updater as never,
      opts,
    )
  }

  /**
   * Delete a field and its subfields.
   */
  deleteField = <TField extends DeepKeys<TFieldGroupData>>(field: TField) => {
    return this.form.deleteField(this.getFormFieldName(field))
  }

  /**
   * Pushes a value into an array field.
   */
  pushFieldValue = <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(
    field: TField,
    value: DeepValue<TFieldGroupData, TField> extends any[]
      ? DeepValue<TFieldGroupData, TField>[number]
      : never,
    opts?: UpdateMetaOptions,
  ) => {
    return this.form.pushFieldValue(
      this.getFormFieldName(field),
      // since unknown doesn't extend an array, it types `value` as never.
      value as never,
      opts,
    )
  }

  /**
   * Insert a value into an array field at the specified index.
   */
  insertFieldValue = async <
    TField extends DeepKeysOfType<TFieldGroupData, any[]>,
  >(
    field: TField,
    index: number,
    value: DeepValue<TFieldGroupData, TField> extends any[]
      ? DeepValue<TFieldGroupData, TField>[number]
      : never,
    opts?: UpdateMetaOptions,
  ) => {
    return this.form.insertFieldValue(
      this.getFormFieldName(field),
      index,
      // since unknown doesn't extend an array, it types `value` as never.
      value as never,
      opts,
    )
  }

  /**
   * Replaces a value into an array field at the specified index.
   */
  replaceFieldValue = async <
    TField extends DeepKeysOfType<TFieldGroupData, any[]>,
  >(
    field: TField,
    index: number,
    value: DeepValue<TFieldGroupData, TField> extends any[]
      ? DeepValue<TFieldGroupData, TField>[number]
      : never,
    opts?: UpdateMetaOptions,
  ) => {
    return this.form.replaceFieldValue(
      this.getFormFieldName(field),
      index,
      // since unknown doesn't extend an array, it types `value` as never.
      value as never,
      opts,
    )
  }

  /**
   * Removes a value from an array field at the specified index.
   */
  removeFieldValue = async <
    TField extends DeepKeysOfType<TFieldGroupData, any[]>,
  >(
    field: TField,
    index: number,
    opts?: UpdateMetaOptions,
  ) => {
    return this.form.removeFieldValue(this.getFormFieldName(field), index, opts)
  }

  /**
   * Swaps the values at the specified indices within an array field.
   */
  swapFieldValues = <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(
    field: TField,
    index1: number,
    index2: number,
    opts?: UpdateMetaOptions,
  ) => {
    return this.form.swapFieldValues(
      this.getFormFieldName(field),
      index1,
      index2,
      opts,
    )
  }

  /**
   * Moves the value at the first specified index to the second specified index within an array field.
   */
  moveFieldValues = <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(
    field: TField,
    index1: number,
    index2: number,
    opts?: UpdateMetaOptions,
  ) => {
    return this.form.moveFieldValues(
      this.getFormFieldName(field),
      index1,
      index2,
      opts,
    )
  }

  clearFieldValues = <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(
    field: TField,
    opts?: UpdateMetaOptions,
  ) => {
    return this.form.clearFieldValues(this.getFormFieldName(field), opts)
  }

  /**
   * Resets the field value and meta to default state
   */
  resetField = <TField extends DeepKeys<TFieldGroupData>>(field: TField) => {
    return this.form.resetField(this.getFormFieldName(field))
  }

  validateAllFields = (cause: ValidationCause) =>
    this.form.validateAllFields(cause)
}
