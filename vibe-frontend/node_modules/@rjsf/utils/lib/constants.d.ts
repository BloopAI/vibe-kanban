/** Below are the list of all the keys into various elements of a RJSFSchema or UiSchema that are used by the various
 * utility functions. In addition to those keys, there are the special `ADDITIONAL_PROPERTY_FLAG` and
 * `RJSF_ADDITIONAL_PROPERTIES_FLAG` flags that is added to a schema under certain conditions by the `retrieveSchema()`
 * utility.
 */
export declare const ADDITIONAL_PROPERTY_FLAG = "__additional_property";
export declare const ADDITIONAL_PROPERTIES_KEY = "additionalProperties";
export declare const ALL_OF_KEY = "allOf";
export declare const ANY_OF_KEY = "anyOf";
export declare const CONST_KEY = "const";
export declare const DEFAULT_KEY = "default";
export declare const DEFINITIONS_KEY = "definitions";
export declare const DEPENDENCIES_KEY = "dependencies";
export declare const ENUM_KEY = "enum";
export declare const ERRORS_KEY = "__errors";
export declare const ID_KEY = "$id";
export declare const IF_KEY = "if";
export declare const ITEMS_KEY = "items";
export declare const JUNK_OPTION_ID = "_$junk_option_schema_id$_";
export declare const NAME_KEY = "$name";
export declare const ONE_OF_KEY = "oneOf";
export declare const PATTERN_PROPERTIES_KEY = "patternProperties";
export declare const PROPERTIES_KEY = "properties";
export declare const READONLY_KEY = "readonly";
export declare const REQUIRED_KEY = "required";
export declare const SUBMIT_BTN_OPTIONS_KEY = "submitButtonOptions";
export declare const REF_KEY = "$ref";
export declare const SCHEMA_KEY = "$schema";
export declare const DEFAULT_ID_PREFIX = "root";
export declare const DEFAULT_ID_SEPARATOR = "_";
/** The path of the discriminator value returned by the schema endpoint.
 * The discriminator is the value in a `oneOf` that determines which option is selected.
 */
export declare const DISCRIMINATOR_PATH: string[];
/** The name of the `formContext` attribute in the React JSON Schema Form Registry
 */
export declare const FORM_CONTEXT_NAME = "formContext";
/** The name of the `layoutGridLookupMap` attribute in the form context
 */
export declare const LOOKUP_MAP_NAME = "layoutGridLookupMap";
export declare const RJSF_ADDITIONAL_PROPERTIES_FLAG = "__rjsf_additionalProperties";
export declare const ROOT_SCHEMA_PREFIX = "__rjsf_rootSchema";
export declare const UI_FIELD_KEY = "ui:field";
export declare const UI_WIDGET_KEY = "ui:widget";
export declare const UI_OPTIONS_KEY = "ui:options";
export declare const UI_GLOBAL_OPTIONS_KEY = "ui:globalOptions";
/** The JSON Schema version strings
 */
export declare const JSON_SCHEMA_DRAFT_2019_09 = "https://json-schema.org/draft/2019-09/schema";
export declare const JSON_SCHEMA_DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";
