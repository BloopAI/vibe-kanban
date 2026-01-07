import { GridTemplateProps } from '@rjsf/utils';

/** Renders a `GridTemplate` for bootstrap 3, which is expecting the column information coming in via the `className`
 * prop. Also spreads all the other props provided by the user directly on the div.
 *
 * @param props - The GridTemplateProps, including the expected className for the bootstrap 3 grid behavior
 */
export default function GridTemplate(props: GridTemplateProps) {
  const { children, column, className, ...rest } = props;
  return (
    <div className={className} {...rest}>
      {children}
    </div>
  );
}
