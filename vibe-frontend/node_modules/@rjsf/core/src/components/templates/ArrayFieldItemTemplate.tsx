import { CSSProperties } from 'react';
import {
  ArrayFieldItemTemplateProps,
  FormContextType,
  getTemplate,
  getUiOptions,
  RJSFSchema,
  StrictRJSFSchema,
} from '@rjsf/utils';

/** The `ArrayFieldItemTemplate` component is the template used to render an items of an array.
 *
 * @param props - The `ArrayFieldItemTemplateProps` props for the component
 */
export default function ArrayFieldItemTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: ArrayFieldItemTemplateProps<T, S, F>) {
  const { children, className, buttonsProps, displayLabel, hasDescription, hasToolbar, registry, uiSchema } = props;
  const uiOptions = getUiOptions<T, S, F>(uiSchema);
  const ArrayFieldItemButtonsTemplate = getTemplate<'ArrayFieldItemButtonsTemplate', T, S, F>(
    'ArrayFieldItemButtonsTemplate',
    registry,
    uiOptions,
  );
  const btnStyle: CSSProperties = {
    flex: 1,
    paddingLeft: 6,
    paddingRight: 6,
    fontWeight: 'bold',
  };
  const margin = hasDescription ? 31 : 9;
  const containerStyle = { display: 'flex', alignItems: displayLabel ? 'center' : 'baseline' };
  const toolbarStyle = { display: 'flex', justifyContent: 'flex-end', marginTop: displayLabel ? `${margin}px` : 0 };
  return (
    <div className={className} style={containerStyle}>
      <div className={hasToolbar ? 'col-xs-9 col-md-10 col-xl-11' : 'col-xs-12'}>{children}</div>
      {hasToolbar && (
        <div className='col-xs-3 col-md-2 col-xl-1 array-item-toolbox'>
          <div className='btn-group' style={toolbarStyle}>
            <ArrayFieldItemButtonsTemplate {...buttonsProps} style={btnStyle} />
          </div>
        </div>
      )}
    </div>
  );
}
