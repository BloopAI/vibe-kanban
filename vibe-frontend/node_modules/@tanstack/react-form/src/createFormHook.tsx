'use client'
/* eslint-disable @eslint-react/no-context-provider */
import { createContext, useContext, useMemo } from 'react'
import { useForm } from './useForm'
import { useFieldGroup } from './useFieldGroup'
import type {
  AnyFieldApi,
  AnyFormApi,
  BaseFormOptions,
  DeepKeysOfType,
  FieldApi,
  FieldsMap,
  FormAsyncValidateOrFn,
  FormOptions,
  FormValidateOrFn,
} from '@tanstack/form-core'
import type {
  ComponentType,
  Context,
  FunctionComponent,
  PropsWithChildren,
} from 'react'
import type { FieldComponent } from './useField'
import type { ReactFormExtendedApi } from './useForm'
import type { AppFieldExtendedReactFieldGroupApi } from './useFieldGroup'

// We should never hit the `null` case here
const fieldContext = createContext<AnyFieldApi>(null as never)
const formContext = createContext<AnyFormApi>(null as never)

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
type UnwrapOrAny<T> = [unknown] extends [T] ? any : T
type UnwrapDefaultOrAny<DefaultT, T> = [DefaultT] extends [T]
  ? [T] extends [DefaultT]
    ? any
    : T
  : T

export function createFormHookContexts() {
  function useFieldContext<TData>() {
    const field = useContext(fieldContext)

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!field) {
      throw new Error(
        '`fieldContext` only works when within a `fieldComponent` passed to `createFormHook`',
      )
    }

    return field as FieldApi<
      any,
      string,
      TData,
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
  }

  function useFormContext() {
    const form = useContext(formContext)

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!form) {
      throw new Error(
        '`formContext` only works when within a `formComponent` passed to `createFormHook`',
      )
    }

    return form as ReactFormExtendedApi<
      // If you need access to the form data, you need to use `withForm` instead
      Record<string, never>,
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
  }

  return { fieldContext, useFieldContext, useFormContext, formContext }
}

interface CreateFormHookProps<
  TFieldComponents extends Record<string, ComponentType<any>>,
  TFormComponents extends Record<string, ComponentType<any>>,
> {
  fieldComponents: TFieldComponents
  fieldContext: Context<AnyFieldApi>
  formComponents: TFormComponents
  formContext: Context<AnyFormApi>
}

/**
 * @private
 */
export type AppFieldExtendedReactFormApi<
  TFormData,
  TOnMount extends undefined | FormValidateOrFn<TFormData>,
  TOnChange extends undefined | FormValidateOrFn<TFormData>,
  TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnBlur extends undefined | FormValidateOrFn<TFormData>,
  TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
  TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
  TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
  TSubmitMeta,
  TFieldComponents extends Record<string, ComponentType<any>>,
  TFormComponents extends Record<string, ComponentType<any>>,
> = ReactFormExtendedApi<
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
> &
  NoInfer<TFormComponents> & {
    AppField: FieldComponent<
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
      TSubmitMeta,
      NoInfer<TFieldComponents>
    >
    AppForm: ComponentType<
      // PropsWithChildren<P> is not optional in React 17
      PropsWithChildren<{}>
    >
  }

export interface WithFormProps<
  TFormData,
  TOnMount extends undefined | FormValidateOrFn<TFormData>,
  TOnChange extends undefined | FormValidateOrFn<TFormData>,
  TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnBlur extends undefined | FormValidateOrFn<TFormData>,
  TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
  TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
  TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
  TSubmitMeta,
  TFieldComponents extends Record<string, ComponentType<any>>,
  TFormComponents extends Record<string, ComponentType<any>>,
  TRenderProps extends object = Record<string, never>,
> extends FormOptions<
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
> {
  // Optional, but adds props to the `render` function outside of `form`
  props?: TRenderProps
  render: FunctionComponent<
    PropsWithChildren<
      NoInfer<TRenderProps> & {
        form: AppFieldExtendedReactFormApi<
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
          TSubmitMeta,
          TFieldComponents,
          TFormComponents
        >
      }
    >
  >
}

export interface WithFieldGroupProps<
  TFieldGroupData,
  TFieldComponents extends Record<string, ComponentType<any>>,
  TFormComponents extends Record<string, ComponentType<any>>,
  TSubmitMeta,
  TRenderProps extends object = Record<string, never>,
> extends BaseFormOptions<TFieldGroupData, TSubmitMeta> {
  // Optional, but adds props to the `render` function outside of `form`
  props?: TRenderProps
  render: FunctionComponent<
    PropsWithChildren<
      NoInfer<TRenderProps> & {
        group: AppFieldExtendedReactFieldGroupApi<
          unknown,
          TFieldGroupData,
          string | FieldsMap<unknown, TFieldGroupData>,
          undefined | FormValidateOrFn<unknown>,
          undefined | FormValidateOrFn<unknown>,
          undefined | FormAsyncValidateOrFn<unknown>,
          undefined | FormValidateOrFn<unknown>,
          undefined | FormAsyncValidateOrFn<unknown>,
          undefined | FormValidateOrFn<unknown>,
          undefined | FormAsyncValidateOrFn<unknown>,
          undefined | FormValidateOrFn<unknown>,
          undefined | FormAsyncValidateOrFn<unknown>,
          undefined | FormAsyncValidateOrFn<unknown>,
          // this types it as 'never' in the render prop. It should prevent any
          // untyped meta passed to the handleSubmit by accident.
          unknown extends TSubmitMeta ? never : TSubmitMeta,
          TFieldComponents,
          TFormComponents
        >
      }
    >
  >
}

