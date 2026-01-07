import { FormContextType, Registry, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';
/** The default registry consists of all the fields, templates and widgets provided in the core implementation,
 * plus an empty `rootSchema` and `formContext. We omit schemaUtils here because it cannot be defaulted without a
 * rootSchema and validator. It will be added into the computed registry later in the Form.
 */
export default function getDefaultRegistry<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(): Omit<Registry<T, S, F>, 'schemaUtils'>;
//# sourceMappingURL=getDefaultRegistry.d.ts.map