import { ReactElement } from 'react';
import {
  FormContextType,
  Registry,
  RJSFSchema,
  StrictRJSFSchema,
  UiSchema,
  getTestIds,
  getUiOptions,
} from '@rjsf/utils';
import Markdown from 'markdown-to-jsx';

const TEST_IDS = getTestIds();

export interface RichHelpProps<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any> {
  /** The description text for a field, potentially containing markdown */
  help: string | ReactElement;
  /** The uiSchema object for this base component */
  uiSchema?: UiSchema<T, S, F>;
  /** The `registry` object */
  registry: Registry<T, S, F>;
}

/** Renders the given `description` in the props as
 *
 * @param props - The `RichHelpProps` for this component
 */
export default function RichHelp<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({
  help,
  registry,
  uiSchema = {},
}: RichHelpProps<T, S, F>) {
  const { globalUiOptions } = registry;
  const uiOptions = getUiOptions<T, S, F>(uiSchema, globalUiOptions);

  if (uiOptions.enableMarkdownInHelp && typeof help === 'string') {
    return (
      <Markdown options={{ disableParsingRawHTML: true }} data-testid={TEST_IDS.markdown}>
        {help}
      </Markdown>
    );
  }
  return help;
}

RichHelp.TEST_IDS = TEST_IDS;
