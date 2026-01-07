import { ComponentType } from 'react';
import { FormProps } from './components/Form.js';
import { FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';
/** The properties for the `withTheme` function, essentially a subset of properties from the `FormProps` that can be
 * overridden while creating a theme
 */
export type ThemeProps<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any> = Pick<FormProps<T, S, F>, 'fields' | 'templates' | 'widgets' | '_internalFormWrapper'>;
/** A Higher-Order component that creates a wrapper around a `Form` with the overrides from the `WithThemeProps` */
export default function withTheme<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(themeProps: ThemeProps<T, S, F>): ComponentType<FormProps<T, S, F>>;
//# sourceMappingURL=withTheme.d.ts.map