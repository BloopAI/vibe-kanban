import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback } from 'react';
import { getTemplate } from '@rjsf/utils';
/** The `TimeWidget` component uses the `BaseInputTemplate` changing the type to `time` and transforms
 * the value to undefined when it is falsy during the `onChange` handling.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function TimeWidget(props) {
    const { onChange, options, registry } = props;
    const BaseInputTemplate = getTemplate('BaseInputTemplate', registry, options);
    const handleChange = useCallback((value) => onChange(value ? `${value}:00` : undefined), [onChange]);
    return _jsx(BaseInputTemplate, { type: 'time', ...props, onChange: handleChange });
}
