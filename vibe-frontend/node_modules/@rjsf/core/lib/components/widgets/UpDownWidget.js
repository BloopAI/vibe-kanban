import { jsx as _jsx } from "react/jsx-runtime";
import { getTemplate } from '@rjsf/utils';
/** The `UpDownWidget` component uses the `BaseInputTemplate` changing the type to `number`.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function UpDownWidget(props) {
    const { options, registry } = props;
    const BaseInputTemplate = getTemplate('BaseInputTemplate', registry, options);
    return _jsx(BaseInputTemplate, { type: 'number', ...props });
}
