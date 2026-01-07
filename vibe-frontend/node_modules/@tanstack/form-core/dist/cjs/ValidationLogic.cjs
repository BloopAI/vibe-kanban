"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const revalidateLogic = ({
  mode = "submit",
  modeAfterSubmission = "change"
} = {}) => (props) => {
  const validatorNames = Object.keys(props.validators ?? {});
  if (validatorNames.length === 0) {
    return props.runValidation({
      validators: [],
      form: props.form
    });
  }
  const dynamicValidator = {
    fn: props.event.async ? props.validators["onDynamicAsync"] : props.validators["onDynamic"],
    cause: "dynamic"
  };
  const validatorsToAdd = [];
  const modeToWatch = props.form.state.submissionAttempts === 0 ? mode : modeAfterSubmission;
  if ([modeToWatch, "submit"].includes(props.event.type)) {
    validatorsToAdd.push(dynamicValidator);
  }
  let defaultValidators = [];
  defaultValidationLogic({
    ...props,
    runValidation: (vProps) => {
      defaultValidators = vProps.validators;
    }
  });
  if (validatorsToAdd.length === 0) {
    return props.runValidation({
      validators: defaultValidators,
      form: props.form
    });
  }
  return props.runValidation({
    validators: [...defaultValidators, ...validatorsToAdd],
    form: props.form
  });
};
const defaultValidationLogic = (props) => {
  if (!props.validators) {
    return props.runValidation({
      validators: [],
      form: props.form
    });
  }
  const isAsync = props.event.async;
  const onMountValidator = isAsync ? void 0 : { fn: props.validators.onMount, cause: "mount" };
  const onChangeValidator = {
    fn: isAsync ? props.validators.onChangeAsync : props.validators.onChange,
    cause: "change"
  };
  const onBlurValidator = {
    fn: isAsync ? props.validators.onBlurAsync : props.validators.onBlur,
    cause: "blur"
  };
  const onSubmitValidator = {
    fn: isAsync ? props.validators.onSubmitAsync : props.validators.onSubmit,
    cause: "submit"
  };
  const onServerValidator = isAsync ? void 0 : { fn: () => void 0, cause: "server" };
  switch (props.event.type) {
    case "mount": {
      return props.runValidation({
        validators: [onMountValidator],
        form: props.form
      });
    }
    case "submit": {
      return props.runValidation({
        validators: [
          onChangeValidator,
          onBlurValidator,
          onSubmitValidator,
          onServerValidator
        ],
        form: props.form
      });
    }
    case "server": {
      return props.runValidation({
        validators: [],
        form: props.form
      });
    }
    case "blur": {
      return props.runValidation({
        validators: [onBlurValidator, onServerValidator],
        form: props.form
      });
    }
    case "change": {
      return props.runValidation({
        validators: [onChangeValidator, onServerValidator],
        form: props.form
      });
    }
    default: {
      throw new Error(`Unknown validation event type: ${props.event.type}`);
    }
  }
};
exports.defaultValidationLogic = defaultValidationLogic;
exports.revalidateLogic = revalidateLogic;
//# sourceMappingURL=ValidationLogic.cjs.map
