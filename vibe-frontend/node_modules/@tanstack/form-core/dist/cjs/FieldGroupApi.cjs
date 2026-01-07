"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const store = require("@tanstack/store");
const utils = require("./utils.cjs");
class FieldGroupApi {
  /**
   * Constructs a new `FieldGroupApi` instance with the given form options.
   */
  constructor(opts) {
    this.getFormFieldName = (subfield) => {
      if (typeof this.fieldsMap === "string") {
        return utils.concatenatePaths(this.fieldsMap, subfield);
      }
      const firstAccessor = utils.makePathArray(subfield)[0];
      if (typeof firstAccessor !== "string") {
        return "";
      }
      const restOfPath = subfield.slice(firstAccessor.length);
      const formMappedPath = (
        // TFields is either a string or this. See guard above.
        this.fieldsMap[firstAccessor]
      );
      return utils.concatenatePaths(formMappedPath, restOfPath);
    };
    this.getFormFieldOptions = (props) => {
      const newProps = { ...props };
      const validators = newProps.validators;
      newProps.name = this.getFormFieldName(props.name);
      if (validators && (validators.onChangeListenTo || validators.onBlurListenTo)) {
        const newValidators = { ...validators };
        const remapListenTo = (listenTo) => {
          if (!listenTo) return void 0;
          return listenTo.map(
            (localFieldName) => this.getFormFieldName(localFieldName)
          );
        };
        newValidators.onChangeListenTo = remapListenTo(
          validators.onChangeListenTo
        );
        newValidators.onBlurListenTo = remapListenTo(validators.onBlurListenTo);
        newProps.validators = newValidators;
      }
      return newProps;
    };
    this.mount = () => {
      const cleanup = this.store.mount();
      return cleanup;
    };
    this.validateArrayFieldsStartingFrom = async (field, index, cause) => {
      return this.form.validateArrayFieldsStartingFrom(
        this.getFormFieldName(field),
        index,
        cause
      );
    };
    this.validateField = (field, cause) => {
      return this.form.validateField(this.getFormFieldName(field), cause);
    };
    this.getFieldValue = (field) => {
      return this.form.getFieldValue(this.getFormFieldName(field));
    };
    this.getFieldMeta = (field) => {
      return this.form.getFieldMeta(this.getFormFieldName(field));
    };
    this.setFieldMeta = (field, updater) => {
      return this.form.setFieldMeta(this.getFormFieldName(field), updater);
    };
    this.setFieldValue = (field, updater, opts2) => {
      return this.form.setFieldValue(
        this.getFormFieldName(field),
        updater,
        opts2
      );
    };
    this.deleteField = (field) => {
      return this.form.deleteField(this.getFormFieldName(field));
    };
    this.pushFieldValue = (field, value, opts2) => {
      return this.form.pushFieldValue(
        this.getFormFieldName(field),
        // since unknown doesn't extend an array, it types `value` as never.
        value,
        opts2
      );
    };
    this.insertFieldValue = async (field, index, value, opts2) => {
      return this.form.insertFieldValue(
        this.getFormFieldName(field),
        index,
        // since unknown doesn't extend an array, it types `value` as never.
        value,
        opts2
      );
    };
    this.replaceFieldValue = async (field, index, value, opts2) => {
      return this.form.replaceFieldValue(
        this.getFormFieldName(field),
        index,
        // since unknown doesn't extend an array, it types `value` as never.
        value,
        opts2
      );
    };
    this.removeFieldValue = async (field, index, opts2) => {
      return this.form.removeFieldValue(this.getFormFieldName(field), index, opts2);
    };
    this.swapFieldValues = (field, index1, index2, opts2) => {
      return this.form.swapFieldValues(
        this.getFormFieldName(field),
        index1,
        index2,
        opts2
      );
    };
    this.moveFieldValues = (field, index1, index2, opts2) => {
      return this.form.moveFieldValues(
        this.getFormFieldName(field),
        index1,
        index2,
        opts2
      );
    };
    this.clearFieldValues = (field, opts2) => {
      return this.form.clearFieldValues(this.getFormFieldName(field), opts2);
    };
    this.resetField = (field) => {
      return this.form.resetField(this.getFormFieldName(field));
    };
    this.validateAllFields = (cause) => this.form.validateAllFields(cause);
    if (opts.form instanceof FieldGroupApi) {
      const group = opts.form;
      this.form = group.form;
      if (typeof opts.fields === "string") {
        this.fieldsMap = group.getFormFieldName(opts.fields);
      } else {
        const fields = {
          ...opts.fields
        };
        for (const key in fields) {
          fields[key] = group.getFormFieldName(fields[key]);
        }
        this.fieldsMap = fields;
      }
    } else {
      this.form = opts.form;
      this.fieldsMap = opts.fields;
    }
    this.store = new store.Derived({
      deps: [this.form.store],
      fn: ({ currDepVals }) => {
        const currFormStore = currDepVals[0];
        let values;
        if (typeof this.fieldsMap === "string") {
          values = utils.getBy(currFormStore.values, this.fieldsMap);
        } else {
          values = {};
          const fields = this.fieldsMap;
          for (const key in fields) {
            values[key] = utils.getBy(currFormStore.values, fields[key]);
          }
        }
        return {
          values
        };
      }
    });
  }
  get state() {
    return this.store.state;
  }
  async handleSubmit(submitMeta) {
    return this.form.handleSubmit(submitMeta);
  }
}
exports.FieldGroupApi = FieldGroupApi;
//# sourceMappingURL=FieldGroupApi.cjs.map
