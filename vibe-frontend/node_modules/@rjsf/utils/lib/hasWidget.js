import getWidget from './getWidget.js';
/** Detects whether the `widget` exists for the `schema` with the associated `registryWidgets` and returns true if it
 * does, or false if it doesn't.
 *
 * @param schema - The schema for the field
 * @param widget - Either the name of the widget OR a `Widget` implementation to use
 * @param [registeredWidgets={}] - A registry of widget name to `Widget` implementation
 * @returns - True if the widget exists, false otherwise
 */
export default function hasWidget(schema, widget, registeredWidgets = {}) {
    try {
        getWidget(schema, widget, registeredWidgets);
        return true;
    }
    catch (e) {
        const err = e;
        if (err.message && (err.message.startsWith('No widget') || err.message.startsWith('Unsupported widget'))) {
            return false;
        }
        throw e;
    }
}
//# sourceMappingURL=hasWidget.js.map