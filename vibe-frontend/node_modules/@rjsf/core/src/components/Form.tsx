import { Component, ElementType, FormEvent, ReactNode, Ref, RefObject, createRef } from 'react';
import {
  createSchemaUtils,
  CustomValidator,
  deepEquals,
  ErrorSchema,
  ErrorSchemaBuilder,
  ErrorTransformer,
  FieldPathId,
  FieldPathList,
  FormContextType,
  GenericObjectType,
  getChangedFields,
  getTemplate,
  getUiOptions,
  isObject,
  mergeObjects,
  NAME_KEY,
  PathSchema,
  StrictRJSFSchema,
  Registry,
  RegistryFieldsType,
  RegistryWidgetsType,
  RJSFSchema,
  RJSFValidationError,
  RJSF_ADDITIONAL_PROPERTIES_FLAG,
  SchemaUtilsType,
  shouldRender,
  SUBMIT_BTN_OPTIONS_KEY,
  TemplatesType,
  toErrorList,
  toFieldPathId,
  UiSchema,
  UI_GLOBAL_OPTIONS_KEY,
  UI_OPTIONS_KEY,
  ValidationData,
  validationDataMerge,
  ValidatorType,
  Experimental_DefaultFormStateBehavior,
  Experimental_CustomMergeAllOf,
  DEFAULT_ID_SEPARATOR,
  DEFAULT_ID_PREFIX,
  GlobalFormOptions,
  ERRORS_KEY,
  ID_KEY,
  NameGeneratorFunction,
} from '@rjsf/utils';
import _cloneDeep from 'lodash/cloneDeep';
import _get from 'lodash/get';
import _isEmpty from 'lodash/isEmpty';
import _pick from 'lodash/pick';
import _set from 'lodash/set';
import _toPath from 'lodash/toPath';
import _unset from 'lodash/unset';

import getDefaultRegistry from '../getDefaultRegistry';
import { ADDITIONAL_PROPERTY_KEY_REMOVE, IS_RESET } from './constants';

