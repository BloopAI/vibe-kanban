import {
  DEFAULT_ID_PREFIX,
  DEFAULT_ID_SEPARATOR,
  englishStringTranslator,
  FormContextType,
  Registry,
  RJSFSchema,
  StrictRJSFSchema,
} from '@rjsf/utils';

import fields from './components/fields';
import templates from './components/templates';
import widgets from './components/widgets';

/** The default registry consists of all the fields, templates and widgets provided in the core implementation,
 * plus an empty `rootSchema` and `formContext. We omit schemaUtils here because it cannot be defaulted without a
 * rootSchema and validator. It will be added into the computed registry later in the Form.
 */
export default function getDefaultRegistry<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(): Omit<Registry<T, S, F>, 'schemaUtils'> {
  return {
    fields: fields<T, S, F>(),
    templates: templates<T, S, F>(),
    widgets: widgets<T, S, F>(),
    rootSchema: {} as S,
    formContext: {} as F,
    translateString: englishStringTranslator,
    globalFormOptions: {
      idPrefix: DEFAULT_ID_PREFIX,
      idSeparator: DEFAULT_ID_SEPARATOR,
      useFallbackUiForUnsupportedType: false,
    },
  };
}
