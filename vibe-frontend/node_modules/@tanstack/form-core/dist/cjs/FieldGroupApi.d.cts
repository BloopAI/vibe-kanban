import { Derived } from '@tanstack/store';
import { Updater } from './utils.cjs';
import { FormApi, FormAsyncValidateOrFn, FormValidateOrFn } from './FormApi.cjs';
import { AnyFieldMetaBase, FieldOptions } from './FieldApi.cjs';
import { DeepKeys, DeepKeysOfType, DeepValue, FieldsMap } from './util-types.cjs';
import { FieldManipulator, UpdateMetaOptions, ValidationCause } from './types.cjs';
export type AnyFieldGroupApi = FieldGroupApi<any, any, any, any, any, any, any, any, any, any, any, any, any, any>;
export interface FieldGroupState<in out TFieldGroupData> {
    /**
     * The current values of the field group
     */
    values: TFieldGroupData;
}
/**
 * An object representing the options for a field group.
 */
export interface FieldGroupOptions<in out TFormData, in out TFieldGroupData, in out TFields extends DeepKeysOfType<TFormData, TFieldGroupData | null | undefined> | FieldsMap<TFormData, TFieldGroupData>, in out TOnMount extends undefined | FormValidateOrFn<TFormData>, in out TOnChange extends undefined | FormValidateOrFn<TFormData>, in out TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnBlur extends undefined | FormValidateOrFn<TFormData>, in out TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnSubmit extends undefined | FormValidateOrFn<TFormData>, in out TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnDynamic extends undefined | FormValidateOrFn<TFormData>, in out TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, in out TSubmitMeta = never> {
    form: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta> | FieldGroupApi<any, TFormData, any, any, any, any, any, any, any, any, any, any, any, TSubmitMeta>;
    /**
     * The path to the field group data.
     */
    fields: TFields;
    /**
     * The expected subsetValues that the form must provide.
     */
    defaultValues?: TFieldGroupData;
    /**
     * onSubmitMeta, the data passed from the handleSubmit handler, to the onSubmit function props
     */
    onSubmitMeta?: TSubmitMeta;
}
export declare class FieldGroupApi<in out TFormData, in out TFieldGroupData, in out TFields extends DeepKeysOfType<TFormData, TFieldGroupData | null | undefined> | FieldsMap<TFormData, TFieldGroupData>, in out TOnMount extends undefined | FormValidateOrFn<TFormData>, in out TOnChange extends undefined | FormValidateOrFn<TFormData>, in out TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnBlur extends undefined | FormValidateOrFn<TFormData>, in out TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnSubmit extends undefined | FormValidateOrFn<TFormData>, in out TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnDynamic extends undefined | FormValidateOrFn<TFormData>, in out TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, in out TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, in out TSubmitMeta = never> implements FieldManipulator<TFieldGroupData, TSubmitMeta> {
    /**
     * The form that called this field group.
     */
    readonly form: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>;
    readonly fieldsMap: TFields;
    /**
     * Get the true name of the field. Not required within `Field` or `AppField`.
     * @private
     */
    getFormFieldName: <TField extends DeepKeys<TFieldGroupData>>(subfield: TField) => DeepKeys<TFormData>;
    /**
     * Get the field options with the true form DeepKeys for validators
     * @private
     */
    getFormFieldOptions: <TOptions extends FieldOptions<any, any, any, any, any, any, any, any, any, any, any, any>>(props: TOptions) => TOptions;
    store: Derived<FieldGroupState<TFieldGroupData>>;
    get state(): FieldGroupState<TFieldGroupData>;
    /**
     * Constructs a new `FieldGroupApi` instance with the given form options.
     */
    constructor(opts: FieldGroupOptions<TFormData, TFieldGroupData, TFields, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>);
    /**
     * Mounts the field group instance to listen to value changes.
     */
    mount: () => () => void;
    /**
     * Validates the children of a specified array in the form starting from a given index until the end using the correct handlers for a given validation type.
     */
    validateArrayFieldsStartingFrom: <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(field: TField, index: number, cause: ValidationCause) => Promise<unknown[]>;
    /**
     * Validates a specified field in the form using the correct handlers for a given validation type.
     */
    validateField: <TField extends DeepKeys<TFieldGroupData>>(field: TField, cause: ValidationCause) => unknown[] | Promise<unknown[]>;
    /**
     * Handles the form submission, performs validation, and calls the appropriate onSubmit or onSubmitInvalid callbacks.
     */
    handleSubmit(): Promise<void>;
    handleSubmit(submitMeta: TSubmitMeta): Promise<void>;
    /**
     * Gets the value of the specified field.
     */
    getFieldValue: <TField extends DeepKeys<TFieldGroupData>>(field: TField) => DeepValue<TFieldGroupData, TField>;
    /**
     * Gets the metadata of the specified field.
     */
    getFieldMeta: <TField extends DeepKeys<TFieldGroupData>>(field: TField) => import('./FieldApi.cjs').AnyFieldMeta | undefined;
    /**
     * Updates the metadata of the specified field.
     */
    setFieldMeta: <TField extends DeepKeys<TFieldGroupData>>(field: TField, updater: Updater<AnyFieldMetaBase>) => void;
    /**
     * Sets the value of the specified field and optionally updates the touched state.
     */
    setFieldValue: <TField extends DeepKeys<TFieldGroupData>>(field: TField, updater: Updater<DeepValue<TFieldGroupData, TField>>, opts?: UpdateMetaOptions) => void;
    /**
     * Delete a field and its subfields.
     */
    deleteField: <TField extends DeepKeys<TFieldGroupData>>(field: TField) => void;
    /**
     * Pushes a value into an array field.
     */
    pushFieldValue: <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(field: TField, value: DeepValue<TFieldGroupData, TField> extends any[] ? DeepValue<TFieldGroupData, TField>[number] : never, opts?: UpdateMetaOptions) => void;
    /**
     * Insert a value into an array field at the specified index.
     */
    insertFieldValue: <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(field: TField, index: number, value: DeepValue<TFieldGroupData, TField> extends any[] ? DeepValue<TFieldGroupData, TField>[number] : never, opts?: UpdateMetaOptions) => Promise<void>;
    /**
     * Replaces a value into an array field at the specified index.
     */
    replaceFieldValue: <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(field: TField, index: number, value: DeepValue<TFieldGroupData, TField> extends any[] ? DeepValue<TFieldGroupData, TField>[number] : never, opts?: UpdateMetaOptions) => Promise<void>;
    /**
     * Removes a value from an array field at the specified index.
     */
    removeFieldValue: <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(field: TField, index: number, opts?: UpdateMetaOptions) => Promise<void>;
    /**
     * Swaps the values at the specified indices within an array field.
     */
    swapFieldValues: <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(field: TField, index1: number, index2: number, opts?: UpdateMetaOptions) => void;
    /**
     * Moves the value at the first specified index to the second specified index within an array field.
     */
    moveFieldValues: <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(field: TField, index1: number, index2: number, opts?: UpdateMetaOptions) => void;
    clearFieldValues: <TField extends DeepKeysOfType<TFieldGroupData, any[]>>(field: TField, opts?: UpdateMetaOptions) => void;
    /**
     * Resets the field value and meta to default state
     */
    resetField: <TField extends DeepKeys<TFieldGroupData>>(field: TField) => void;
    validateAllFields: (cause: ValidationCause) => Promise<unknown[]>;
}
