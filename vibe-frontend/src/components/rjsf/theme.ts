import { RegistryFieldsType, RegistryWidgetsType } from '@rjsf/utils';
import {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TextareaWidget,
} from './widgets';
import {
  ArrayFieldTemplate,
  ArrayFieldItemTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
  FormTemplate,
} from './templates';
import { KeyValueField } from './fields';

export const customWidgets: RegistryWidgetsType = {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TextareaWidget,
  textarea: TextareaWidget,
};

export const customTemplates = {
  ArrayFieldTemplate,
  ArrayFieldItemTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
  FormTemplate,
};

export const customFields: RegistryFieldsType = {
  KeyValueField,
};

export const shadcnTheme = {
  widgets: customWidgets,
  templates: customTemplates,
  fields: customFields,
};
