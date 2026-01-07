import { ComponentType, ForwardedRef, forwardRef } from 'react';
import Form, { FormProps } from './components/Form';
import { FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';

/** The properties for the `withTheme` function, essentially a subset of properties from the `FormProps` that can be
 * overridden while creating a theme
 */
export type ThemeProps<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any> = Pick<
  FormProps<T, S, F>,
  'fields' | 'templates' | 'widgets' | '_internalFormWrapper'
>;

/** A Higher-Order component that creates a wrapper around a `Form` with the overrides from the `WithThemeProps` */
export default function withTheme<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  themeProps: ThemeProps<T, S, F>,
): ComponentType<FormProps<T, S, F>> {
  // @ts-expect-error TS2322 because the latest types complain about LegacyRef's string form not working with Form
  return forwardRef<Form<T, S, F>, FormProps<T, S, F>>(
    ({ fields, widgets, templates, ...directProps }: FormProps<T, S, F>, ref: ForwardedRef<Form<T, S, F>>) => {
      fields = { ...themeProps?.fields, ...fields };
      widgets = { ...themeProps?.widgets, ...widgets };
      templates = {
        ...themeProps?.templates,
        ...templates,
        ButtonTemplates: {
          ...themeProps?.templates?.ButtonTemplates,
          ...templates?.ButtonTemplates,
        },
      };

      return (
        <Form<T, S, F>
          {...themeProps}
          {...directProps}
          fields={fields}
          widgets={widgets}
          templates={templates}
          ref={ref}
        />
      );
    },
  );
}
