import {
  DEFAULT_ID_PREFIX,
  DEFAULT_ID_SEPARATOR,
  createSchemaUtils,
  englishStringTranslator,
  Registry,
} from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

import getDefaultRegistry from './getDefaultRegistry';

/** Use for react testing library tests where we directly test the component rather than testing inside a Form
 */
export default function getTestRegistry(
  rootSchema: Registry['rootSchema'],
  fields: Registry['fields'] = {},
  templates: Partial<Registry['templates']> = {},
  widgets: Registry['widgets'] = {},
  formContext: Registry['formContext'] = {},
  globalFormOptions: Registry['globalFormOptions'] = {
    idPrefix: DEFAULT_ID_PREFIX,
    idSeparator: DEFAULT_ID_SEPARATOR,
    useFallbackUiForUnsupportedType: false,
  },
): Registry {
  const defaults = getDefaultRegistry();
  const schemaUtils = createSchemaUtils(validator, rootSchema);
  return {
    fields: { ...defaults.fields, ...fields },
    templates: { ...defaults.templates, ...templates },
    widgets: { ...defaults.widgets, ...widgets },
    formContext,
    rootSchema,
    schemaUtils,
    translateString: englishStringTranslator,
    globalFormOptions,
  };
}
