import { FocusEvent, useCallback, useState } from 'react';
import {
  ADDITIONAL_PROPERTY_FLAG,
  ANY_OF_KEY,
  getTemplate,
  getUiOptions,
  isFormDataAvailable,
  orderProperties,
  shouldRenderOptionalField,
  toFieldPathId,
  useDeepCompareMemo,
  ErrorSchema,
  FieldPathId,
  FieldPathList,
  FieldProps,
  FormContextType,
  GenericObjectType,
  ONE_OF_KEY,
  PROPERTIES_KEY,
  REF_KEY,
  Registry,
  RJSFSchema,
  StrictRJSFSchema,
  TranslatableString,
} from '@rjsf/utils';
import Markdown from 'markdown-to-jsx';
import get from 'lodash/get';
import has from 'lodash/has';
import isObject from 'lodash/isObject';
import set from 'lodash/set';

import { ADDITIONAL_PROPERTY_KEY_REMOVE } from '../constants';

/** Returns a flag indicating whether the `name` field is required in the object schema
 *
 * @param schema - The schema to check
 * @param name - The name of the field to check for required-ness
 * @returns - True if the field `name` is required, false otherwise
 */
function isRequired<S extends StrictRJSFSchema = RJSFSchema>(schema: S, name: string) {
  return Array.isArray(schema.required) && schema.required.indexOf(name) !== -1;
}

/** Returns a default value to be used for a new additional schema property of the given `type`
 *
 * @param translateString - The string translation function from the registry
 * @param type - The type of the new additional schema property
 */
function getDefaultValue<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  translateString: Registry<T, S, F>['translateString'],
  type?: RJSFSchema['type'],
) {
  switch (type) {
    case 'array':
      return [];
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'number':
      return 0;
    case 'object':
      return {};
    case 'string':
    default:
      // We don't have a datatype for some reason (perhaps additionalProperties was true)
      return translateString(TranslatableString.NewStringDefault);
  }
}

/** Props for the `ObjectFieldProperty` component */
interface ObjectFieldPropertyProps<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>
  extends Omit<FieldProps<T, S, F>, 'name'> {
  /** The name of the property within the parent object */
  propertyName: string;
  /** Flag indicating whether this property was added by the additionalProperties UI */
  addedByAdditionalProperties: boolean;
  /** Callback that handles the rename of an additionalProperties-based property key */
  handleKeyRename: (oldKey: string, newKey: string) => void;
  /** Callback that handles the removal of an additionalProperties-based property with key */
  handleRemoveProperty: (keyName: string) => void;
}

/** The `ObjectFieldProperty` component is used to render the `SchemaField` for a child property of an object
 */
function ObjectFieldProperty<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: ObjectFieldPropertyProps<T, S, F>,
) {
  const {
    fieldPathId,
    schema,
    registry,
    uiSchema,
    errorSchema,
    formData,
    onChange,
    onBlur,
    onFocus,
    disabled,
    readonly,
    required,
    hideError,
    propertyName,
    handleKeyRename,
    handleRemoveProperty,
    addedByAdditionalProperties,
  } = props;
  const [wasPropertyKeyModified, setWasPropertyKeyModified] = useState(false);
  const { globalFormOptions, fields } = registry;
  const { SchemaField } = fields;
  const innerFieldIdPathId = useDeepCompareMemo<FieldPathId>(
    toFieldPathId(propertyName, globalFormOptions, fieldPathId.path),
  );

  /** Returns the `onPropertyChange` handler for the `name` field. Handles the special case where a user is attempting
   * to clear the data for a field added as an additional property. Calls the `onChange()` handler with the updated
   * formData.
   *
   * @param name - The name of the property
   * @param addedByAdditionalProperties - Flag indicating whether this property is an additional property
   * @returns - The onPropertyChange callback for the `name` property
   */
  const onPropertyChange = useCallback(
    (value: T | undefined, path: FieldPathList, newErrorSchema?: ErrorSchema<T>, id?: string) => {
      if (value === undefined && addedByAdditionalProperties) {
        // Don't set value = undefined for fields added by additionalProperties. Doing so removes them from the
        // formData, which causes them to completely disappear (including the input field for the property name). Unlike
        // fields which are "mandated" by the schema, these fields can be set to undefined by clicking a "delete field"
        // button, so set empty values to the empty string.
        value = '' as unknown as T;
      }
      onChange(value, path, newErrorSchema, id);
    },
    [onChange, addedByAdditionalProperties],
  );

  /** The key change event handler; Called when the key associated with a field is changed for an additionalProperty.
   * simply returns a function that call the `handleKeyChange()` event with the value
   */
  const onKeyRename = useCallback(
    (value: string) => {
      if (propertyName !== value) {
        setWasPropertyKeyModified(true);
      }
      handleKeyRename(propertyName, value);
    },
    [propertyName, handleKeyRename],
  );

  /** Returns a callback the handle the blur event, getting the value from the target and passing that along to the
   * `handleKeyChange` function
   */
  const onKeyRenameBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      const {
        target: { value },
      } = event;
      onKeyRename(value);
    },
    [onKeyRename],
  );

  /** The property drop/removal event handler; Called when a field is removed in an additionalProperty context
   */
  const onRemoveProperty = useCallback(() => {
    handleRemoveProperty(propertyName);
  }, [propertyName, handleRemoveProperty]);

  return (
    <SchemaField
      name={propertyName}
      required={required}
      schema={schema}
      uiSchema={uiSchema}
      errorSchema={errorSchema}
      fieldPathId={innerFieldIdPathId}
      formData={formData}
      wasPropertyKeyModified={wasPropertyKeyModified}
      onKeyRename={onKeyRename}
      onKeyRenameBlur={onKeyRenameBlur}
      onRemoveProperty={onRemoveProperty}
      onChange={onPropertyChange}
      onBlur={onBlur}
      onFocus={onFocus}
      registry={registry}
      disabled={disabled}
      readonly={readonly}
      hideError={hideError}
    />
  );
}

