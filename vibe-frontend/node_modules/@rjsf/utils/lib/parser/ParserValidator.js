import get from 'lodash-es/get.js';
import { ID_KEY } from '../constants.js';
import hashForSchema from '../hashForSchema.js';
import deepEquals from '../deepEquals.js';
/** An implementation of the `ValidatorType` interface that is designed for use in capturing schemas used by the
 * `isValid()` function. The rest of the implementation of the interface throws errors when it is attempted to be used.
 * An instance of the object allows the caller to capture the schemas used in calls to the `isValid()` function. These
 * captured schema, along with the root schema used to construct the object are stored in the map of schemas keyed by
 * the hashed value of the schema. NOTE: After hashing the schema, an $id with the hash value is added to the
 * schema IF that schema doesn't already have an $id, prior to putting the schema into the map.
 */
export default class ParserValidator {
    /** Construct the ParserValidator for the given `rootSchema`. This `rootSchema` will be stashed in the `schemaMap`
     * first.
     *
     * @param rootSchema - The root schema against which this validator will be executed
     */
    constructor(rootSchema) {
        /** The map of schemas encountered by the ParserValidator */
        this.schemaMap = {};
        this.rootSchema = rootSchema;
        this.addSchema(rootSchema, hashForSchema(rootSchema));
    }
    /** Resets the internal AJV validator to clear schemas from it. Can be helpful for resetting the validator for tests.
     */
    reset() {
        this.schemaMap = {};
    }
    /** Adds the given `schema` to the `schemaMap` keyed by the `hash` or `ID_KEY` if present on the `schema`. If the
     * schema does not have an `ID_KEY`, then the `hash` will be added as the `ID_KEY` to allow the schema to be
     * associated with it's `hash` for future use (by a schema compiler).
     *
     * @param schema - The schema which is to be added to the map
     * @param hash - The hash value at which to map the schema
     */
    addSchema(schema, hash) {
        const key = get(schema, ID_KEY, hash);
        const identifiedSchema = { ...schema, [ID_KEY]: key };
        const existing = this.schemaMap[key];
        if (!existing) {
            this.schemaMap[key] = identifiedSchema;
        }
        else if (!deepEquals(existing, identifiedSchema)) {
            console.error('existing schema:', JSON.stringify(existing, null, 2));
            console.error('new schema:', JSON.stringify(identifiedSchema, null, 2));
            throw new Error(`Two different schemas exist with the same key ${key}! What a bad coincidence. If possible, try adding an $id to one of the schemas`);
        }
    }
    /** Returns the current `schemaMap` to the caller
     */
    getSchemaMap() {
        return this.schemaMap;
    }
    /** Implements the `ValidatorType` `isValid()` method to capture the `schema` in the `schemaMap`. Throws an error when
     * the `rootSchema` is not the same as the root schema provided during construction.
     *
     * @param schema - The schema to record in the `schemaMap`
     * @param _formData - The formData parameter that is ignored
     * @param rootSchema - The root schema associated with the schema
     * @throws - Error when the given `rootSchema` differs from the root schema provided during construction
     */
    isValid(schema, _formData, rootSchema) {
        if (!deepEquals(rootSchema, this.rootSchema)) {
            throw new Error('Unexpectedly calling isValid() with a rootSchema that differs from the construction rootSchema');
        }
        this.addSchema(schema, hashForSchema(schema));
        return false;
    }
    /** Implements the `ValidatorType` `rawValidation()` method to throw an error since it is never supposed to be called
     *
     * @param _schema - The schema parameter that is ignored
     * @param _formData - The formData parameter that is ignored
     */
    rawValidation(_schema, _formData) {
        throw new Error('Unexpectedly calling the `rawValidation()` method during schema parsing');
    }
    /** Implements the `ValidatorType` `toErrorList()` method to throw an error since it is never supposed to be called
     *
     * @param _errorSchema - The error schema parameter that is ignored
     * @param _fieldPath - The field path parameter that is ignored
     */
    toErrorList(_errorSchema, _fieldPath) {
        throw new Error('Unexpectedly calling the `toErrorList()` method during schema parsing');
    }
    /** Implements the `ValidatorType` `validateFormData()` method to throw an error since it is never supposed to be
     * called
     *
     * @param _formData - The formData parameter that is ignored
     * @param _schema - The schema parameter that is ignored
     * @param _customValidate - The customValidate parameter that is ignored
     * @param _transformErrors - The transformErrors parameter that is ignored
     * @param _uiSchema - The uiSchema parameter that is ignored
     */
    validateFormData(_formData, _schema, _customValidate, _transformErrors, _uiSchema) {
        throw new Error('Unexpectedly calling the `validateFormData()` method during schema parsing');
    }
}
//# sourceMappingURL=ParserValidator.js.map