/** The properties that are passed to the `Form` */
export interface FormProps<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any> {
  /** The JSON schema object for the form */
  schema: S;
  /** An implementation of the `ValidatorType` interface that is needed for form validation to work */
  validator: ValidatorType<T, S, F>;
  /** The optional children for the form, if provided, it will replace the default `SubmitButton` */
  children?: ReactNode;
  /** The uiSchema for the form */
  uiSchema?: UiSchema<T, S, F>;
  /** The data for the form, used to load a "controlled" form with its current data. If you want an "uncontrolled" form
   * with initial data, then use `initialFormData` instead.
   */
  formData?: T;
  /** The initial data for the form, used to fill an "uncontrolled" form with existing data on the initial render and
   * when `reset()` is called programmatically.
   */
  initialFormData?: T;
  // Form presentation and behavior modifiers
  /** You can provide a `formContext` object to the form, which is passed down to all fields and widgets. Useful for
   * implementing context aware fields and widgets.
   *
   * NOTE: Setting `{readonlyAsDisabled: false}` on the formContext will make the antd theme treat readOnly fields as
   * disabled.
   */
  formContext?: F;
  /** To avoid collisions with existing ids in the DOM, it is possible to change the prefix used for ids;
   * Default is `root`
   */
  idPrefix?: string;
  /** To avoid using a path separator that is present in field names, it is possible to change the separator used for
   * ids (Default is `_`)
   */
  idSeparator?: string;
  /** It's possible to disable the whole form by setting the `disabled` prop. The `disabled` prop is then forwarded down
   * to each field of the form. If you just want to disable some fields, see the `ui:disabled` parameter in `uiSchema`
   */
  disabled?: boolean;
  /** It's possible to make the whole form read-only by setting the `readonly` prop. The `readonly` prop is then
   * forwarded down to each field of the form. If you just want to make some fields read-only, see the `ui:readonly`
   * parameter in `uiSchema`
   */
  readonly?: boolean;
  // Form registry
  /** The dictionary of registered fields in the form */
  fields?: RegistryFieldsType<T, S, F>;
  /** The dictionary of registered templates in the form; Partial allows a subset to be provided beyond the defaults */
  templates?: Partial<Omit<TemplatesType<T, S, F>, 'ButtonTemplates'>> & {
    ButtonTemplates?: Partial<TemplatesType<T, S, F>['ButtonTemplates']>;
  };
  /** The dictionary of registered widgets in the form */
  widgets?: RegistryWidgetsType<T, S, F>;
  // Callbacks
  /** If you plan on being notified every time the form data are updated, you can pass an `onChange` handler, which will
   * receive the same args as `onSubmit` any time a value is updated in the form. Can also return the `id` of the field
   * that caused the change
   */
  onChange?: (data: IChangeEvent<T, S, F>, id?: string) => void;
  /** To react when submitted form data are invalid, pass an `onError` handler. It will be passed the list of
   * encountered errors
   */
  onError?: (errors: RJSFValidationError[]) => void;
  /** You can pass a function as the `onSubmit` prop of your `Form` component to listen to when the form is submitted
   * and its data are valid. It will be passed a result object having a `formData` attribute, which is the valid form
   * data you're usually after. The original event will also be passed as a second parameter
   */
  onSubmit?: (data: IChangeEvent<T, S, F>, event: FormEvent<any>) => void;
  /** Sometimes you may want to trigger events or modify external state when a field has been touched, so you can pass
   * an `onBlur` handler, which will receive the id of the input that was blurred and the field value
   */
  onBlur?: (id: string, data: any) => void;
  /** Sometimes you may want to trigger events or modify external state when a field has been focused, so you can pass
   * an `onFocus` handler, which will receive the id of the input that is focused and the field value
   */
  onFocus?: (id: string, data: any) => void;
  /** The value of this prop will be passed to the `accept-charset` HTML attribute on the form */
  acceptCharset?: string;
  /** The value of this prop will be passed to the `action` HTML attribute on the form
   *
   * NOTE: this just renders the `action` attribute in the HTML markup. There is no real network request being sent to
   * this `action` on submit. Instead, react-jsonschema-form catches the submit event with `event.preventDefault()`
   * and then calls the `onSubmit` function, where you could send a request programmatically with `fetch` or similar.
   */
  action?: string;
  /** The value of this prop will be passed to the `autocomplete` HTML attribute on the form */
  autoComplete?: string;
  /** The value of this prop will be passed to the `class` HTML attribute on the form */
  className?: string;
  /** The value of this prop will be passed to the `enctype` HTML attribute on the form */
  enctype?: string;
  /** The value of this prop will be passed to the `id` HTML attribute on the form */
  id?: string;
  /** The value of this prop will be passed to the `name` HTML attribute on the form */
  name?: string;
  /** The value of this prop will be passed to the `method` HTML attribute on the form */
  method?: string;
  /** It's possible to change the default `form` tag name to a different HTML tag, which can be helpful if you are
   * nesting forms. However, native browser form behaviour, such as submitting when the `Enter` key is pressed, may no
   * longer work
   */
  tagName?: ElementType;
  /** The value of this prop will be passed to the `target` HTML attribute on the form */
  target?: string;
  // Errors and validation
  /** Formerly the `validate` prop; Takes a function that specifies custom validation rules for the form */
  customValidate?: CustomValidator<T, S, F>;
  /** This prop allows passing in custom errors that are augmented with the existing JSON Schema errors on the form; it
   * can be used to implement asynchronous validation. By default, these are non-blocking errors, meaning that you can
   * still submit the form when these are the only errors displayed to the user.
   */
  extraErrors?: ErrorSchema<T>;
  /** If set to true, causes the `extraErrors` to become blocking when the form is submitted */
  extraErrorsBlockSubmit?: boolean;
  /** If set to true, turns off HTML5 validation on the form; Set to `false` by default */
  noHtml5Validate?: boolean;
  /** If set to true, turns off all validation. Set to `false` by default
   *
   * @deprecated - In a future release, this switch may be replaced by making `validator` prop optional
   */
  noValidate?: boolean;
  /** Flag that describes when live validation will be performed. Live validation means that the form will perform
   * validation and show any validation errors whenever the form data is updated, rather than just on submit.
   *
   * If no value (or `false`) is provided, then live validation will not happen. If `true` or `onChange` is provided for
   * the flag, then live validation will be performed after processing of all pending changes has completed. If `onBlur`
   * is provided, then live validation will be performed when a field that was updated is blurred (as a performance
   * optimization).
   *
   * @deprecated - In a future major release, the `boolean` options for this flag will be removed
   */
  liveValidate?: boolean | 'onChange' | 'onBlur';
  /** Flag that describes when live omit will be performed. Live omit happens only when `omitExtraData` is also set to
   * to `true` and the form's data is updated by the user.
   *
   * If no value (or `false`) is provided, then live omit will not happen. If `true` or `onChange` is provided for
   * the flag, then live omit will be performed after processing of all pending changes has completed. If `onBlur`
   * is provided, then live omit will be performed when a field that was updated is blurred (as a performance
   * optimization).
   *
   * @deprecated - In a future major release, the `boolean` options for this flag will be removed
   */
  liveOmit?: boolean | 'onChange' | 'onBlur';
  /** If set to true, then extra form data values that are not in any form field will be removed whenever `onSubmit` is
   * called. Set to `false` by default.
   */
  omitExtraData?: boolean;
  /** When this prop is set to `top` or 'bottom', a list of errors (or the custom error list defined in the `ErrorList`) will also
   * show. When set to false, only inline input validation errors will be shown. Set to `top` by default
   */
  showErrorList?: false | 'top' | 'bottom';
  /** A function can be passed to this prop in order to make modifications to the default errors resulting from JSON
   * Schema validation
   */
  transformErrors?: ErrorTransformer<T, S, F>;
  /** If set to true, then the first field with an error will receive the focus when the form is submitted with errors
   */
  focusOnFirstError?: boolean | ((error: RJSFValidationError) => void);
  /** Optional string translation function, if provided, allows users to change the translation of the RJSF internal
   * strings. Some strings contain replaceable parameter values as indicated by `%1`, `%2`, etc. The number after the
   * `%` indicates the order of the parameter. The ordering of parameters is important because some languages may choose
   * to put the second parameter before the first in its translation.
   */
  translateString?: Registry['translateString'];
  /** Optional function to generate custom HTML `name` attributes for form fields.
   */
  nameGenerator?: NameGeneratorFunction;
  /** Optional flag that, when set to true, will cause the `FallbackField` to render a type selector for unsupported
   * fields instead of the default UnsupportedField error UI.
   */
  useFallbackUiForUnsupportedType?: boolean;
  /** Optional configuration object with flags, if provided, allows users to override default form state behavior
   * Currently only affecting minItems on array fields and handling of setting defaults based on the value of
   * `emptyObjectFields`
   */
  experimental_defaultFormStateBehavior?: Experimental_DefaultFormStateBehavior;
  /**
   * Controls the component update strategy used by the Form's `shouldComponentUpdate` lifecycle method.
   *
   * - `'customDeep'`: Uses RJSF's custom deep equality checks via the `deepEquals` utility function,
   *   which treats all functions as equivalent and provides optimized performance for form data comparisons.
   * - `'shallow'`: Uses shallow comparison of props and state (only compares direct properties). This matches React's PureComponent behavior.
   * - `'always'`: Always rerenders when called. This matches React's Component behavior.
   *
   * @default 'customDeep'
   */
  experimental_componentUpdateStrategy?: 'customDeep' | 'shallow' | 'always';
  /** Optional function that allows for custom merging of `allOf` schemas
   */
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>;
  // Private
  /**
   * _internalFormWrapper is currently used by the semantic-ui theme to provide a custom wrapper around `<Form />`
   * that supports the proper rendering of those themes. To use this prop, one must pass a component that takes two
   * props: `children` and `as`. That component, at minimum, should render the `children` inside of a <form /> tag
   * unless `as` is provided, in which case, use the `as` prop in place of `<form />`.
   * i.e.:
   * ```
   * export default function InternalForm({ children, as }) {
   *   const FormTag = as || 'form';
   *   return <FormTag>{children}</FormTag>;
   * }
   * ```
   *
   * Use at your own risk as this prop is private and may change at any time without notice.
   */
  _internalFormWrapper?: ElementType;
  /** Support receiving a React ref to the Form
   */
  ref?: Ref<Form<T, S, F>>;
}

/** The data that is contained within the state for the `Form` */
export interface FormState<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any> {
  /** The JSON schema object for the form */
  schema: S;
  /** The uiSchema for the form */
  uiSchema: UiSchema<T, S, F>;
  /** The `FieldPathId` for the form, computed from the `schema`, the `rootFieldId`, the `idPrefix` and
   * `idSeparator` props.
   */
  fieldPathId: FieldPathId;
  /** The schemaUtils implementation used by the `Form`, created from the `validator` and the `schema` */
  schemaUtils: SchemaUtilsType<T, S, F>;
  /** The current data for the form, computed from the `formData` prop and the changes made by the user */
  formData?: T;
  /** Flag indicating whether the form is in edit mode, true when `formData` is passed to the form, otherwise false */
  edit: boolean;
  /** The current list of errors for the form, includes `extraErrors` */
  errors: RJSFValidationError[];
  /** The current errors, in `ErrorSchema` format, for the form, includes `extraErrors` */
  errorSchema: ErrorSchema<T>;
  // Private
  /** The current list of errors for the form directly from schema validation, does NOT include `extraErrors` */
  schemaValidationErrors: RJSFValidationError[];
  /** The current errors, in `ErrorSchema` format, for the form directly from schema validation, does NOT include
   * `extraErrors`
   */
  schemaValidationErrorSchema: ErrorSchema<T>;
  /** A container used to handle custom errors provided via `onChange` */
  customErrors?: ErrorSchemaBuilder<T>;
  /** @description result of schemaUtils.retrieveSchema(schema, formData). This a memoized value to avoid re calculate at internal functions (getStateFromProps, onChange) */
  retrievedSchema: S;
  /** Flag indicating whether the initial form defaults have been generated */
  initialDefaultsGenerated: boolean;
  /** The registry (re)computed only when props changed */
  registry: Registry<T, S, F>;
}

