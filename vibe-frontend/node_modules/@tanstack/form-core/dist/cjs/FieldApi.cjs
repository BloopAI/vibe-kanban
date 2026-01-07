"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const store = require("@tanstack/store");
const standardSchemaValidator = require("./standardSchemaValidator.cjs");
const metaHelper = require("./metaHelper.cjs");
const utils = require("./utils.cjs");
const ValidationLogic = require("./ValidationLogic.cjs");
class FieldApi {
  /**
   * Initializes a new `FieldApi` instance.
   */
  constructor(opts) {
    this.options = {};
    this.mount = () => {
      const cleanup = this.store.mount();
      if (this.options.defaultValue !== void 0 && !this.getMeta().isTouched) {
        this.form.setFieldValue(this.name, this.options.defaultValue, {
          dontUpdateMeta: true
        });
      }
      const info = this.getInfo();
      info.instance = this;
      this.update(this.options);
      const { onMount } = this.options.validators || {};
      if (onMount) {
        const error = this.runValidator({
          validate: onMount,
          value: {
            value: this.state.value,
            fieldApi: this,
            validationSource: "field"
          },
          type: "validate"
        });
        if (error) {
          this.setMeta(
            (prev) => ({
              ...prev,
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              errorMap: { ...prev?.errorMap, onMount: error },
              errorSourceMap: {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                ...prev?.errorSourceMap,
                onMount: "field"
              }
            })
          );
        }
      }
      this.options.listeners?.onMount?.({
        value: this.state.value,
        fieldApi: this
      });
      return cleanup;
    };
    this.update = (opts2) => {
      this.options = opts2;
      this.name = opts2.name;
      if (!this.state.meta.isTouched && this.options.defaultValue !== void 0) {
        const formField = this.form.getFieldValue(this.name);
        if (!utils.evaluate(formField, opts2.defaultValue)) {
          this.form.setFieldValue(this.name, opts2.defaultValue, {
            dontUpdateMeta: true,
            dontValidate: true,
            dontRunListeners: true
          });
        }
      }
      if (!this.form.getFieldMeta(this.name)) {
        this.form.setFieldMeta(this.name, this.state.meta);
      }
    };
    this.getValue = () => {
      return this.form.getFieldValue(this.name);
    };
    this.setValue = (updater, options) => {
      this.form.setFieldValue(
        this.name,
        updater,
        utils.mergeOpts(options, { dontRunListeners: true, dontValidate: true })
      );
      if (!options?.dontRunListeners) {
        this.triggerOnChangeListener();
      }
      if (!options?.dontValidate) {
        this.validate("change");
      }
    };
    this.getMeta = () => this.store.state.meta;
    this.setMeta = (updater) => this.form.setFieldMeta(this.name, updater);
    this.getInfo = () => this.form.getFieldInfo(this.name);
    this.pushValue = (value, options) => {
      this.form.pushFieldValue(
        this.name,
        value,
        utils.mergeOpts(options, { dontRunListeners: true })
      );
      if (!options?.dontRunListeners) {
        this.triggerOnChangeListener();
      }
    };
    this.insertValue = (index, value, options) => {
      this.form.insertFieldValue(
        this.name,
        index,
        value,
        utils.mergeOpts(options, { dontRunListeners: true })
      );
      if (!options?.dontRunListeners) {
        this.triggerOnChangeListener();
      }
    };
    this.replaceValue = (index, value, options) => {
      this.form.replaceFieldValue(
        this.name,
        index,
        value,
        utils.mergeOpts(options, { dontRunListeners: true })
      );
      if (!options?.dontRunListeners) {
        this.triggerOnChangeListener();
      }
    };
    this.removeValue = (index, options) => {
      this.form.removeFieldValue(
        this.name,
        index,
        utils.mergeOpts(options, { dontRunListeners: true })
      );
      if (!options?.dontRunListeners) {
        this.triggerOnChangeListener();
      }
    };
    this.swapValues = (aIndex, bIndex, options) => {
      this.form.swapFieldValues(
        this.name,
        aIndex,
        bIndex,
        utils.mergeOpts(options, { dontRunListeners: true })
      );
      if (!options?.dontRunListeners) {
        this.triggerOnChangeListener();
      }
    };
    this.moveValue = (aIndex, bIndex, options) => {
      this.form.moveFieldValues(
        this.name,
        aIndex,
        bIndex,
        utils.mergeOpts(options, { dontRunListeners: true })
      );
      if (!options?.dontRunListeners) {
        this.triggerOnChangeListener();
      }
    };
    this.clearValues = (options) => {
      this.form.clearFieldValues(
        this.name,
        utils.mergeOpts(options, { dontRunListeners: true })
      );
      if (!options?.dontRunListeners) {
        this.triggerOnChangeListener();
      }
    };
    this.getLinkedFields = (cause) => {
      const fields = Object.values(this.form.fieldInfo);
      const linkedFields = [];
      for (const field of fields) {
        if (!field.instance) continue;
        const { onChangeListenTo, onBlurListenTo } = field.instance.options.validators || {};
        if (cause === "change" && onChangeListenTo?.includes(this.name)) {
          linkedFields.push(field.instance);
        }
        if (cause === "blur" && onBlurListenTo?.includes(this.name)) {
          linkedFields.push(field.instance);
        }
      }
      return linkedFields;
    };
    this.validateSync = (cause, errorFromForm) => {
      const validates = utils.getSyncValidatorArray(cause, {
        ...this.options,
        form: this.form,
        validationLogic: this.form.options.validationLogic || ValidationLogic.defaultValidationLogic
      });
      const linkedFields = this.getLinkedFields(cause);
      const linkedFieldValidates = linkedFields.reduce(
        (acc, field) => {
          const fieldValidates = utils.getSyncValidatorArray(cause, {
            ...field.options,
            form: field.form,
            validationLogic: field.form.options.validationLogic || ValidationLogic.defaultValidationLogic
          });
          fieldValidates.forEach((validate) => {
            validate.field = field;
          });
          return acc.concat(fieldValidates);
        },
        []
      );
      let hasErrored = false;
      store.batch(() => {
        const validateFieldFn = (field, validateObj) => {
          const errorMapKey = getErrorMapKey(validateObj.cause);
          const fieldLevelError = validateObj.validate ? normalizeError(
            field.runValidator({
              validate: validateObj.validate,
              value: {
                value: field.store.state.value,
                validationSource: "field",
                fieldApi: field
              },
              type: "validate"
            })
          ) : void 0;
          const formLevelError = errorFromForm[errorMapKey];
          const { newErrorValue, newSource } = utils.determineFieldLevelErrorSourceAndValue({
            formLevelError,
            fieldLevelError
          });
          if (field.state.meta.errorMap?.[errorMapKey] !== newErrorValue) {
            field.setMeta((prev) => ({
              ...prev,
              errorMap: {
                ...prev.errorMap,
                [errorMapKey]: newErrorValue
              },
              errorSourceMap: {
                ...prev.errorSourceMap,
                [errorMapKey]: newSource
              }
            }));
          }
          if (newErrorValue) {
            hasErrored = true;
          }
        };
        for (const validateObj of validates) {
          validateFieldFn(this, validateObj);
        }
        for (const fieldValitateObj of linkedFieldValidates) {
          if (!fieldValitateObj.validate) continue;
          validateFieldFn(fieldValitateObj.field, fieldValitateObj);
        }
      });
      const submitErrKey = getErrorMapKey("submit");
      if (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.state.meta.errorMap?.[submitErrKey] && cause !== "submit" && !hasErrored
      ) {
        this.setMeta((prev) => ({
          ...prev,
          errorMap: {
            ...prev.errorMap,
            [submitErrKey]: void 0
          },
          errorSourceMap: {
            ...prev.errorSourceMap,
            [submitErrKey]: void 0
          }
        }));
      }
      return { hasErrored };
    };
    this.validateAsync = async (cause, formValidationResultPromise) => {
      const validates = utils.getAsyncValidatorArray(cause, {
        ...this.options,
        form: this.form,
        validationLogic: this.form.options.validationLogic || ValidationLogic.defaultValidationLogic
      });
      const asyncFormValidationResults = await formValidationResultPromise;
      const linkedFields = this.getLinkedFields(cause);
      const linkedFieldValidates = linkedFields.reduce(
        (acc, field) => {
          const fieldValidates = utils.getAsyncValidatorArray(cause, {
            ...field.options,
            form: field.form,
            validationLogic: field.form.options.validationLogic || ValidationLogic.defaultValidationLogic
          });
          fieldValidates.forEach((validate) => {
            validate.field = field;
          });
          return acc.concat(fieldValidates);
        },
        []
      );
      const validatesPromises = [];
      const linkedPromises = [];
      const hasAsyncValidators = validates.some((v) => v.validate) || linkedFieldValidates.some((v) => v.validate);
      if (hasAsyncValidators) {
        if (!this.state.meta.isValidating) {
          this.setMeta((prev) => ({ ...prev, isValidating: true }));
        }
        for (const linkedField of linkedFields) {
          linkedField.setMeta((prev) => ({ ...prev, isValidating: true }));
        }
      }
      const validateFieldAsyncFn = (field, validateObj, promises) => {
        const errorMapKey = getErrorMapKey(validateObj.cause);
        const fieldValidatorMeta = field.getInfo().validationMetaMap[errorMapKey];
        fieldValidatorMeta?.lastAbortController.abort();
        const controller = new AbortController();
        this.getInfo().validationMetaMap[errorMapKey] = {
          lastAbortController: controller
        };
        promises.push(
          new Promise(async (resolve) => {
            let rawError;
            try {
              rawError = await new Promise((rawResolve, rawReject) => {
                if (this.timeoutIds.validations[validateObj.cause]) {
                  clearTimeout(this.timeoutIds.validations[validateObj.cause]);
                }
                this.timeoutIds.validations[validateObj.cause] = setTimeout(
                  async () => {
                    if (controller.signal.aborted) return rawResolve(void 0);
                    try {
                      rawResolve(
                        await this.runValidator({
                          validate: validateObj.validate,
                          value: {
                            value: field.store.state.value,
                            fieldApi: field,
                            signal: controller.signal,
                            validationSource: "field"
                          },
                          type: "validateAsync"
                        })
                      );
                    } catch (e) {
                      rawReject(e);
                    }
                  },
                  validateObj.debounceMs
                );
              });
            } catch (e) {
              rawError = e;
            }
            if (controller.signal.aborted) return resolve(void 0);
            const fieldLevelError = normalizeError(rawError);
            const formLevelError = asyncFormValidationResults[this.name]?.[errorMapKey];
            const { newErrorValue, newSource } = utils.determineFieldLevelErrorSourceAndValue({
              formLevelError,
              fieldLevelError
            });
            field.setMeta((prev) => {
              return {
                ...prev,
                errorMap: {
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                  ...prev?.errorMap,
                  [errorMapKey]: newErrorValue
                },
                errorSourceMap: {
                  ...prev.errorSourceMap,
                  [errorMapKey]: newSource
                }
              };
            });
            resolve(newErrorValue);
          })
        );
      };
      for (const validateObj of validates) {
        if (!validateObj.validate) continue;
        validateFieldAsyncFn(this, validateObj, validatesPromises);
      }
      for (const fieldValitateObj of linkedFieldValidates) {
        if (!fieldValitateObj.validate) continue;
        validateFieldAsyncFn(
          fieldValitateObj.field,
          fieldValitateObj,
          linkedPromises
        );
      }
      let results = [];
      if (validatesPromises.length || linkedPromises.length) {
        results = await Promise.all(validatesPromises);
        await Promise.all(linkedPromises);
      }
      if (hasAsyncValidators) {
        this.setMeta((prev) => ({ ...prev, isValidating: false }));
        for (const linkedField of linkedFields) {
          linkedField.setMeta((prev) => ({ ...prev, isValidating: false }));
        }
      }
      return results.filter(Boolean);
    };
    this.validate = (cause, opts2) => {
      if (!this.state.meta.isTouched) return [];
      const { fieldsErrorMap } = opts2?.skipFormValidation ? { fieldsErrorMap: {} } : this.form.validateSync(cause);
      const { hasErrored } = this.validateSync(
        cause,
        fieldsErrorMap[this.name] ?? {}
      );
      if (hasErrored && !this.options.asyncAlways) {
        this.getInfo().validationMetaMap[getErrorMapKey(cause)]?.lastAbortController.abort();
        return this.state.meta.errors;
      }
      const formValidationResultPromise = opts2?.skipFormValidation ? Promise.resolve({}) : this.form.validateAsync(cause);
      return this.validateAsync(cause, formValidationResultPromise);
    };
    this.handleChange = (updater) => {
      this.setValue(updater);
    };
    this.handleBlur = () => {
      const prevTouched = this.state.meta.isTouched;
      if (!prevTouched) {
        this.setMeta((prev) => ({ ...prev, isTouched: true }));
      }
      if (!this.state.meta.isBlurred) {
        this.setMeta((prev) => ({ ...prev, isBlurred: true }));
      }
      this.validate("blur");
      this.triggerOnBlurListener();
    };
    this.setErrorMap = (errorMap) => {
      this.setMeta((prev) => ({
        ...prev,
        errorMap: {
          ...prev.errorMap,
          ...errorMap
        }
      }));
    };
    this.parseValueWithSchema = (schema) => {
      return standardSchemaValidator.standardSchemaValidators.validate(
        { value: this.state.value, validationSource: "field" },
        schema
      );
    };
    this.parseValueWithSchemaAsync = (schema) => {
      return standardSchemaValidator.standardSchemaValidators.validateAsync(
        { value: this.state.value, validationSource: "field" },
        schema
      );
    };
    this.triggerOnChangeListener = () => {
      const formDebounceMs = this.form.options.listeners?.onChangeDebounceMs;
      if (formDebounceMs && formDebounceMs > 0) {
        if (this.timeoutIds.formListeners.change) {
          clearTimeout(this.timeoutIds.formListeners.change);
        }
        this.timeoutIds.formListeners.change = setTimeout(() => {
          this.form.options.listeners?.onChange?.({
            formApi: this.form,
            fieldApi: this
          });
        }, formDebounceMs);
      } else {
        this.form.options.listeners?.onChange?.({
          formApi: this.form,
          fieldApi: this
        });
      }
      const fieldDebounceMs = this.options.listeners?.onChangeDebounceMs;
      if (fieldDebounceMs && fieldDebounceMs > 0) {
        if (this.timeoutIds.listeners.change) {
          clearTimeout(this.timeoutIds.listeners.change);
        }
        this.timeoutIds.listeners.change = setTimeout(() => {
          this.options.listeners?.onChange?.({
            value: this.state.value,
            fieldApi: this
          });
        }, fieldDebounceMs);
      } else {
        this.options.listeners?.onChange?.({
          value: this.state.value,
          fieldApi: this
        });
      }
    };
    this.form = opts.form;
    this.name = opts.name;
    this.options = opts;
    this.timeoutIds = {
      validations: {},
      listeners: {},
      formListeners: {}
    };
    this.store = new store.Derived({
      deps: [this.form.store],
      fn: ({ prevVal: _prevVal }) => {
        const prevVal = _prevVal;
        const meta = this.form.getFieldMeta(this.name) ?? {
          ...metaHelper.defaultFieldMeta,
          ...opts.defaultMeta
        };
        let value = this.form.getFieldValue(this.name);
        if (!meta.isTouched && value === void 0 && this.options.defaultValue !== void 0 && !utils.evaluate(value, this.options.defaultValue)) {
          value = this.options.defaultValue;
        }
        if (prevVal && prevVal.value === value && prevVal.meta === meta) {
          return prevVal;
        }
        return {
          value,
          meta
        };
      }
    });
  }
  /**
   * The current field state.
   */
  get state() {
    return this.store.state;
  }
  /**
   * @private
   */
  runValidator(props) {
    if (standardSchemaValidator.isStandardSchemaValidator(props.validate)) {
      return standardSchemaValidator.standardSchemaValidators[props.type](
        props.value,
        props.validate
      );
    }
    return props.validate(props.value);
  }
  triggerOnBlurListener() {
    const formDebounceMs = this.form.options.listeners?.onBlurDebounceMs;
    if (formDebounceMs && formDebounceMs > 0) {
      if (this.timeoutIds.formListeners.blur) {
        clearTimeout(this.timeoutIds.formListeners.blur);
      }
      this.timeoutIds.formListeners.blur = setTimeout(() => {
        this.form.options.listeners?.onBlur?.({
          formApi: this.form,
          fieldApi: this
        });
      }, formDebounceMs);
    } else {
      this.form.options.listeners?.onBlur?.({
        formApi: this.form,
        fieldApi: this
      });
    }
    const fieldDebounceMs = this.options.listeners?.onBlurDebounceMs;
    if (fieldDebounceMs && fieldDebounceMs > 0) {
      if (this.timeoutIds.listeners.blur) {
        clearTimeout(this.timeoutIds.listeners.blur);
      }
      this.timeoutIds.listeners.blur = setTimeout(() => {
        this.options.listeners?.onBlur?.({
          value: this.state.value,
          fieldApi: this
        });
      }, fieldDebounceMs);
    } else {
      this.options.listeners?.onBlur?.({
        value: this.state.value,
        fieldApi: this
      });
    }
  }
}
function normalizeError(rawError) {
  if (rawError) {
    return rawError;
  }
  return void 0;
}
function getErrorMapKey(cause) {
  switch (cause) {
    case "submit":
      return "onSubmit";
    case "blur":
      return "onBlur";
    case "mount":
      return "onMount";
    case "server":
      return "onServer";
    case "dynamic":
      return "onDynamic";
    case "change":
    default:
      return "onChange";
  }
}
exports.FieldApi = FieldApi;
//# sourceMappingURL=FieldApi.cjs.map
