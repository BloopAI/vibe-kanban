import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback } from 'react';
import { getTemplate } from '@rjsf/utils';
/** The `DateWidget` component uses the `BaseInputTemplate` changing the type to `date` and transforms
 * the value to undefined when it is falsy during the `onChange` handling.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function DateWidget(props) {
    const { onChange, options, registry } = props;
    const BaseInputTemplate = getTemplate('BaseInputTemplate', registry, options);
    const handleChange = useCallback((value) => onChange(value || undefined), [onChange]);
    return _jsx(BaseInputTemplate, { type: 'date', ...props, onChange: handleChange });
}
