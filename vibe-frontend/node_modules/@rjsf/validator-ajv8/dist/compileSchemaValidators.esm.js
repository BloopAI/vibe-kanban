// src/compileSchemaValidators.ts
import fs from "fs";

// src/compileSchemaValidatorsCode.ts
import standaloneCode from "ajv/dist/standalone";
import { schemaParser } from "@rjsf/utils";

// src/createAjvInstance.ts
import Ajv from "ajv";
import addFormats from "ajv-formats";
import isObject from "lodash/isObject";
import { ADDITIONAL_PROPERTY_FLAG, RJSF_ADDITIONAL_PROPERTIES_FLAG } from "@rjsf/utils";
var AJV_CONFIG = {
  allErrors: true,
  multipleOfPrecision: 8,
  strict: false,
  verbose: true,
  discriminator: false
  // TODO enable this in V6
};
var COLOR_FORMAT_REGEX = /^(#?([0-9A-Fa-f]{3}){1,2}\b|aqua|black|blue|fuchsia|gray|green|lime|maroon|navy|olive|orange|purple|red|silver|teal|white|yellow|(rgb\(\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*,\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*,\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*\))|(rgb\(\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*\)))$/;
var DATA_URL_FORMAT_REGEX = /^data:([a-z]+\/[a-z0-9-+.]+)?;(?:name=(.*);)?base64,(.*)$/;
function createAjvInstance(additionalMetaSchemas, customFormats, ajvOptionsOverrides = {}, ajvFormatOptions, AjvClass = Ajv) {
  const ajv = new AjvClass({ ...AJV_CONFIG, ...ajvOptionsOverrides });
  if (ajvFormatOptions) {
    addFormats(ajv, ajvFormatOptions);
  } else if (ajvFormatOptions !== false) {
    addFormats(ajv);
  }
  ajv.addFormat("data-url", DATA_URL_FORMAT_REGEX);
  ajv.addFormat("color", COLOR_FORMAT_REGEX);
  ajv.addKeyword(ADDITIONAL_PROPERTY_FLAG);
  ajv.addKeyword(RJSF_ADDITIONAL_PROPERTIES_FLAG);
  if (Array.isArray(additionalMetaSchemas)) {
    ajv.addMetaSchema(additionalMetaSchemas);
  }
  if (isObject(customFormats)) {
    Object.keys(customFormats).forEach((formatName) => {
      ajv.addFormat(formatName, customFormats[formatName]);
    });
  }
  return ajv;
}

// src/compileSchemaValidatorsCode.ts
function compileSchemaValidatorsCode(schema, options = {}) {
  const schemaMaps = schemaParser(schema);
  const schemas = Object.values(schemaMaps);
  const { additionalMetaSchemas, customFormats, ajvOptionsOverrides = {}, ajvFormatOptions, AjvClass } = options;
  const compileOptions = {
    ...ajvOptionsOverrides,
    code: { lines: true, ...ajvOptionsOverrides.code, source: true },
    schemas
  };
  const ajv = createAjvInstance(additionalMetaSchemas, customFormats, compileOptions, ajvFormatOptions, AjvClass);
  return standaloneCode(ajv);
}

// src/compileSchemaValidators.ts
function compileSchemaValidators(schema, output, options = {}) {
  console.log("parsing the schema");
  const moduleCode = compileSchemaValidatorsCode(schema, options);
  console.log(`writing ${output}`);
  fs.writeFileSync(output, moduleCode);
}
export {
  compileSchemaValidatorsCode,
  compileSchemaValidators as default
};
//# sourceMappingURL=compileSchemaValidators.esm.js.map
