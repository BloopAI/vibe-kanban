import { RegistryFieldsType, RegistryWidgetsType } from '@rjsf/utils';
import {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TextareaWidget,
} from './widgets';
import {
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldItemTemplate,
  FormTemplate,
} from './templates';
import { KeyValueField } from './fields';

export const settingsWidgets: RegistryWidgetsType = {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TextareaWidget,
  textarea: TextareaWidget,
};

export const settingsTemplates = {
  ArrayFieldTemplate,
  ArrayFieldItemTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
  FormTemplate,
};

export const settingsFields: RegistryFieldsType = {
  KeyValueField,
};

export const settingsRjsfTheme = {
  widgets: settingsWidgets,
  templates: settingsTemplates,
  fields: settingsFields,
};
