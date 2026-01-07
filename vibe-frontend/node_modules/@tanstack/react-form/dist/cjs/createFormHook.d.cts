import { AnyFieldApi, AnyFormApi, BaseFormOptions, DeepKeysOfType, FieldApi, FieldsMap, FormAsyncValidateOrFn, FormOptions, FormValidateOrFn } from '@tanstack/form-core';
import { ComponentType, Context, FunctionComponent, PropsWithChildren } from 'react';
import { FieldComponent } from './useField.cjs';
import { ReactFormExtendedApi } from './useForm.cjs';
import { AppFieldExtendedReactFieldGroupApi } from './useFieldGroup.cjs';
/**
 * TypeScript inferencing is weird.
 *
 * If you have:
 *
 * @example
 *
 * interface Args<T> {
 *     arg?: T
 * }
 *
 * function test<T>(arg?: Partial<Args<T>>): T {
 *     return 0 as any;
 * }
 *
 * const a = test({});
 *
 * Then `T` will default to `unknown`.
 *
 * However, if we change `test` to be:
 *
 * @example
 *
 * function test<T extends undefined>(arg?: Partial<Args<T>>): T;
 *
 * Then `T` becomes `undefined`.
 *
 * Here, we are checking if the passed type `T` extends `DefaultT` and **only**
 * `DefaultT`, as if that's the case we assume that inferencing has not occurred.
 */
type UnwrapOrAny<T> = [unknown] extends [T] ? any : T;
type UnwrapDefaultOrAny<DefaultT, T> = [DefaultT] extends [T] ? [T] extends [DefaultT] ? any : T : T;
export declare function createFormHookContexts(): {
    fieldContext: Context<AnyFieldApi>;
    useFieldContext: <TData>() => FieldApi<any, string, TData, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>;
    useFormContext: () => ReactFormExtendedApi<Record<string, never>, any, any, any, any, any, any, any, any, any, any, any>;
    formContext: Context<AnyFormApi>;
};
interface CreateFormHookProps<TFieldComponents extends Record<string, ComponentType<any>>, TFormComponents extends Record<string, ComponentType<any>>> {
    fieldComponents: TFieldComponents;
    fieldContext: Context<AnyFieldApi>;
    formComponents: TFormComponents;
    formContext: Context<AnyFormApi>;
}
/**
 * @private
 */
export type AppFieldExtendedReactFormApi<TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TSubmitMeta, TFieldComponents extends Record<string, ComponentType<any>>, TFormComponents extends Record<string, ComponentType<any>>> = ReactFormExtendedApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta> & NoInfer<TFormComponents> & {
    AppField: FieldComponent<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta, NoInfer<TFieldComponents>>;
    AppForm: ComponentType<PropsWithChildren<{}>>;
};
export interface WithFormProps<TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TSubmitMeta, TFieldComponents extends Record<string, ComponentType<any>>, TFormComponents extends Record<string, ComponentType<any>>, TRenderProps extends object = Record<string, never>> extends FormOptions<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta> {
    props?: TRenderProps;
    render: FunctionComponent<PropsWithChildren<NoInfer<TRenderProps> & {
        form: AppFieldExtendedReactFormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta, TFieldComponents, TFormComponents>;
    }>>;
}
export interface WithFieldGroupProps<TFieldGroupData, TFieldComponents extends Record<string, ComponentType<any>>, TFormComponents extends Record<string, ComponentType<any>>, TSubmitMeta, TRenderProps extends object = Record<string, never>> extends BaseFormOptions<TFieldGroupData, TSubmitMeta> {
    props?: TRenderProps;
    render: FunctionComponent<PropsWithChildren<NoInfer<TRenderProps> & {
        group: AppFieldExtendedReactFieldGroupApi<unknown, TFieldGroupData, string | FieldsMap<unknown, TFieldGroupData>, undefined | FormValidateOrFn<unknown>, undefined | FormValidateOrFn<unknown>, undefined | FormAsyncValidateOrFn<unknown>, undefined | FormValidateOrFn<unknown>, undefined | FormAsyncValidateOrFn<unknown>, undefined | FormValidateOrFn<unknown>, undefined | FormAsyncValidateOrFn<unknown>, undefined | FormValidateOrFn<unknown>, undefined | FormAsyncValidateOrFn<unknown>, undefined | FormAsyncValidateOrFn<unknown>, unknown extends TSubmitMeta ? never : TSubmitMeta, TFieldComponents, TFormComponents>;
    }>>;
}
export declare function createFormHook<const TComponents extends Record<string, ComponentType<any>>, const TFormComponents extends Record<string, ComponentType<any>>>({ fieldComponents, fieldContext, formContext, formComponents, }: CreateFormHookProps<TComponents, TFormComponents>): {
    useAppForm: <TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TSubmitMeta>(props: FormOptions<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta>) => AppFieldExtendedReactFormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta, TComponents, TFormComponents>;
    withForm: <TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TSubmitMeta, TRenderProps extends object = {}>({ render, props, }: WithFormProps<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, TSubmitMeta, TComponents, TFormComponents, TRenderProps>) => WithFormProps<UnwrapOrAny<TFormData>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnMount>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnChange>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnChangeAsync>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnBlur>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnBlurAsync>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnSubmit>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnDynamic>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync>, UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnServer>, UnwrapOrAny<TSubmitMeta>, UnwrapOrAny<TComponents>, UnwrapOrAny<TFormComponents>, UnwrapOrAny<TRenderProps>>["render"];
    withFieldGroup: <TFieldGroupData, TSubmitMeta, TRenderProps extends object = {}>({ render, props, defaultValues, }: WithFieldGroupProps<TFieldGroupData, TComponents, TFormComponents, TSubmitMeta, TRenderProps>) => <TFormData, TFields extends DeepKeysOfType<TFormData, TFieldGroupData | null | undefined> | FieldsMap<TFormData, TFieldGroupData>, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnBlur extends undefined | FormValidateOrFn<TFormData>, TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnSubmit extends undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnDynamic extends undefined | FormValidateOrFn<TFormData>, TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>, TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>, TFormSubmitMeta>(params: PropsWithChildren<NoInfer<TRenderProps> & {
        form: AppFieldExtendedReactFormApi<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync, TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer, unknown extends TSubmitMeta ? TFormSubmitMeta : TSubmitMeta, TComponents, TFormComponents> | AppFieldExtendedReactFieldGroupApi<unknown, TFormData, string | FieldsMap<unknown, TFormData>, any, any, any, any, any, any, any, any, any, any, unknown extends TSubmitMeta ? TFormSubmitMeta : TSubmitMeta, TComponents, TFormComponents>;
        fields: TFields;
    }>) => ReturnType<FunctionComponent>;
};
export {};
