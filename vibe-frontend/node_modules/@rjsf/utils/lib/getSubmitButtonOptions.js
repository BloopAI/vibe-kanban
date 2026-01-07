import { SUBMIT_BTN_OPTIONS_KEY } from './constants.js';
import getUiOptions from './getUiOptions.js';
/** The default submit button options, exported for testing purposes
 */
export const DEFAULT_OPTIONS = {
    props: {
        disabled: false,
    },
    submitText: 'Submit',
    norender: false,
};
/** Extracts any `ui:submitButtonOptions` from the `uiSchema` and merges them onto the `DEFAULT_OPTIONS`
 *
 * @param [uiSchema={}] - the UI Schema from which to extract submit button props
 * @returns - The merging of the `DEFAULT_OPTIONS` with any custom ones
 */
export default function getSubmitButtonOptions(uiSchema = {}) {
    const uiOptions = getUiOptions(uiSchema);
    if (uiOptions && uiOptions[SUBMIT_BTN_OPTIONS_KEY]) {
        const options = uiOptions[SUBMIT_BTN_OPTIONS_KEY];
        return { ...DEFAULT_OPTIONS, ...options };
    }
    return DEFAULT_OPTIONS;
}
//# sourceMappingURL=getSubmitButtonOptions.js.map