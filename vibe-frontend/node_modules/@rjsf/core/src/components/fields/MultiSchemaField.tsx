import { Component } from 'react';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import omit from 'lodash/omit';
import {
  ANY_OF_KEY,
  deepEquals,
  ERRORS_KEY,
  FieldProps,
  FormContextType,
  getDiscriminatorFieldFromSchema,
  getTemplate,
  getUiOptions,
  getWidget,
  isFormDataAvailable,
  mergeSchemas,
  ONE_OF_KEY,
  RJSFSchema,
  shouldRenderOptionalField,
  StrictRJSFSchema,
  TranslatableString,
  UiSchema,
} from '@rjsf/utils';

/** Type used for the state of the `AnyOfField` component */
type AnyOfFieldState<S extends StrictRJSFSchema = RJSFSchema> = {
  /** The currently selected option */
  selectedOption: number;
  /** The option schemas after retrieving all $refs */
  retrievedOptions: S[];
};

/** The `AnyOfField` component is used to render a field in the schema that is an `anyOf`, `allOf` or `oneOf`. It tracks
 * the currently selected option and cleans up any irrelevant data in `formData`.
 *
 * @param props - The `FieldProps` for this template
 */
class AnyOfField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any> extends Component<
  FieldProps<T, S, F>,
  AnyOfFieldState<S>
