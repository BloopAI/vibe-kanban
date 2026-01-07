import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import isObject from 'lodash-es/isObject.js';
import { ADDITIONAL_PROPERTY_FLAG, RJSF_ADDITIONAL_PROPERTIES_FLAG } from '@rjsf/utils';
export const AJV_CONFIG = {
    allErrors: true,
    multipleOfPrecision: 8,
    strict: false,
    verbose: true,
    discriminator: false, // TODO enable this in V6
};
export const COLOR_FORMAT_REGEX = /^(#?([0-9A-Fa-f]{3}){1,2}\b|aqua|black|blue|fuchsia|gray|green|lime|maroon|navy|olive|orange|purple|red|silver|teal|white|yellow|(rgb\(\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*,\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*,\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*\))|(rgb\(\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*\)))$/;
export const DATA_URL_FORMAT_REGEX = /^data:([a-z]+\/[a-z0-9-+.]+)?;(?:name=(.*);)?base64,(.*)$/;
/** Creates an Ajv version 8 implementation object with standard support for the 'color` and `data-url` custom formats.
 * If `additionalMetaSchemas` are provided then the Ajv instance is modified to add each of the meta schemas in the
 * list. If `customFormats` are provided then those additional formats are added to the list of supported formats. If
 * `ajvOptionsOverrides` are provided then they are spread on top of the default `AJV_CONFIG` options when constructing
 * the `Ajv` instance. With Ajv v8, the JSON Schema formats are not provided by default, but can be plugged in. By
 * default, all formats from the `ajv-formats` library are added. To disable this capability, set the `ajvFormatOptions`
 * parameter to `false`. Additionally, you can configure the `ajv-formats` by providing a custom set of
 * [format options](https://github.com/ajv-validator/ajv-formats) to the `ajvFormatOptions` parameter.
 *
 * @param [additionalMetaSchemas] - The list of additional meta schemas that the validator can access
 * @param [customFormats] - The set of additional custom formats that the validator will support
 * @param [ajvOptionsOverrides={}] - The set of validator config override options
 * @param [ajvFormatOptions] - The `ajv-format` options to use when adding formats to `ajv`; pass `false` to disable it
 * @param [AjvClass] - The `Ajv` class to use when creating the validator instance
 */
export default function createAjvInstance(additionalMetaSchemas, customFormats, ajvOptionsOverrides = {}, ajvFormatOptions, AjvClass = Ajv) {
    const ajv = new AjvClass({ ...AJV_CONFIG, ...ajvOptionsOverrides });
    if (ajvFormatOptions) {
        addFormats(ajv, ajvFormatOptions);
    }
    else if (ajvFormatOptions !== false) {
        addFormats(ajv);
    }
    // add custom formats
    ajv.addFormat('data-url', DATA_URL_FORMAT_REGEX);
    ajv.addFormat('color', COLOR_FORMAT_REGEX);
    // Add RJSF-specific additional properties keywords so Ajv doesn't report errors if strict is enabled.
    ajv.addKeyword(ADDITIONAL_PROPERTY_FLAG);
    ajv.addKeyword(RJSF_ADDITIONAL_PROPERTIES_FLAG);
    // add more schemas to validate against
    if (Array.isArray(additionalMetaSchemas)) {
        ajv.addMetaSchema(additionalMetaSchemas);
    }
    // add more custom formats to validate against
    if (isObject(customFormats)) {
        Object.keys(customFormats).forEach((formatName) => {
            ajv.addFormat(formatName, customFormats[formatName]);
        });
    }
    return ajv;
}
//# sourceMappingURL=createAjvInstance.js.map