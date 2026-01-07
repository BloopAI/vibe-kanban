import { jsx as _jsx } from "react/jsx-runtime";
import { getTemplate } from '@rjsf/utils';
/** The `EmailWidget` component uses the `BaseInputTemplate` changing the type to `email`.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function EmailWidget(props) {
    const { options, registry } = props;
    const BaseInputTemplate = getTemplate('BaseInputTemplate', registry, options);
    return _jsx(BaseInputTemplate, { type: 'email', ...props });
}
