import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** The `RangeWidget` component uses the `BaseInputTemplate` changing the type to `range` and wrapping the result
 * in a div, with the value along side it.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function RangeWidget(props) {
    const { value, registry: { templates: { BaseInputTemplate }, }, } = props;
    return (_jsxs("div", { className: 'field-range-wrapper', children: [_jsx(BaseInputTemplate, { type: 'range', ...props }), _jsx("span", { className: 'range-view', children: value })] }));
}