/** The event data passed when changes have been made to the form, includes everything from the `FormState` except
 * the schema validation errors. An additional `status` is added when returned from `onSubmit`
 */
export interface IChangeEvent<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>
  extends Pick<
    FormState<T, S, F>,
    'schema' | 'uiSchema' | 'fieldPathId' | 'schemaUtils' | 'formData' | 'edit' | 'errors' | 'errorSchema'
  > {
  /** The status of the form when submitted */
  status?: 'submitted';
}

/** Converts the full `FormState` into the `IChangeEvent` version by picking out the public values
 *
 * @param state - The state of the form
 * @param status - The status provided by the onSubmit
 * @returns - The `IChangeEvent` for the state
 */
function toIChangeEvent<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  state: FormState<T, S, F>,
  status?: IChangeEvent['status'],
): IChangeEvent<T, S, F> {
  return {
    ..._pick(state, ['schema', 'uiSchema', 'fieldPathId', 'schemaUtils', 'formData', 'edit', 'errors', 'errorSchema']),
    ...(status !== undefined && { status }),
  };
}

/** The definition of a pending change that will be processed in the `onChange` handler
 */
interface PendingChange<T> {
  /** The path into the formData/errorSchema at which the `newValue`/`newErrorSchema` will be set */
  path: FieldPathList;
  /** The new value to set into the formData */
  newValue?: T;
  /** The new errors to be set into the errorSchema, if any */
  newErrorSchema?: ErrorSchema<T>;
  /** The optional id of the field for which the change is being made */
  id?: string;
}

