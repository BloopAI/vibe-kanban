import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const REQUIRED_FIELD_SYMBOL = '*';
/** Renders a label for a field
 *
 * @param props - The `LabelProps` for this component
 */
export default function Label(props) {
    const { label, required, id } = props;
    if (!label) {
        return null;
    }
    return (_jsxs("label", { className: 'control-label', htmlFor: id, children: [label, required && _jsx("span", { className: 'required', children: REQUIRED_FIELD_SYMBOL })] }));
}
