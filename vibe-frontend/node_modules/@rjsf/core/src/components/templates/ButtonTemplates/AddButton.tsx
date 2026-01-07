import { FormContextType, IconButtonProps, RJSFSchema, StrictRJSFSchema, TranslatableString } from '@rjsf/utils';

import IconButton from './IconButton';

/** The `AddButton` renders a button that represent the `Add` action on a form
 */
export default function AddButton<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({
  id,
  className,
  onClick,
  disabled,
  registry,
}: IconButtonProps<T, S, F>) {
  const { translateString } = registry;
  return (
    <div className='row'>
      <p
        className={`col-xs-4 col-sm-2 col-lg-1 col-xs-offset-8 col-sm-offset-10 col-lg-offset-11 text-right ${className}`}
      >
        <IconButton
          id={id}
          iconType='info'
          icon='plus'
          className='btn-add col-xs-12'
          title={translateString(TranslatableString.AddButton)}
          onClick={onClick}
          disabled={disabled}
          registry={registry}
        />
      </p>
    </div>
  );
}
