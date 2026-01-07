import { FieldGroupApi, DeepKeysOfType, FieldGroupState, FieldsMap, FormAsyncValidateOrFn, FormValidateOrFn } from '@tanstack/form-core';
import { AppFieldExtendedReactFormApi } from './createFormHook.js';
import { ComponentType, FunctionComponent, PropsWithChildren, ReactNode } from 'react';
import { LensFieldComponent } from './useField.js';
/**
 * @private
 */
export type AppFieldExtendedReactFieldGroupApi<TFormData, TFieldGroupData, TFields extends DeepKeysOfType<TFormData, TFieldGroupData | null | undefined> | FieldsMap<TFormData, TFieldGroupData>, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TSubmitMeta, TFieldComponents extends Record<string, ComponentType<any>>, TFormComponents extends Record<string, ComponentType<any>>> = FieldGroupApi<TFormData, TFieldGroupData, TFields, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta> & NoInfer<TFormComponents> & {
    AppField: LensFieldComponent<TFieldGroupData, TSubmitMeta, NoInfer<TFieldComponents>>;
    AppForm: ComponentType<PropsWithChildren<{}>>;
    /**
     * A React component to render form fields. With this, you can render and manage individual form fields.
     */
    Field: LensFieldComponent<TFieldGroupData, TSubmitMeta>;
    /**
     * A `Subscribe` function that allows you to listen and react to changes in the form's state. It's especially useful when you need to execute side effects or render specific components in response to state updates.
     */
    Subscribe: <TSelected = NoInfer<FieldGroupState<TFieldGroupData>>>(props: {
        selector?: (state: NoInfer<FieldGroupState<TFieldGroupData>>) => TSelected;
        children: ((state: NoInfer<TSelected>) => ReactNode) | ReactNode;
    }) => ReturnType<FunctionComponent>;
};
export declare function useFieldGroup<TFormData, TFieldGroupData, TFields extends DeepKeysOfType<TFormData, TFieldGroupData | null | undefined> | FieldsMap<TFormData, TFieldGroupData>, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TComponents extends Record<string, ComponentType<any>>, TFormComponents extends Record<string, ComponentType<any>>, TSubmitMeta = never>(opts: {
    form: AppFieldExtendedReactFormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta, TComponents, TFormComponents> | AppFieldExtendedReactFieldGroupApi<unknown, TFormData, string | FieldsMap<unknown, TFormData>, any, any, any, any, any, any, any, any, any, any, TSubmitMeta, TComponents, TFormComponents>;
    fields: TFields;
    defaultValues?: TFieldGroupData;
    onSubmitMeta?: TSubmitMeta;
    formComponents: TFormComponents;
}): AppFieldExtendedReactFieldGroupApi<TFormData, TFieldGroupData, TFields, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta, TComponents, TFormComponents>;