/** The `Form` component renders the outer form and all the fields defined in the `schema` */
export default class Form<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
> extends Component<FormProps<T, S, F>, FormState<T, S, F>> {
  /** The ref used to hold the `form` element, this needs to be `any` because `tagName` or `_internalFormWrapper` can
   * provide any possible type here
   */
  formElement: RefObject<any>;

  /** The list of pending changes
   */
  pendingChanges: PendingChange<T>[] = [];

  /** Constructs the `Form` from the `props`. Will setup the initial state from the props. It will also call the
   * `onChange` handler if the initially provided `formData` is modified to add missing default values as part of the
   * state construction.
   *
   * @param props - The initial props for the `Form`
   */
  constructor(props: FormProps<T, S, F>) {
    super(props);

    if (!props.validator) {
      throw new Error('A validator is required for Form functionality to work');
    }

    const { formData: propsFormData, initialFormData, onChange } = props;
    const formData = propsFormData ?? initialFormData;
    this.state = this.getStateFromProps(props, formData, undefined, undefined, undefined, true);
    if (onChange && !deepEquals(this.state.formData, formData)) {
      onChange(toIChangeEvent(this.state));
    }
    this.formElement = createRef();
  }

  /**
   * `getSnapshotBeforeUpdate` is a React lifecycle method that is invoked right before the most recently rendered
   * output is committed to the DOM. It enables your component to capture current values (e.g., scroll position) before
   * they are potentially changed.
   *
   * In this case, it checks if the props have changed since the last render. If they have, it computes the next state
   * of the component using `getStateFromProps` method and returns it along with a `shouldUpdate` flag set to `true` IF
   * the `nextState` and `prevState` are different, otherwise `false`. This ensures that we have the most up-to-date
   * state ready to be applied in `componentDidUpdate`.
   *
   * If `formData` hasn't changed, it simply returns an object with `shouldUpdate` set to `false`, indicating that a
   * state update is not necessary.
   *
   * @param prevProps - The previous set of props before the update.
   * @param prevState - The previous state before the update.
   * @returns Either an object containing the next state and a flag indicating that an update should occur, or an object
   *        with a flag indicating that an update is not necessary.
   */
  getSnapshotBeforeUpdate(
    prevProps: FormProps<T, S, F>,
    prevState: FormState<T, S, F>,
  ): { nextState: FormState<T, S, F>; shouldUpdate: true } | { shouldUpdate: false } {
    if (!deepEquals(this.props, prevProps)) {
      // Compare the previous props formData against the current props formData
      const formDataChangedFields = getChangedFields(this.props.formData, prevProps.formData);
      // Compare the current props formData against the current state's formData to determine if the new props were the
      // result of the onChange from the existing state formData
      const stateDataChangedFields = getChangedFields(this.props.formData, this.state.formData);
      const isSchemaChanged = !deepEquals(prevProps.schema, this.props.schema);
      // When formData is not an object, getChangedFields returns an empty array.
      // In this case, deepEquals is most needed to check again.
      const isFormDataChanged =
        formDataChangedFields.length > 0 || !deepEquals(prevProps.formData, this.props.formData);
      const isStateDataChanged =
        stateDataChangedFields.length > 0 || !deepEquals(this.state.formData, this.props.formData);
      const nextState = this.getStateFromProps(
        this.props,
        this.props.formData,
        // If the `schema` has changed, we need to update the retrieved schema.
        // Or if the `formData` changes, for example in the case of a schema with dependencies that need to
        //  match one of the subSchemas, the retrieved schema must be updated.
        isSchemaChanged || isFormDataChanged ? undefined : this.state.retrievedSchema,
        isSchemaChanged,
        formDataChangedFields,
        // Skip live validation for this request if no form data has changed from the last state
        !isStateDataChanged,
      );
      const shouldUpdate = !deepEquals(nextState, prevState);
      return { nextState, shouldUpdate };
    }
    return { shouldUpdate: false };
  }

  /**
   * `componentDidUpdate` is a React lifecycle method that is invoked immediately after updating occurs. This method is
   * not called for the initial render.
   *
   * Here, it checks if an update is necessary based on the `shouldUpdate` flag received from `getSnapshotBeforeUpdate`.
   * If an update is required, it applies the next state and, if needed, triggers the `onChange` handler to inform about
   * changes.
   *
   * @param _ - The previous set of props.
   * @param prevState - The previous state of the component before the update.
   * @param snapshot - The value returned from `getSnapshotBeforeUpdate`.
   */
  componentDidUpdate(
    _: FormProps<T, S, F>,
    prevState: FormState<T, S, F>,
    snapshot: { nextState: FormState<T, S, F>; shouldUpdate: true } | { shouldUpdate: false },
  ) {
    if (snapshot.shouldUpdate) {
      const { nextState } = snapshot;
      if (
        !deepEquals(nextState.formData, this.props.formData) &&
        !deepEquals(nextState.formData, prevState.formData) &&
        this.props.onChange
      ) {
        this.props.onChange(toIChangeEvent(nextState));
      }
      this.setState(nextState);
    }
  }

  /** Extracts the updated state from the given `props` and `inputFormData`. As part of this process, the
   * `inputFormData` is first processed to add any missing required defaults. After that, the data is run through the
   * validation process IF required by the `props`.
   *
   * @param props - The props passed to the `Form`
   * @param inputFormData - The new or current data for the `Form`
   * @param retrievedSchema - An expanded schema, if not provided, it will be retrieved from the `schema` and `formData`.
   * @param isSchemaChanged - A flag indicating whether the schema has changed.
   * @param formDataChangedFields - The changed fields of `formData`
   * @param skipLiveValidate - Optional flag, if true, means that we are not running live validation
   * @returns - The new state for the `Form`
   */
  getStateFromProps(
    props: FormProps<T, S, F>,
    inputFormData?: T,
    retrievedSchema?: S,
    isSchemaChanged = false,
    formDataChangedFields: string[] = [],
    skipLiveValidate = false,
  ): FormState<T, S, F> {
    const state: FormState<T, S, F> = this.state || {};
    const schema = 'schema' in props ? props.schema : this.props.schema;
    const validator = 'validator' in props ? props.validator : this.props.validator;
    const uiSchema: UiSchema<T, S, F> = ('uiSchema' in props ? props.uiSchema! : this.props.uiSchema!) || {};
    const isUncontrolled = props.formData === undefined && this.props.formData === undefined;
    const edit = typeof inputFormData !== 'undefined';
    const liveValidate = 'liveValidate' in props ? props.liveValidate : this.props.liveValidate;
    const mustValidate = edit && !props.noValidate && liveValidate;
    const experimental_defaultFormStateBehavior =
      'experimental_defaultFormStateBehavior' in props
        ? props.experimental_defaultFormStateBehavior
        : this.props.experimental_defaultFormStateBehavior;
    const experimental_customMergeAllOf =
      'experimental_customMergeAllOf' in props
        ? props.experimental_customMergeAllOf
        : this.props.experimental_customMergeAllOf;
    let schemaUtils: SchemaUtilsType<T, S, F> = state.schemaUtils;
    if (
      !schemaUtils ||
      schemaUtils.doesSchemaUtilsDiffer(
        validator,
        schema,
        experimental_defaultFormStateBehavior,
        experimental_customMergeAllOf,
      )
    ) {
      schemaUtils = createSchemaUtils<T, S, F>(
        validator,
        schema,
        experimental_defaultFormStateBehavior,
        experimental_customMergeAllOf,
      );
    }

    const rootSchema = schemaUtils.getRootSchema();

    // Compute the formData for getDefaultFormState() function based on the inputFormData, isUncontrolled and state
    let defaultsFormData = inputFormData;
    if (inputFormData === IS_RESET) {
      defaultsFormData = undefined;
    } else if (inputFormData === undefined && isUncontrolled) {
      defaultsFormData = state.formData;
    }
    const formData: T = schemaUtils.getDefaultFormState(
      rootSchema,
      defaultsFormData,
      false,
      state.initialDefaultsGenerated,
    ) as T;
    const _retrievedSchema = this.updateRetrievedSchema(
      retrievedSchema ?? schemaUtils.retrieveSchema(rootSchema, formData),
    );

    const getCurrentErrors = (): ValidationData<T> => {
      // If the `props.noValidate` option is set or the schema has changed, we reset the error state.
      if (props.noValidate || isSchemaChanged) {
        return { errors: [], errorSchema: {} };
      } else if (!props.liveValidate) {
        return {
          errors: state.schemaValidationErrors || [],
          errorSchema: state.schemaValidationErrorSchema || {},
        };
      }
      return {
        errors: state.errors || [],
        errorSchema: state.errorSchema || {},
      };
    };

    let errors: RJSFValidationError[];
    let errorSchema: ErrorSchema<T> | undefined;
    let schemaValidationErrors: RJSFValidationError[] = state.schemaValidationErrors;
    let schemaValidationErrorSchema: ErrorSchema<T> = state.schemaValidationErrorSchema;
    // If we are skipping live validate, it means that the state has already been updated with live validation errors
    if (mustValidate && !skipLiveValidate) {
      const liveValidation = this.liveValidate(
        rootSchema,
        schemaUtils,
        state.errorSchema,
        formData,
        undefined,
        state.customErrors,
        retrievedSchema,
        // If retrievedSchema is undefined which means the schema or formData has changed, we do not merge state.
        // Else in the case where it hasn't changed,
        retrievedSchema !== undefined,
      );
      errors = liveValidation.errors;
      errorSchema = liveValidation.errorSchema;
      schemaValidationErrors = liveValidation.schemaValidationErrors;
      schemaValidationErrorSchema = liveValidation.schemaValidationErrorSchema;
    } else {
      const currentErrors = getCurrentErrors();
      errors = currentErrors.errors;
      errorSchema = currentErrors.errorSchema;
      // We only update the error schema for changed fields if mustValidate is false
      if (formDataChangedFields.length > 0 && !mustValidate) {
        const newErrorSchema = formDataChangedFields.reduce(
          (acc, key) => {
            acc[key] = undefined;
            return acc;
          },
          {} as Record<string, undefined>,
        );
        errorSchema = schemaValidationErrorSchema = mergeObjects(
          currentErrors.errorSchema,
          newErrorSchema,
          'preventDuplicates',
        ) as ErrorSchema<T>;
      }
      const mergedErrors = this.mergeErrors({ errorSchema, errors }, props.extraErrors, state.customErrors);
      errors = mergedErrors.errors;
      errorSchema = mergedErrors.errorSchema;
    }

    // Only store a new registry when the props cause a different one to be created
    const newRegistry = this.getRegistry(props, rootSchema, schemaUtils);
    const registry = deepEquals(state.registry, newRegistry) ? state.registry : newRegistry;
    // Only compute a new `fieldPathId` when the `idPrefix` is different than the existing fieldPathId's ID_KEY
    const fieldPathId =
      state.fieldPathId && state.fieldPathId?.[ID_KEY] === registry.globalFormOptions.idPrefix
        ? state.fieldPathId
        : toFieldPathId('', registry.globalFormOptions);
    const nextState: FormState<T, S, F> = {
      schemaUtils,
      schema: rootSchema,
      uiSchema,
      fieldPathId,
      formData,
      edit,
      errors,
      errorSchema,
      schemaValidationErrors,
      schemaValidationErrorSchema,
      retrievedSchema: _retrievedSchema,
      initialDefaultsGenerated: true,
      registry,
    };
    return nextState;
  }

  /** React lifecycle method that is used to determine whether component should be updated.
   *
   * @param nextProps - The next version of the props
   * @param nextState - The next version of the state
   * @returns - True if the component should be updated, false otherwise
   */
  shouldComponentUpdate(nextProps: FormProps<T, S, F>, nextState: FormState<T, S, F>): boolean {
    const { experimental_componentUpdateStrategy = 'customDeep' } = this.props;
    return shouldRender(this, nextProps, nextState, experimental_componentUpdateStrategy);
  }

  /** Validates the `formData` against the `schema` using the `altSchemaUtils` (if provided otherwise it uses the
   * `schemaUtils` in the state), returning the results.
   *
   * @param formData - The new form data to validate
   * @param schema - The schema used to validate against
   * @param [altSchemaUtils] - The alternate schemaUtils to use for validation
   * @param [retrievedSchema] - An optionally retrieved schema for per
   */
  validate(
    formData: T | undefined,
    schema = this.state.schema,
    altSchemaUtils?: SchemaUtilsType<T, S, F>,
    retrievedSchema?: S,
  ): ValidationData<T> {
    const schemaUtils = altSchemaUtils ? altSchemaUtils : this.state.schemaUtils;
    const { customValidate, transformErrors, uiSchema } = this.props;
    const resolvedSchema = retrievedSchema ?? schemaUtils.retrieveSchema(schema, formData);
    return schemaUtils
      .getValidator()
      .validateFormData(formData, resolvedSchema, customValidate, transformErrors, uiSchema);
  }

  /** Renders any errors contained in the `state` in using the `ErrorList`, if not disabled by `showErrorList`. */
  renderErrors(registry: Registry<T, S, F>) {
    const { errors, errorSchema, schema, uiSchema } = this.state;
    const options = getUiOptions<T, S, F>(uiSchema);
    const ErrorListTemplate = getTemplate<'ErrorListTemplate', T, S, F>('ErrorListTemplate', registry, options);

    if (errors && errors.length) {
      return (
        <ErrorListTemplate
          errors={errors}
          errorSchema={errorSchema || {}}
          schema={schema}
          uiSchema={uiSchema}
          registry={registry}
        />
      );
    }
    return null;
  }

  /** Merges any `extraErrors` or `customErrors` into the given `schemaValidation` object, returning the result
   *
   * @param schemaValidation - The `ValidationData` object into which additional errors are merged
   * @param [extraErrors] - The extra errors from the props
   * @param [customErrors] - The customErrors from custom components
   * @return - The `extraErrors` and `customErrors` merged into the `schemaValidation`
   * @private
   */
  private mergeErrors(
    schemaValidation: ValidationData<T>,
    extraErrors?: FormProps['extraErrors'],
    customErrors?: ErrorSchemaBuilder,
  ): ValidationData<T> {
    let errorSchema: ErrorSchema<T> = schemaValidation.errorSchema;
    let errors: RJSFValidationError[] = schemaValidation.errors;
    if (extraErrors) {
      const merged = validationDataMerge(schemaValidation, extraErrors);
      errorSchema = merged.errorSchema;
      errors = merged.errors;
    }
    if (customErrors) {
      const merged = validationDataMerge(schemaValidation, customErrors.ErrorSchema, true);
      errorSchema = merged.errorSchema;
      errors = merged.errors;
    }
    return { errors, errorSchema };
  }

  /** Performs live validation and then updates and returns the errors and error schemas by potentially merging in
   * `extraErrors` and `customErrors`.
   *
   * @param rootSchema - The `rootSchema` from the state
   * @param schemaUtils - The `SchemaUtilsType` from the state
   * @param originalErrorSchema - The original `ErrorSchema` from the state
   * @param [formData] - The new form data to validate
   * @param [extraErrors] - The extra errors from the props
   * @param [customErrors] - The customErrors from custom components
   * @param [retrievedSchema] - An expanded schema, if not provided, it will be retrieved from the `schema` and `formData`
   * @param [mergeIntoOriginalErrorSchema=false] - Optional flag indicating whether we merge into original schema
   * @returns - An object containing `errorSchema`, `errors`, `schemaValidationErrors` and `schemaValidationErrorSchema`
   * @private
   */
  private liveValidate(
    rootSchema: S,
    schemaUtils: SchemaUtilsType<T, S, F>,
    originalErrorSchema: ErrorSchema<S>,
    formData?: T,
    extraErrors?: FormProps['extraErrors'],
    customErrors?: ErrorSchemaBuilder<T>,
    retrievedSchema?: S,
    mergeIntoOriginalErrorSchema = false,
  ) {
    const schemaValidation = this.validate(formData, rootSchema, schemaUtils, retrievedSchema);
    const errors = schemaValidation.errors;
    let errorSchema = schemaValidation.errorSchema;
    // We merge 'originalErrorSchema' with 'schemaValidation.errorSchema.'; This done to display the raised field error.
    if (mergeIntoOriginalErrorSchema) {
      errorSchema = mergeObjects(
        originalErrorSchema,
        schemaValidation.errorSchema,
        'preventDuplicates',
      ) as ErrorSchema<T>;
    }
    const schemaValidationErrors = errors;
    const schemaValidationErrorSchema = errorSchema;
    const mergedErrors = this.mergeErrors({ errorSchema, errors }, extraErrors, customErrors);
    return { ...mergedErrors, schemaValidationErrors, schemaValidationErrorSchema };
  }

  /** Returns the `formData` with only the elements specified in the `fields` list
   *
   * @param formData - The data for the `Form`
   * @param fields - The fields to keep while filtering
   */
  getUsedFormData = (formData: T | undefined, fields: string[][]): T | undefined => {
    // For the case of a single input form
    if (fields.length === 0 && typeof formData !== 'object') {
      return formData;
    }

    // _pick has incorrect type definition, it works with string[][], because lodash/hasIn supports it
    const data: GenericObjectType = _pick(formData, fields as unknown as string[]);
    if (Array.isArray(formData)) {
      return Object.keys(data).map((key: string) => data[key]) as unknown as T;
    }

    return data as T;
  };

  /** Returns the list of field names from inspecting the `pathSchema` as well as using the `formData`
   *
   * @param pathSchema - The `PathSchema` object for the form
   * @param [formData] - The form data to use while checking for empty objects/arrays
   */
  getFieldNames = (pathSchema: PathSchema<T>, formData?: T): string[][] => {
    const formValueHasData = (value: T, isLeaf: boolean) =>
      typeof value !== 'object' || _isEmpty(value) || (isLeaf && !_isEmpty(value));
    const getAllPaths = (_obj: GenericObjectType, acc: string[][] = [], paths: string[][] = [[]]) => {
      const objKeys = Object.keys(_obj);
      objKeys.forEach((key: string) => {
        const data = _obj[key];
        if (typeof data === 'object') {
          const newPaths = paths.map((path) => [...path, key]);
          // If an object is marked with additionalProperties, all its keys are valid
          if (data[RJSF_ADDITIONAL_PROPERTIES_FLAG] && data[NAME_KEY] !== '') {
            acc.push(data[NAME_KEY]);
          } else {
            getAllPaths(data, acc, newPaths);
          }
        } else if (key === NAME_KEY && data !== '') {
          paths.forEach((path) => {
            const formValue = _get(formData, path);
            const isLeaf = objKeys.length === 1;
            // adds path to fieldNames if it points to a value or an empty object/array which is not a leaf
            if (
              formValueHasData(formValue, isLeaf) ||
              (Array.isArray(formValue) && formValue.every((val) => formValueHasData(val, isLeaf)))
            ) {
              acc.push(path);
            }
          });
        }
      });
      return acc;
    };

    return getAllPaths(pathSchema);
  };

  /** Returns the `formData` after filtering to remove any extra data not in a form field
   *
   * @param formData - The data for the `Form`
   * @returns The `formData` after omitting extra data
   */
  omitExtraData = (formData?: T): T | undefined => {
    const { schema, schemaUtils } = this.state;
    const retrievedSchema = schemaUtils.retrieveSchema(schema, formData);
    const pathSchema = schemaUtils.toPathSchema(retrievedSchema, '', formData);
    const fieldNames = this.getFieldNames(pathSchema, formData);
    return this.getUsedFormData(formData, fieldNames);
  };

  /** Allows a user to set a value for the provided `fieldPath`, which must be either a dotted path to the field OR a
   * `FieldPathList`. To set the root element, used either `''` or `[]` for the path. Passing undefined will clear the
   * value in the field.
   *
   * @param fieldPath - Either a dotted path to the field or the `FieldPathList` to the field
   * @param [newValue] - The new value for the field
   */
  setFieldValue = (fieldPath: string | FieldPathList, newValue?: T) => {
    const { registry } = this.state;
    const path = Array.isArray(fieldPath) ? fieldPath : fieldPath.split('.');
    const fieldPathId = toFieldPathId('', registry.globalFormOptions, path);
    this.onChange(newValue, path, undefined, fieldPathId[ID_KEY]);
  };

  /** Pushes the given change information into the `pendingChanges` array and then calls `processPendingChanges()` if
   * the array only contains a single pending change.
   *
   * @param newValue - The new form data from a change to a field
   * @param path - The path to the change into which to set the formData
   * @param [newErrorSchema] - The new `ErrorSchema` based on the field change
   * @param [id] - The id of the field that caused the change
   */
  onChange = (newValue: T | undefined, path: FieldPathList, newErrorSchema?: ErrorSchema<T>, id?: string) => {
    this.pendingChanges.push({ newValue, path, newErrorSchema, id });
    if (this.pendingChanges.length === 1) {
      this.processPendingChange();
    }
  };

  /** Function to handle changes made to a field in the `Form`. This handler gets the first change from the
   * `pendingChanges` list, containing the `newValue` for the `formData` and the `path` at which the `newValue` is to be
   * updated, along with a new, optional `ErrorSchema` for that same `path` and potentially the `id` of the field being
   * changed. It will first update the `formData` with any missing default fields and then, if `omitExtraData` and
   * `liveOmit` are turned on, the `formData` will be filtered to remove any extra data not in a form field. Then, the
   * resulting `formData` will be validated if required. The state will be updated with the new updated (potentially
   * filtered) `formData`, any errors that resulted from validation. Finally the `onChange` callback will be called, if
   * specified, with the updated state and the `processPendingChange()` function is called again.
   */
  processPendingChange() {
    if (this.pendingChanges.length === 0) {
      return;
    }
    const { newValue, path, id } = this.pendingChanges[0];
    const { newErrorSchema } = this.pendingChanges[0];
    const { extraErrors, omitExtraData, liveOmit, noValidate, liveValidate, onChange } = this.props;
    const { formData: oldFormData, schemaUtils, schema, fieldPathId, schemaValidationErrorSchema, errors } = this.state;
    let { customErrors, errorSchema: originalErrorSchema } = this.state;
    const rootPathId = fieldPathId.path[0] || '';

    const isRootPath = !path || path.length === 0 || (path.length === 1 && path[0] === rootPathId);
    let retrievedSchema = this.state.retrievedSchema;
    let formData = isRootPath ? newValue : _cloneDeep(oldFormData);
    if (isObject(formData) || Array.isArray(formData)) {
      if (newValue === ADDITIONAL_PROPERTY_KEY_REMOVE) {
        // For additional properties, we were given the special remove this key value, so unset it
        _unset(formData, path);
      } else if (!isRootPath) {
        // If the newValue is not on the root path, then set it into the form data
        _set(formData, path, newValue);
      }
      // Pass true to skip live validation in `getStateFromProps()` since we will do it a bit later
      const newState = this.getStateFromProps(this.props, formData, undefined, undefined, undefined, true);
      formData = newState.formData;
      retrievedSchema = newState.retrievedSchema;
    }

    const mustValidate = !noValidate && (liveValidate === true || liveValidate === 'onChange');
    let state: Partial<FormState<T, S, F>> = { formData, schema };
    let newFormData = formData;

    if (omitExtraData === true && (liveOmit === true || liveOmit === 'onChange')) {
      newFormData = this.omitExtraData(formData);
      state = {
        formData: newFormData,
      };
    }

    if (newErrorSchema) {
      // First check to see if there is an existing validation error on this path...
      // @ts-expect-error TS2590, because getting from the error schema is confusing TS
      const oldValidationError = !isRootPath ? _get(schemaValidationErrorSchema, path) : schemaValidationErrorSchema;
      // If there is an old validation error for this path, assume we are updating it directly
      if (!_isEmpty(oldValidationError)) {
        // Update the originalErrorSchema "in place" or replace it if it is the root
        if (!isRootPath) {
          _set(originalErrorSchema, path, newErrorSchema);
        } else {
          originalErrorSchema = newErrorSchema;
        }
      } else {
        if (!customErrors) {
          customErrors = new ErrorSchemaBuilder<T>();
        }
        if (isRootPath) {
          const errors = _get(newErrorSchema, ERRORS_KEY);
          if (errors) {
            // only set errors when there are some
            customErrors.setErrors(errors);
          }
        } else {
          _set(customErrors.ErrorSchema, path, newErrorSchema);
        }
      }
    } else if (customErrors && _get(customErrors.ErrorSchema, [...path, ERRORS_KEY])) {
      // If we have custom errors and the path has an error, then we need to clear it
      customErrors.clearErrors(path);
    }
    // If there are pending changes in the queue, skip live validation since it will happen with the last change
    if (mustValidate && this.pendingChanges.length === 1) {
      const liveValidation = this.liveValidate(
        schema,
        schemaUtils,
        originalErrorSchema,
        newFormData,
        extraErrors,
        customErrors,
        retrievedSchema,
      );
      state = { formData: newFormData, ...liveValidation, customErrors };
    } else if (!noValidate && newErrorSchema) {
      // Merging 'newErrorSchema' into 'errorSchema' to display the custom raised errors.
      const mergedErrors = this.mergeErrors({ errorSchema: originalErrorSchema, errors }, extraErrors, customErrors);
      state = {
        formData: newFormData,
        ...mergedErrors,
        customErrors,
      };
    }
    this.setState(state as FormState<T, S, F>, () => {
      if (onChange) {
        onChange(toIChangeEvent({ ...this.state, ...state }), id);
      }
      // Now remove the change we just completed and call this again
      this.pendingChanges.shift();
      this.processPendingChange();
    });
  }

  /**
   * If the retrievedSchema has changed the new retrievedSchema is returned.
   * Otherwise, the old retrievedSchema is returned to persist reference.
   * -  This ensures that AJV retrieves the schema from the cache when it has not changed,
   *    avoiding the performance cost of recompiling the schema.
   *
   * @param retrievedSchema The new retrieved schema.
   * @returns The new retrieved schema if it has changed, else the old retrieved schema.
   */
  private updateRetrievedSchema(retrievedSchema: S) {
    const isTheSame = deepEquals(retrievedSchema, this.state?.retrievedSchema);
    return isTheSame ? this.state.retrievedSchema : retrievedSchema;
  }

  /**
   * Callback function to handle reset form data.
   * - Reset all fields with default values.
   * - Reset validations and errors
   *
   */
  reset = () => {
    // Cast the IS_RESET symbol to T to avoid type issues, we use this symbol to detect reset mode
    const { formData: propsFormData, initialFormData = IS_RESET as T, onChange } = this.props;
    const newState = this.getStateFromProps(
      this.props,
      propsFormData ?? initialFormData,
      undefined,
      undefined,
      undefined,
      true,
    );
    const newFormData = newState.formData;
    const state = {
      formData: newFormData,
      errorSchema: {},
      errors: [] as unknown,
      schemaValidationErrors: [] as unknown,
      schemaValidationErrorSchema: {},
      initialDefaultsGenerated: false,
      customErrors: undefined,
    } as FormState<T, S, F>;

    this.setState(state, () => onChange && onChange(toIChangeEvent({ ...this.state, ...state })));
  };

  /** Callback function to handle when a field on the form is blurred. Calls the `onBlur` callback for the `Form` if it
   * was provided. Also runs any live validation and/or live omit operations if the flags indicate they should happen
   * during `onBlur`.
   *
   * @param id - The unique `id` of the field that was blurred
   * @param data - The data associated with the field that was blurred
   */
  onBlur = (id: string, data: any) => {
    const { onBlur, omitExtraData, liveOmit, liveValidate } = this.props;
    if (onBlur) {
      onBlur(id, data);
    }
    if ((omitExtraData === true && liveOmit === 'onBlur') || liveValidate === 'onBlur') {
      const { onChange, extraErrors } = this.props;
      const { formData } = this.state;
      let newFormData: T | undefined = formData;
      let state: Partial<FormState<T, S, F>> = { formData: newFormData };
      if (omitExtraData === true && liveOmit === 'onBlur') {
        newFormData = this.omitExtraData(formData);
        state = { formData: newFormData };
      }
      if (liveValidate === 'onBlur') {
        const { schema, schemaUtils, errorSchema, customErrors, retrievedSchema } = this.state;
        const liveValidation = this.liveValidate(
          schema,
          schemaUtils,
          errorSchema,
          newFormData,
          extraErrors,
          customErrors,
          retrievedSchema,
        );
        state = { formData: newFormData, ...liveValidation, customErrors };
      }
      const hasChanges = Object.keys(state)
        // Filter out `schemaValidationErrors` and `schemaValidationErrorSchema` since they aren't IChangeEvent props
        .filter((key) => !key.startsWith('schemaValidation'))
        .some((key) => {
          const oldData = _get(this.state, key);
          const newData = _get(state, key);
          return !deepEquals(oldData, newData);
        });
      this.setState(state as FormState<T, S, F>, () => {
        if (onChange && hasChanges) {
          onChange(toIChangeEvent({ ...this.state, ...state }), id);
        }
      });
    }
  };

  /** Callback function to handle when a field on the form is focused. Calls the `onFocus` callback for the `Form` if it
   * was provided.
   *
   * @param id - The unique `id` of the field that was focused
   * @param data - The data associated with the field that was focused
   */
  onFocus = (id: string, data: any) => {
    const { onFocus } = this.props;
    if (onFocus) {
      onFocus(id, data);
    }
  };

  /** Callback function to handle when the form is submitted. First, it prevents the default event behavior. Nothing
   * happens if the target and currentTarget of the event are not the same. It will omit any extra data in the
   * `formData` in the state if `omitExtraData` is true. It will validate the resulting `formData`, reporting errors
   * via the `onError()` callback unless validation is disabled. Finally, it will add in any `extraErrors` and then call
   * back the `onSubmit` callback if it was provided.
   *
   * @param event - The submit HTML form event
   */
  onSubmit = (event: FormEvent<any>) => {
    event.preventDefault();
    if (event.target !== event.currentTarget) {
      return;
    }

    event.persist();
    const { omitExtraData, extraErrors, noValidate, onSubmit } = this.props;
    let { formData: newFormData } = this.state;

    if (omitExtraData === true) {
      newFormData = this.omitExtraData(newFormData);
    }

    if (noValidate || this.validateFormWithFormData(newFormData)) {
      // There are no errors generated through schema validation.
      // Check for user provided errors and update state accordingly.
      const errorSchema = extraErrors || {};
      const errors = extraErrors ? toErrorList(extraErrors) : [];
      this.setState(
        {
          formData: newFormData,
          errors,
          errorSchema,
          schemaValidationErrors: [],
          schemaValidationErrorSchema: {},
        },
        () => {
          if (onSubmit) {
            onSubmit(toIChangeEvent({ ...this.state, formData: newFormData }, 'submitted'), event);
          }
        },
      );
    }
  };

  /** Extracts the `GlobalFormOptions` from the given Form `props`
   *
   * @param props - The form props to extract the global form options from
   * @returns - The `GlobalFormOptions` from the props
   * @private
   */
  private getGlobalFormOptions(props: FormProps<T, S, F>): GlobalFormOptions {
    const {
      uiSchema = {},
      experimental_componentUpdateStrategy,
      idSeparator = DEFAULT_ID_SEPARATOR,
      idPrefix = DEFAULT_ID_PREFIX,
      nameGenerator,
      useFallbackUiForUnsupportedType = false,
    } = props;
    const rootFieldId = uiSchema['ui:rootFieldId'];
    // Omit any options that are undefined or null
    return {
      idPrefix: rootFieldId || idPrefix,
      idSeparator,
      useFallbackUiForUnsupportedType,
      ...(experimental_componentUpdateStrategy !== undefined && { experimental_componentUpdateStrategy }),
      ...(nameGenerator !== undefined && { nameGenerator }),
    };
  }

  /** Computed the registry for the form using the given `props`, `schema` and `schemaUtils` */
  getRegistry(props: FormProps<T, S, F>, schema: S, schemaUtils: SchemaUtilsType<T, S, F>): Registry<T, S, F> {
    const { translateString: customTranslateString, uiSchema = {} } = props;
    const { fields, templates, widgets, formContext, translateString } = getDefaultRegistry<T, S, F>();
    return {
      fields: { ...fields, ...props.fields },
      templates: {
        ...templates,
        ...props.templates,
        ButtonTemplates: {
          ...templates.ButtonTemplates,
          ...props.templates?.ButtonTemplates,
        },
      },
      widgets: { ...widgets, ...props.widgets },
      rootSchema: schema,
      formContext: props.formContext || formContext,
      schemaUtils,
      translateString: customTranslateString || translateString,
      globalUiOptions: uiSchema[UI_GLOBAL_OPTIONS_KEY],
      globalFormOptions: this.getGlobalFormOptions(props),
    };
  }

  /** Provides a function that can be used to programmatically submit the `Form` */
  submit = () => {
    if (this.formElement.current) {
      const submitCustomEvent = new CustomEvent('submit', {
        cancelable: true,
      });
      submitCustomEvent.preventDefault();
      this.formElement.current.dispatchEvent(submitCustomEvent);
      this.formElement.current.requestSubmit();
    }
  };

  /** Attempts to focus on the field associated with the `error`. Uses the `property` field to compute path of the error
   * field, then, using the `idPrefix` and `idSeparator` converts that path into an id. Then the input element with that
   * id is attempted to be found using the `formElement` ref. If it is located, then it is focused.
   *
   * @param error - The error on which to focus
   */
  focusOnError(error: RJSFValidationError) {
    const { idPrefix = 'root', idSeparator = '_' } = this.props;
    const { property } = error;
    const path = _toPath(property);
    if (path[0] === '') {
      // Most of the time the `.foo` property results in the first element being empty, so replace it with the idPrefix
      path[0] = idPrefix;
    } else {
      // Otherwise insert the idPrefix into the first location using unshift
      path.unshift(idPrefix);
    }

    const elementId = path.join(idSeparator);
    let field = this.formElement.current.elements[elementId];
    if (!field) {
      // if not an exact match, try finding an input starting with the element id (like radio buttons or checkboxes)
      field = this.formElement.current.querySelector(`input[id^="${elementId}"`);
    }
    if (field && field.length) {
      // If we got a list with length > 0
      field = field[0];
    }
    if (field) {
      field.focus();
    }
  }

  /** Validates the form using the given `formData`. For use on form submission or on programmatic validation.
   * If `onError` is provided, then it will be called with the list of errors.
   *
   * @param formData - The form data to validate
   * @returns - True if the form is valid, false otherwise.
   */
  validateFormWithFormData = (formData?: T): boolean => {
    const { extraErrors, extraErrorsBlockSubmit, focusOnFirstError, onError } = this.props;
    const { errors: prevErrors } = this.state;
    const schemaValidation = this.validate(formData);
    let errors = schemaValidation.errors;
    let errorSchema = schemaValidation.errorSchema;
    const schemaValidationErrors = errors;
    const schemaValidationErrorSchema = errorSchema;
    const hasError = errors.length > 0 || (extraErrors && extraErrorsBlockSubmit);
    if (hasError) {
      if (extraErrors) {
        const merged = validationDataMerge(schemaValidation, extraErrors);
        errorSchema = merged.errorSchema;
        errors = merged.errors;
      }
      if (focusOnFirstError) {
        if (typeof focusOnFirstError === 'function') {
          focusOnFirstError(errors[0]);
        } else {
          this.focusOnError(errors[0]);
        }
      }
      this.setState(
        {
          errors,
          errorSchema,
          schemaValidationErrors,
          schemaValidationErrorSchema,
        },
        () => {
          if (onError) {
            onError(errors);
          } else {
            console.error('Form validation failed', errors);
          }
        },
      );
    } else if (prevErrors.length > 0) {
      this.setState({
        errors: [],
        errorSchema: {},
        schemaValidationErrors: [],
        schemaValidationErrorSchema: {},
      });
    }
    return !hasError;
  };

  /** Programmatically validate the form.  If `omitExtraData` is true, the `formData` will first be filtered to remove
   * any extra data not in a form field. If `onError` is provided, then it will be called with the list of errors the
   * same way as would happen on form submission.
   *
   * @returns - True if the form is valid, false otherwise.
   */
  validateForm() {
    const { omitExtraData } = this.props;
    let { formData: newFormData } = this.state;
    if (omitExtraData === true) {
      newFormData = this.omitExtraData(newFormData);
    }
    return this.validateFormWithFormData(newFormData);
  }

  /** Renders the `Form` fields inside the <form> | `tagName` or `_internalFormWrapper`, rendering any errors if
   * needed along with the submit button or any children of the form.
   */
  render() {
    const {
      children,
      id,
      className = '',
      tagName,
      name,
      method,
      target,
      action,
      autoComplete,
      enctype,
      acceptCharset,
      noHtml5Validate = false,
      disabled,
      readonly,
      showErrorList = 'top',
      _internalFormWrapper,
    } = this.props;

    const { schema, uiSchema, formData, errorSchema, fieldPathId, registry } = this.state;
    const { SchemaField: _SchemaField } = registry.fields;
    const { SubmitButton } = registry.templates.ButtonTemplates;
    // The `semantic-ui` and `material-ui` themes have `_internalFormWrapper`s that take an `as` prop that is the
    // PropTypes.elementType to use for the inner tag, so we'll need to pass `tagName` along if it is provided.
    // NOTE, the `as` prop is native to `semantic-ui` and is emulated in the `material-ui` theme
    const as = _internalFormWrapper ? tagName : undefined;
    const FormTag = _internalFormWrapper || tagName || 'form';

    let { [SUBMIT_BTN_OPTIONS_KEY]: submitOptions = {} } = getUiOptions<T, S, F>(uiSchema);
    if (disabled) {
      submitOptions = { ...submitOptions, props: { ...submitOptions.props, disabled: true } };
    }
    const submitUiSchema = { [UI_OPTIONS_KEY]: { [SUBMIT_BTN_OPTIONS_KEY]: submitOptions } };

    return (
      <FormTag
        className={className ? className : 'rjsf'}
        id={id}
        name={name}
        method={method}
        target={target}
        action={action}
        autoComplete={autoComplete}
        encType={enctype}
        acceptCharset={acceptCharset}
        noValidate={noHtml5Validate}
        onSubmit={this.onSubmit}
        as={as}
        ref={this.formElement}
      >
        {showErrorList === 'top' && this.renderErrors(registry)}
        <_SchemaField
          name=''
          schema={schema}
          uiSchema={uiSchema}
          errorSchema={errorSchema}
          fieldPathId={fieldPathId}
          formData={formData}
          onChange={this.onChange}
          onBlur={this.onBlur}
          onFocus={this.onFocus}
          registry={registry}
          disabled={disabled}
          readonly={readonly}
        />

        {children ? children : <SubmitButton uiSchema={submitUiSchema} registry={registry} />}
        {showErrorList === 'bottom' && this.renderErrors(registry)}
      </FormTag>
    );
  }
}
