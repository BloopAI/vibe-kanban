import { FormContextType, getUiOptions, RJSFSchema, StrictRJSFSchema, TitleFieldProps } from '@rjsf/utils';

import { Separator } from '../components/ui/separator';

/** The `TitleField` is the template to use to render the title of a field
 *
 * @param props - The `TitleFieldProps` for this component
 */
export default function TitleField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({
  id,
  title,
  uiSchema,
  optionalDataControl,
}: TitleFieldProps<T, S, F>) {
  const uiOptions = getUiOptions<T, S, F>(uiSchema);
  let heading = <h5>{uiOptions.title || title}</h5>;
  if (optionalDataControl) {
    heading = (
      <div className='flex flex-row'>
        <div className='flex-grow'>{heading}</div>
        <div className='flex'>{optionalDataControl}</div>
      </div>
    );
  }
  return (
    <div id={id} className='my-1 flex flex-col gap-0.5'>
      {heading}
      <Separator dir='horizontal' style={{ height: '1px' }} className='my-1' />
    </div>
  );
}