export function createFormHook<
  const TComponents extends Record<string, ComponentType<any>>,
  const TFormComponents extends Record<string, ComponentType<any>>,
>({
  fieldComponents,
  fieldContext,
  formContext,
  formComponents,
}: CreateFormHookProps<TComponents, TFormComponents>) {
  function useAppForm<
    TFormData,
    TOnMount extends undefined | FormValidateOrFn<TFormData>,
    TOnChange extends undefined | FormValidateOrFn<TFormData>,
    TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnBlur extends undefined | FormValidateOrFn<TFormData>,
    TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
    TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
    TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
    TSubmitMeta,
  >(
    props: FormOptions<
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
    >,
  ): AppFieldExtendedReactFormApi<
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
    TSubmitMeta,
    TComponents,
    TFormComponents
  > {
    const form = useForm(props)

    // PropsWithChildren<P> is not optional in React 17
    const AppForm = useMemo<ComponentType<PropsWithChildren<{}>>>(() => {
      return ({ children }) => {
        return (
          <formContext.Provider value={form}>{children}</formContext.Provider>
        )
      }
    }, [form])

    const AppField = useMemo(() => {
      const AppField = (({ children, ...props }) => {
        return (
          <form.Field {...props}>
            {(field) => (
              // eslint-disable-next-line @eslint-react/no-context-provider
              <fieldContext.Provider value={field}>
                {children(Object.assign(field, fieldComponents))}
              </fieldContext.Provider>
            )}
          </form.Field>
        )
      }) as FieldComponent<
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
        TSubmitMeta,
        TComponents
      >
      return AppField
    }, [form])

    const extendedForm = useMemo(() => {
      return Object.assign(form, {
        AppField,
        AppForm,
        ...formComponents,
      })
    }, [form, AppField, AppForm])

    return extendedForm
  }

  function withForm<
    TFormData,
    TOnMount extends undefined | FormValidateOrFn<TFormData>,
    TOnChange extends undefined | FormValidateOrFn<TFormData>,
    TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnBlur extends undefined | FormValidateOrFn<TFormData>,
    TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
    TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
    TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
    TSubmitMeta,
    TRenderProps extends object = {},
  >({
    render,
    props,
  }: WithFormProps<
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
    TSubmitMeta,
    TComponents,
    TFormComponents,
    TRenderProps
  >): WithFormProps<
    UnwrapOrAny<TFormData>,
    UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnMount>,
    UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnChange>,
    UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnChangeAsync>,
    UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnBlur>,
    UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnBlurAsync>,
    UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnSubmit>,
    UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnSubmitAsync>,
    UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnDynamic>,
    UnwrapDefaultOrAny<
      undefined | FormValidateOrFn<TFormData>,
      TOnDynamicAsync
    >,
    UnwrapDefaultOrAny<undefined | FormValidateOrFn<TFormData>, TOnServer>,
    UnwrapOrAny<TSubmitMeta>,
    UnwrapOrAny<TComponents>,
    UnwrapOrAny<TFormComponents>,
    UnwrapOrAny<TRenderProps>
  >['render'] {
    return (innerProps) => render({ ...props, ...innerProps })
  }

  function withFieldGroup<
    TFieldGroupData,
    TSubmitMeta,
    TRenderProps extends object = {},
  >({
    render,
    props,
    defaultValues,
  }: WithFieldGroupProps<
    TFieldGroupData,
    TComponents,
    TFormComponents,
    TSubmitMeta,
    TRenderProps
  >): <
    TFormData,
    TFields extends
      | DeepKeysOfType<TFormData, TFieldGroupData | null | undefined>
      | FieldsMap<TFormData, TFieldGroupData>,
    TOnMount extends undefined | FormValidateOrFn<TFormData>,
    TOnChange extends undefined | FormValidateOrFn<TFormData>,
    TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnBlur extends undefined | FormValidateOrFn<TFormData>,
    TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
    TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
    TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
    TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
    TFormSubmitMeta,
  >(
    params: PropsWithChildren<
      NoInfer<TRenderProps> & {
        form:
          | AppFieldExtendedReactFormApi<
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
              unknown extends TSubmitMeta ? TFormSubmitMeta : TSubmitMeta,
              TComponents,
              TFormComponents
            >
          | AppFieldExtendedReactFieldGroupApi<
              // Since this only occurs if you nest it within other field groups, it can be more
              // lenient with the types.
              unknown,
              TFormData,
              string | FieldsMap<unknown, TFormData>,
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
              unknown extends TSubmitMeta ? TFormSubmitMeta : TSubmitMeta,
              TComponents,
              TFormComponents
            >
        fields: TFields
      }
    >,
  ) => ReturnType<FunctionComponent> {
    return function Render(innerProps) {
      const fieldGroupProps = useMemo(() => {
        return {
          form: innerProps.form,
          fields: innerProps.fields,
          defaultValues,
          formComponents,
        }
      }, [innerProps.form, innerProps.fields])
      const fieldGroupApi = useFieldGroup(fieldGroupProps as any)

      return render({ ...props, ...innerProps, group: fieldGroupApi as any })
    }
  }

  return {
    useAppForm,
    withForm,
    withFieldGroup,
  }
}
