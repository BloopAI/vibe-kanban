import { RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';
import { CustomValidatorOptionsType } from './types.js';
import { compileSchemaValidatorsCode } from './compileSchemaValidatorsCode.js';
export { compileSchemaValidatorsCode };
/** The function used to compile a schema into an output file in the form that allows it to be used as a precompiled
 * validator. The main reasons for using a precompiled validator is reducing code size, improving validation speed and,
 * most importantly, avoiding dynamic code compilation when prohibited by a browser's Content Security Policy. For more
 * information about AJV code compilation see: https://ajv.js.org/standalone.html
 *
 * @param schema - The schema to be compiled into a set of precompiled validators functions
 * @param output - The name of the file into which the precompiled validator functions will be generated
 * @param [options={}] - The set of `CustomValidatorOptionsType` information used to alter the AJV validator used for
 *        compiling the schema. They are the same options that are passed to the `customizeValidator()` function in
 *        order to modify the behavior of the regular AJV-based validator.
 */
export default function compileSchemaValidators<S extends StrictRJSFSchema = RJSFSchema>(schema: S, output: string, options?: CustomValidatorOptionsType): void;
