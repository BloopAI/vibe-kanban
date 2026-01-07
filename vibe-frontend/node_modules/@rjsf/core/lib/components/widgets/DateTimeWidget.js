import { jsx as _jsx } from "react/jsx-runtime";
import { getTemplate, localToUTC, utcToLocal, } from '@rjsf/utils';
/** The `DateTimeWidget` component uses the `BaseInputTemplate` changing the type to `datetime-local` and transforms
 * the value to/from utc using the appropriate utility functions.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function DateTimeWidget(props) {
    const { onChange, value, options, registry } = props;
    const BaseInputTemplate = getTemplate('BaseInputTemplate', registry, options);
    return (_jsx(BaseInputTemplate, { type: 'datetime-local', ...props, value: utcToLocal(value), onChange: (value) => onChange(localToUTC(value)) }));
}
