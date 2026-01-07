import { ReactElement } from 'react';

/** Helper function that will return the value to use for a widget `label` based on `hideLabel`. The `fallback` is used
 * as the return value from the function when `hideLabel` is true. Due to the implementation of theme components, it
 * may be necessary to return something other than `undefined` to cause the theme component to not render a label. Some
 * themes require may `false` and others may require an empty string.
 *
 * @param [label] - The label string or component to render when not hidden
 * @param [hideLabel] - Flag, if true, will cause the label to be hidden
 * @param [fallback] - One of 3 values, `undefined` (the default), `false` or an empty string
 * @returns - `fallback` if `hideLabel` is true, otherwise `label`
 */

export default function labelValue(label?: string, hideLabel?: boolean, fallback?: ''): undefined | string;
export default function labelValue(label?: string, hideLabel?: boolean, fallback?: false): undefined | false | string;
export default function labelValue(label?: ReactElement, hideLabel?: boolean, fallback?: ''): undefined | ReactElement;
export default function labelValue(
  label?: ReactElement,
  hideLabel?: boolean,
  fallback?: false,
): undefined | false | ReactElement;
export default function labelValue(
  label?: string | ReactElement,
  hideLabel?: boolean,
  fallback?: false | '',
): undefined | false | string | ReactElement {
  return hideLabel ? fallback : label;
}
