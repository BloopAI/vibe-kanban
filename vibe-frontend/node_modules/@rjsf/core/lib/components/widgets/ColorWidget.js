import { jsx as _jsx } from "react/jsx-runtime";
import { getTemplate } from '@rjsf/utils';
/** The `ColorWidget` component uses the `BaseInputTemplate` changing the type to `color` and disables it when it is
 * either disabled or readonly.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function ColorWidget(props) {
    const { disabled, readonly, options, registry } = props;
    const BaseInputTemplate = getTemplate('BaseInputTemplate', registry, options);
    return _jsx(BaseInputTemplate, { type: 'color', ...props, disabled: disabled || readonly });
}
