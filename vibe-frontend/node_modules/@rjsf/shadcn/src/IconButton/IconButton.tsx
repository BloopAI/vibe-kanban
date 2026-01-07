import { FormContextType, IconButtonProps, RJSFSchema, StrictRJSFSchema, TranslatableString } from '@rjsf/utils';
import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';

import { Button, buttonVariants } from '../components/ui/button';

export type ShadIconButtonProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
> = IconButtonProps<T, S, F> & VariantProps<typeof buttonVariants>;

/** Base button component that renders a Shadcn button with an icon for RJSF form actions.
 * This component serves as the foundation for other specialized buttons used in array operations.
 * It combines RJSF's IconButtonProps with Shadcn's ButtonProps to provide a consistent styling
 * and behavior across the form.
 *
 * @param props - The combined props from RJSF IconButtonProps and Shadcn ButtonProps, including icon and event handlers
 */
export default function IconButton<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: ShadIconButtonProps<T, S, F>,
) {
  const { icon, iconType, className, uiSchema, registry, ...otherProps } = props;
  return (
    <Button size='icon' variant='outline' className={className} {...otherProps} type='button'>
      {icon}
    </Button>
  );
}

/** Renders a copy button for RJSF array fields that allows users to duplicate array items.
 * The button includes a copy icon and uses the RJSF translation system for the tooltip text.
 * This is used within ArrayField to provide item duplication functionality.
 *
 * @param props - The RJSF icon button properties, including registry for translations and event handlers
 */
export function CopyButton<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: ShadIconButtonProps<T, S, F>,
) {
  const {
    registry: { translateString },
  } = props;
  return (
    <IconButton title={translateString(TranslatableString.CopyButton)} {...props} icon={<Copy className='h-4 w-4' />} />
  );
}

/** Renders a move down button for RJSF array fields that allows reordering of array items.
 * The button includes a chevron-down icon and uses the RJSF translation system for the tooltip text.
 * This is used within ArrayField to allow moving items to a lower index in the array.
 *
 * @param props - The RJSF icon button properties, including registry for translations and event handlers
 */
export function MoveDownButton<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: ShadIconButtonProps<T, S, F>,
) {
  const {
    registry: { translateString },
  } = props;
  return (
    <IconButton
      title={translateString(TranslatableString.MoveDownButton)}
      {...props}
      icon={<ChevronDown className='h-4 w-4' />}
    />
  );
}

/** Renders a move up button for RJSF array fields that allows reordering of array items.
 * The button includes a chevron-up icon and uses the RJSF translation system for the tooltip text.
 * This is used within ArrayField to allow moving items to a higher index in the array.
 *
 * @param props - The RJSF icon button properties, including registry for translations and event handlers
 */
export function MoveUpButton<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: ShadIconButtonProps<T, S, F>,
) {
  const {
    registry: { translateString },
  } = props;
  return (
    <IconButton
      title={translateString(TranslatableString.MoveUpButton)}
      {...props}
      icon={<ChevronUp className='h-4 w-4' />}
    />
  );
}

/** Renders a remove button for RJSF array fields that allows deletion of array items.
 * The button includes a trash icon and uses the RJSF translation system for the tooltip text.
 * It has special styling with destructive colors to indicate its dangerous action.
 * This is used within ArrayField to provide item removal functionality.
 *
 * @param props - The RJSF icon button properties, including registry for translations and event handlers
 */
export function RemoveButton<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: ShadIconButtonProps<T, S, F>,
) {
  const {
    registry: { translateString },
  } = props;
  return (
    <IconButton
      title={translateString(TranslatableString.RemoveButton)}
      {...props}
      className={'border-destructive'}
      icon={<Trash2 className='h-4 w-4 stroke-destructive' />}
    />
  );
}