> {
  /** Constructs an `AnyOfField` with the given `props` to initialize the initially selected option in state
   *
   * @param props - The `FieldProps` for this template
   */
  constructor(props: FieldProps<T, S, F>) {
    super(props);

    const {
      formData,
      options,
      registry: { schemaUtils },
    } = this.props;
    // cache the retrieved options in state in case they have $refs to save doing it later
    const retrievedOptions = options.map((opt: S) => schemaUtils.retrieveSchema(opt, formData));

    this.state = {
      retrievedOptions,
      selectedOption: this.getMatchingOption(0, formData, retrievedOptions),
    };
  }

  /** React lifecycle method that is called when the props and/or state for this component is updated. It recomputes the
   * currently selected option based on the overall `formData`
   *
   * @param prevProps - The previous `FieldProps` for this template
   * @param prevState - The previous `AnyOfFieldState` for this template
   */
  componentDidUpdate(prevProps: Readonly<FieldProps<T, S, F>>, prevState: Readonly<AnyOfFieldState>) {
    const { formData, options, fieldPathId } = this.props;
    const { selectedOption } = this.state;
    let newState = this.state;
    if (!deepEquals(prevProps.options, options)) {
      const {
        registry: { schemaUtils },
      } = this.props;
      // re-cache the retrieved options in state in case they have $refs to save doing it later
      const retrievedOptions = options.map((opt: S) => schemaUtils.retrieveSchema(opt, formData));
      newState = { selectedOption, retrievedOptions };
    }
    if (!deepEquals(formData, prevProps.formData) && fieldPathId.$id === prevProps.fieldPathId.$id) {
      const { retrievedOptions } = newState;
      const matchingOption = this.getMatchingOption(selectedOption, formData, retrievedOptions);

      if (prevState && matchingOption !== selectedOption) {
        newState = { selectedOption: matchingOption, retrievedOptions };
      }
    }
    if (newState !== this.state) {
      this.setState(newState);
    }
  }

  /** Determines the best matching option for the given `formData` and `options`.
   *
   * @param formData - The new formData
   * @param options - The list of options to choose from
   * @return - The index of the `option` that best matches the `formData`
   */
  getMatchingOption(selectedOption: number, formData: T | undefined, options: S[]) {
    const {
      schema,
      registry: { schemaUtils },
    } = this.props;

    const discriminator = getDiscriminatorFieldFromSchema<S>(schema);
    const option = schemaUtils.getClosestMatchingOption(formData, options, selectedOption, discriminator);
    return option;
  }

  /** Callback handler to remember what the currently selected option is. In addition to that the `formData` is updated
   * to remove properties that are not part of the newly selected option schema, and then the updated data is passed to
   * the `onChange` handler.
   *
   * @param option - The new option value being selected
   */
  onOptionChange = (option?: string) => {
    const { selectedOption, retrievedOptions } = this.state;
    const { formData, onChange, registry, fieldPathId } = this.props;
    const { schemaUtils } = registry;
    const intOption = option !== undefined ? parseInt(option, 10) : -1;
    if (intOption === selectedOption) {
      return;
    }
    const newOption = intOption >= 0 ? retrievedOptions[intOption] : undefined;
    const oldOption = selectedOption >= 0 ? retrievedOptions[selectedOption] : undefined;

    let newFormData = schemaUtils.sanitizeDataForNewSchema(newOption, oldOption, formData);
    if (newOption) {
      // Call getDefaultFormState to make sure defaults are populated on change. Pass "excludeObjectChildren"
      // so that only the root objects themselves are created without adding undefined children properties
      newFormData = schemaUtils.getDefaultFormState(newOption, newFormData, 'excludeObjectChildren') as T;
    }

    this.setState({ selectedOption: intOption }, () => {
      onChange(newFormData, fieldPathId.path, undefined, this.getFieldId());
    });
  };

  getFieldId() {
    const { fieldPathId, schema } = this.props;
    return `${fieldPathId.$id}${schema.oneOf ? '__oneof_select' : '__anyof_select'}`;
  }

  /** Renders the `AnyOfField` selector along with a `SchemaField` for the value of the `formData`
   */
  render() {
    const {
      name,
      disabled = false,
      errorSchema = {},
      formData,
      onBlur,
      onFocus,
      readonly,
      required = false,
      registry,
      schema,
      uiSchema,
    } = this.props;

    const { widgets, fields, translateString, globalUiOptions, schemaUtils } = registry;
    const { SchemaField: _SchemaField } = fields;
    const MultiSchemaFieldTemplate = getTemplate<'MultiSchemaFieldTemplate', T, S, F>(
      'MultiSchemaFieldTemplate',
      registry,
      globalUiOptions,
    );
    const isOptionalRender = shouldRenderOptionalField<T, S, F>(registry, schema, required, uiSchema);
    const hasFormData = isFormDataAvailable<T>(formData);

    const { selectedOption, retrievedOptions } = this.state;
    const {
      widget = 'select',
      placeholder,
      autofocus,
      autocomplete,
      title = schema.title,
      ...uiOptions
    } = getUiOptions<T, S, F>(uiSchema, globalUiOptions);
    const Widget = getWidget<T, S, F>({ type: 'number' }, widget, widgets);
    const rawErrors = get(errorSchema, ERRORS_KEY, []);
    const fieldErrorSchema = omit(errorSchema, [ERRORS_KEY]);
    const displayLabel = schemaUtils.getDisplayLabel(schema, uiSchema, globalUiOptions);

    const option = selectedOption >= 0 ? retrievedOptions[selectedOption] || null : null;
    let optionSchema: S | undefined | null;

    if (option) {
      // merge top level required field
      const { required } = schema;
      // Merge in all the non-oneOf/anyOf properties and also skip the special ADDITIONAL_PROPERTY_FLAG property
      optionSchema = required ? (mergeSchemas({ required }, option) as S) : option;
    }

    // First we will check to see if there is an anyOf/oneOf override for the UI schema
    let optionsUiSchema: UiSchema<T, S, F>[] = [];
    if (ONE_OF_KEY in schema && uiSchema && ONE_OF_KEY in uiSchema) {
      if (Array.isArray(uiSchema[ONE_OF_KEY])) {
        optionsUiSchema = uiSchema[ONE_OF_KEY];
      } else {
        console.warn(`uiSchema.oneOf is not an array for "${title || name}"`);
      }
    } else if (ANY_OF_KEY in schema && uiSchema && ANY_OF_KEY in uiSchema) {
      if (Array.isArray(uiSchema[ANY_OF_KEY])) {
        optionsUiSchema = uiSchema[ANY_OF_KEY];
      } else {
        console.warn(`uiSchema.anyOf is not an array for "${title || name}"`);
      }
    }
    // Then we pick the one that matches the selected option index, if one exists otherwise default to the main uiSchema
    let optionUiSchema = uiSchema;
    if (selectedOption >= 0 && optionsUiSchema.length > selectedOption) {
      optionUiSchema = optionsUiSchema[selectedOption];
    }

    const translateEnum: TranslatableString = title
      ? TranslatableString.TitleOptionPrefix
      : TranslatableString.OptionPrefix;
    const translateParams = title ? [title] : [];
    const enumOptions = retrievedOptions.map((opt: { title?: string }, index: number) => {
      // Also see if there is an override title in the uiSchema for each option, otherwise use the title from the option
      const { title: uiTitle = opt.title } = getUiOptions<T, S, F>(optionsUiSchema[index]);
      return {
        label: uiTitle || translateString(translateEnum, translateParams.concat(String(index + 1))),
        value: index,
      };
    });

    const selector =
      !isOptionalRender || hasFormData ? (
        <Widget
          id={this.getFieldId()}
          name={`${name}${schema.oneOf ? '__oneof_select' : '__anyof_select'}`}
          schema={{ type: 'number', default: 0 } as S}
          onChange={this.onOptionChange}
          onBlur={onBlur}
          onFocus={onFocus}
          disabled={disabled || isEmpty(enumOptions)}
          multiple={false}
          rawErrors={rawErrors}
          errorSchema={fieldErrorSchema}
          value={selectedOption >= 0 ? selectedOption : undefined}
          options={{ enumOptions, ...uiOptions }}
          registry={registry}
          placeholder={placeholder}
          autocomplete={autocomplete}
          autofocus={autofocus}
          label={title ?? name}
          hideLabel={!displayLabel}
          readonly={readonly}
        />
      ) : undefined;

    const optionsSchemaField =
      (optionSchema && optionSchema.type !== 'null' && (
        <_SchemaField {...this.props} schema={optionSchema} uiSchema={optionUiSchema} />
      )) ||
      null;

    return (
      <MultiSchemaFieldTemplate
        schema={schema}
        registry={registry}
        uiSchema={uiSchema}
        selector={selector}
        optionSchemaField={optionsSchemaField}
      />
    );
  }
}

export default AnyOfField;
