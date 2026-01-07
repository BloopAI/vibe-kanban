import getUiOptions from './getUiOptions.js';
/** Checks to see if the `uiSchema` contains the `widget` field and that the widget is not `hidden`
 *
 * @param uiSchema - The UI Schema from which to detect if it is customized
 * @returns - True if the `uiSchema` describes a custom widget, false otherwise
 */
export default function isCustomWidget(uiSchema = {}) {
    return (
    // TODO: Remove the `&& uiSchema['ui:widget'] !== 'hidden'` once we support hidden widgets for arrays.
    // https://rjsf-team.github.io/react-jsonschema-form/docs/usage/widgets/#hidden-widgets
    'widget' in getUiOptions(uiSchema) && getUiOptions(uiSchema)['widget'] !== 'hidden');
}
//# sourceMappingURL=isCustomWidget.js.map