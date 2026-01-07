"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
function prefixSchemaToErrors(issues, formValue) {
  const schema = /* @__PURE__ */ new Map();
  for (const issue of issues) {
    const issuePath = issue.path ?? [];
    let currentFormValue = formValue;
    let path = "";
    for (let i = 0; i < issuePath.length; i++) {
      const pathSegment = issuePath[i];
      if (pathSegment === void 0) continue;
      const segment = typeof pathSegment === "object" ? pathSegment.key : pathSegment;
      const segmentAsNumber = Number(segment);
      if (Array.isArray(currentFormValue) && !Number.isNaN(segmentAsNumber)) {
        path += `[${segmentAsNumber}]`;
      } else {
        path += (i > 0 ? "." : "") + String(segment);
      }
      if (typeof currentFormValue === "object" && currentFormValue !== null) {
        currentFormValue = currentFormValue[segment];
      } else {
        currentFormValue = void 0;
      }
    }
    schema.set(path, (schema.get(path) ?? []).concat(issue));
  }
  return Object.fromEntries(schema);
}
const transformFormIssues = (issues, formValue) => {
  const schemaErrors = prefixSchemaToErrors(issues, formValue);
  return {
    form: schemaErrors,
    fields: schemaErrors
  };
};
const standardSchemaValidators = {
  validate({
    value,
    validationSource
  }, schema) {
    const result = schema["~standard"].validate(value);
    if (result instanceof Promise) {
      throw new Error("async function passed to sync validator");
    }
    if (!result.issues) return;
    if (validationSource === "field")
      return result.issues;
    return transformFormIssues(result.issues, value);
  },
  async validateAsync({
    value,
    validationSource
  }, schema) {
    const result = await schema["~standard"].validate(value);
    if (!result.issues) return;
    if (validationSource === "field")
      return result.issues;
    return transformFormIssues(result.issues, value);
  }
};
const isStandardSchemaValidator = (validator) => !!validator && "~standard" in validator;
exports.isStandardSchemaValidator = isStandardSchemaValidator;
exports.standardSchemaValidators = standardSchemaValidators;
//# sourceMappingURL=standardSchemaValidator.cjs.map
