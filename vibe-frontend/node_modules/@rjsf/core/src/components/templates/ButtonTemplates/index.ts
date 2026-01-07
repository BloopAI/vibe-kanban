import { FormContextType, RJSFSchema, StrictRJSFSchema, TemplatesType } from '@rjsf/utils';

import SubmitButton from './SubmitButton';
import AddButton from './AddButton';
import { CopyButton, MoveDownButton, MoveUpButton, RemoveButton } from './IconButton';

function buttonTemplates<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(): TemplatesType<T, S, F>['ButtonTemplates'] {
  return {
    SubmitButton,
    AddButton,
    CopyButton,
    MoveDownButton,
    MoveUpButton,
    RemoveButton,
  };
}

export default buttonTemplates;
