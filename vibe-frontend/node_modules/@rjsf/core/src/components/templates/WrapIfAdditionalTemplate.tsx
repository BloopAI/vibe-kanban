import {
  ADDITIONAL_PROPERTY_FLAG,
  buttonId,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  TranslatableString,
  WrapIfAdditionalTemplateProps,
} from '@rjsf/utils';

import Label from './FieldTemplate/Label';

/** The `WrapIfAdditional` component is used by the `FieldTemplate` to rename, or remove properties that are
 * part of an `additionalProperties` part of a schema.
 *
 * @param props - The `WrapIfAdditionalProps` for this component
 */
export default function WrapIfAdditionalTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: WrapIfAdditionalTemplateProps<T, S, F>) {
  const {
    id,
    classNames,
    style,
    disabled,
    displayLabel,
    label,
    onKeyRenameBlur,
    onRemoveProperty,
    rawDescription,
    readonly,
    required,
    schema,
    hideError,
    rawErrors,
    children,
    uiSchema,
    registry,
  } = props;
  const { templates, translateString } = registry;
  // Button templates are not overridden in the uiSchema
  const { RemoveButton } = templates.ButtonTemplates;
  const keyLabel = translateString(TranslatableString.KeyLabel, [label]);
  const additional = ADDITIONAL_PROPERTY_FLAG in schema;
  const hasDescription = !!rawDescription;

  const classNamesList = ['form-group', classNames];
  if (!hideError && rawErrors && rawErrors.length > 0) {
    classNamesList.push('has-error has-danger');
  }
  const uiClassNames = classNamesList.join(' ').trim();

  if (!additional) {
    return (
      <div className={uiClassNames} style={style}>
        {children}
      </div>
    );
  }
  const margin = hasDescription ? 46 : 26;
  return (
    <div className={uiClassNames} style={style}>
      <div className='row'>
        <div className='col-xs-5 form-additional'>
          <div className='form-group'>
            {displayLabel && <Label label={keyLabel} required={required} id={`${id}-key`} />}
            {displayLabel && rawDescription && <div>&nbsp;</div>}
            <input
              className='form-control'
              type='text'
              id={`${id}-key`}
              onBlur={onKeyRenameBlur}
              defaultValue={label}
            />
          </div>
        </div>
        <div className='form-additional form-group col-xs-5'>{children}</div>
        <div className='col-xs-2' style={{ marginTop: displayLabel ? `${margin}px` : undefined }}>
          <RemoveButton
            id={buttonId(id, 'remove')}
            className='rjsf-object-property-remove btn-block'
            style={{ border: '0' }}
            disabled={disabled || readonly}
            onClick={onRemoveProperty}
            uiSchema={uiSchema}
            registry={registry}
          />
        </div>
      </div>
    </div>
  );
}