/** The `ObjectField` component is used to render a field in the schema that is of type `object`. It tracks whether an
 * additional property key was modified and what it was modified to
 *
 * @param props - The `FieldProps` for this template
 */
export default function ObjectField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: FieldProps<T, S, F>,
) {
  const {
    schema: rawSchema,
    uiSchema = {},
    formData,
    errorSchema,
    fieldPathId,
    name,
    required = false,
    disabled,
    readonly,
    hideError,
    onBlur,
    onFocus,
    onChange,
    registry,
    title,
  } = props;
  const { fields, schemaUtils, translateString, globalUiOptions } = registry;
  const { OptionalDataControlsField } = fields;
  const schema: S = schemaUtils.retrieveSchema(rawSchema, formData, true);
  const uiOptions = getUiOptions<T, S, F>(uiSchema, globalUiOptions);
  const { properties: schemaProperties = {} } = schema;
  // All the children will use childFieldPathId if present in the props, falling back to the fieldPathId
  const childFieldPathId = props.childFieldPathId ?? fieldPathId;

  const templateTitle = uiOptions.title ?? schema.title ?? title ?? name;
  const description = uiOptions.description ?? schema.description;
  const renderOptionalField = shouldRenderOptionalField<T, S, F>(registry, schema, required, uiSchema);
  const hasFormData = isFormDataAvailable<T>(formData);
  let orderedProperties: string[] = [];

  /** Computes the next available key name from the `preferredKey`, indexing through the already existing keys until one
   * that is already not assigned is found.
   *
   * @param preferredKey - The preferred name of a new key
   * @param [formData] - The form data in which to check if the desired key already exists
   * @returns - The name of the next available key from `preferredKey`
   */
  const getAvailableKey = useCallback(
    (preferredKey: string, formData?: T) => {
      const { duplicateKeySuffixSeparator = '-' } = getUiOptions<T, S, F>(uiSchema, globalUiOptions);

      let index = 0;
      let newKey = preferredKey;
      while (has(formData, newKey)) {
        newKey = `${preferredKey}${duplicateKeySuffixSeparator}${++index}`;
      }
      return newKey;
    },
    [uiSchema, globalUiOptions],
  );

  /** Handles the adding of a new additional property on the given `schema`. Calls the `onChange` callback once the new
   * default data for that field has been added to the formData.
   */
  const onAddProperty = useCallback(() => {
    if (!(schema.additionalProperties || schema.patternProperties)) {
      return;
    }
    const { translateString } = registry;
    const newFormData = { ...formData } as T;
    const newKey = getAvailableKey('newKey', newFormData);
    if (schema.patternProperties) {
      // Cast this to make the `set` work properly
      set(newFormData as GenericObjectType, newKey, null);
    } else {
      let type: RJSFSchema['type'] = undefined;
      let constValue: RJSFSchema['const'] = undefined;
      let defaultValue: RJSFSchema['default'] = undefined;
      if (isObject(schema.additionalProperties)) {
        type = schema.additionalProperties.type;
        constValue = schema.additionalProperties.const;
        defaultValue = schema.additionalProperties.default;
        let apSchema = schema.additionalProperties;
        if (REF_KEY in apSchema) {
          const { schemaUtils } = registry;
          apSchema = schemaUtils.retrieveSchema({ [REF_KEY]: apSchema[REF_KEY] } as S, formData);
          type = apSchema.type;
          constValue = apSchema.const;
          defaultValue = apSchema.default;
        }
        if (!type && (ANY_OF_KEY in apSchema || ONE_OF_KEY in apSchema)) {
          type = 'object';
        }
      }

      const newValue = constValue ?? defaultValue ?? getDefaultValue<T, S, F>(translateString, type);
      // Cast this to make the `set` work properly
      set(newFormData as GenericObjectType, newKey, newValue);
    }

    onChange(newFormData, childFieldPathId.path);
  }, [formData, onChange, registry, childFieldPathId, getAvailableKey, schema]);

  /** Returns a callback function that deals with the rename of a key for an additional property for a schema. That
   * callback will attempt to rename the key and move the existing data to that key, calling `onChange` when it does.
   *
   * @param oldKey - The old key for the field
   * @param newKey - The new key for the field
   * @returns - The key change callback function
   */
  const handleKeyRename = useCallback(
    (oldKey: string, newKey: string) => {
      if (oldKey !== newKey) {
        const actualNewKey = getAvailableKey(newKey, formData);
        const newFormData: GenericObjectType = {
          ...(formData as GenericObjectType),
        };
        const newKeys: GenericObjectType = { [oldKey]: actualNewKey };
        const keyValues = Object.keys(newFormData).map((key) => {
          const newKey = newKeys[key] || key;
          return { [newKey]: newFormData[key] };
        });
        const renamedObj = Object.assign({}, ...keyValues);

        onChange(renamedObj, childFieldPathId.path);
      }
    },
    [formData, onChange, childFieldPathId, getAvailableKey],
  );

  /** Handles the remove click which calls the `onChange` callback with the special ADDITIONAL_PROPERTY_FIELD_REMOVE
   * value for the path plus the key to be removed
   */
  const handleRemoveProperty = useCallback(
    (key: string) => {
      onChange(ADDITIONAL_PROPERTY_KEY_REMOVE as T, [...childFieldPathId.path, key]);
    },
    [onChange, childFieldPathId],
  );

  if (!renderOptionalField || hasFormData) {
    try {
      const properties = Object.keys(schemaProperties);
      orderedProperties = orderProperties(properties, uiOptions.order);
    } catch (err) {
      return (
        <div>
          <p className='rjsf-config-error' style={{ color: 'red' }}>
            <Markdown options={{ disableParsingRawHTML: true }}>
              {translateString(TranslatableString.InvalidObjectField, [name || 'root', (err as Error).message])}
            </Markdown>
          </p>
          <pre>{JSON.stringify(schema)}</pre>
        </div>
      );
    }
  }

  const Template = getTemplate<'ObjectFieldTemplate', T, S, F>('ObjectFieldTemplate', registry, uiOptions);
  const optionalDataControl = renderOptionalField ? (
    <OptionalDataControlsField {...props} fieldPathId={childFieldPathId} schema={schema} />
  ) : undefined;

  const templateProps = {
    // getDisplayLabel() always returns false for object types, so just check the `uiOptions.label`
    title: uiOptions.label === false ? '' : templateTitle,
    description: uiOptions.label === false ? undefined : description,
    properties: orderedProperties.map((name) => {
      const addedByAdditionalProperties = has(schema, [PROPERTIES_KEY, name, ADDITIONAL_PROPERTY_FLAG]);
      const fieldUiSchema = addedByAdditionalProperties ? uiSchema.additionalProperties : uiSchema[name];
      const hidden = getUiOptions<T, S, F>(fieldUiSchema).widget === 'hidden';
      const content = (
        <ObjectFieldProperty<T, S, F>
          key={name}
          propertyName={name}
          required={isRequired<S>(schema, name)}
          schema={get(schema, [PROPERTIES_KEY, name], {}) as S}
          uiSchema={fieldUiSchema}
          errorSchema={get(errorSchema, [name])}
          fieldPathId={childFieldPathId}
          formData={get(formData, [name])}
          handleKeyRename={handleKeyRename}
          handleRemoveProperty={handleRemoveProperty}
          addedByAdditionalProperties={addedByAdditionalProperties}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          registry={registry}
          disabled={disabled}
          readonly={readonly}
          hideError={hideError}
        />
      );
      return {
        content,
        name,
        readonly,
        disabled,
        required,
        hidden,
      };
    }),
    readonly,
    disabled,
    required,
    fieldPathId,
    uiSchema,
    errorSchema,
    schema,
    formData,
    registry,
    optionalDataControl,
    className: renderOptionalField ? 'rjsf-optional-object-field' : undefined,
  };
  return <Template {...templateProps} onAddProperty={onAddProperty} />;
}
