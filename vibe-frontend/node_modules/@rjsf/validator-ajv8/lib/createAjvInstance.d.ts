import Ajv, { Options } from 'ajv';
import { FormatsPluginOptions } from 'ajv-formats';
import { CustomValidatorOptionsType } from './types.js';
export declare const AJV_CONFIG: Options;
export declare const COLOR_FORMAT_REGEX: RegExp;
export declare const DATA_URL_FORMAT_REGEX: RegExp;
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
export default function createAjvInstance(additionalMetaSchemas?: CustomValidatorOptionsType['additionalMetaSchemas'], customFormats?: CustomValidatorOptionsType['customFormats'], ajvOptionsOverrides?: CustomValidatorOptionsType['ajvOptionsOverrides'], ajvFormatOptions?: FormatsPluginOptions | false, AjvClass?: typeof Ajv): Ajv;
