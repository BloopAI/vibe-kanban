import { RegistryWidgetsType } from '@rjsf/utils';
import {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TextareaWidget,
} from './widgets';
import {
  ArrayFieldTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
  FormTemplate,
} from './templates';

export const customWidgets: RegistryWidgetsType = {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TextareaWidget,
  textarea: TextareaWidget,
};

export const customTemplates = {
  ArrayFieldTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
  FormTemplate,
};

export const shadcnTheme = {
  widgets: customWidgets,
  templates: customTemplates,
};
