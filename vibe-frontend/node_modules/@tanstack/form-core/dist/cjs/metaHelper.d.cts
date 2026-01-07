import { FormApi, FormAsyncValidateOrFn, FormValidateOrFn } from './FormApi.cjs';
import { AnyFieldMeta } from './FieldApi.cjs';
import { DeepKeys } from './util-types.cjs';
export declare const defaultFieldMeta: AnyFieldMeta;
export declare function metaHelper<TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TSubmitMeta = never>(formApi: FormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>): {
    handleArrayMove: (field: DeepKeys<TFormData>, fromIndex: number, toIndex: number) => void;
    handleArrayRemove: (field: DeepKeys<TFormData>, index: number) => void;
    handleArraySwap: (field: DeepKeys<TFormData>, index: number, secondIndex: number) => void;
    handleArrayInsert: (field: DeepKeys<TFormData>, insertIndex: number) => void;
};
