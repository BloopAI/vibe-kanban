import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { TranslatableString, } from '@rjsf/utils';
/** The `ErrorList` component is the template that renders the all the errors associated with the fields in the `Form`
 *
 * @param props - The `ErrorListProps` for this component
 */
export default function ErrorList({ errors, registry, }) {
    const { translateString } = registry;
    return (_jsxs("div", { className: 'panel panel-danger errors', children: [_jsx("div", { className: 'panel-heading', children: _jsx("h3", { className: 'panel-title', children: translateString(TranslatableString.ErrorsLabel) }) }), _jsx("ul", { className: 'list-group', children: errors.map((error, i) => {
                    return (_jsx("li", { className: 'list-group-item text-danger', children: error.stack }, i));
                }) })] }));
}
