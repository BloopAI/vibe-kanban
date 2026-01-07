import { jsx as _jsx } from "react/jsx-runtime";
import { getTemplate } from '@rjsf/utils';
/** The `TextWidget` component uses the `BaseInputTemplate`.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function TextWidget(props) {
    const { options, registry } = props;
    const BaseInputTemplate = getTemplate('BaseInputTemplate', registry, options);
    return _jsx(BaseInputTemplate, { ...props });
}
