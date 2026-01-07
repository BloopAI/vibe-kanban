"use client";
import { jsx, Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useStore } from "@tanstack/react-store";
import { FieldGroupApi, functionalUpdate } from "@tanstack/form-core";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect.js";
function LocalSubscribe({
  lens,
  selector,
  children
}) {
  const data = useStore(lens.store, selector);
  return /* @__PURE__ */ jsx(Fragment, { children: functionalUpdate(children, data) });
}
function useFieldGroup(opts) {
  const [formLensApi] = useState(() => {
    const api = new FieldGroupApi(opts);
    const form = opts.form instanceof FieldGroupApi ? opts.form.form : opts.form;
    const extendedApi = api;
    extendedApi.AppForm = function AppForm(appFormProps) {
      return /* @__PURE__ */ jsx(form.AppForm, { ...appFormProps });
    };
    extendedApi.AppField = function AppField(props) {
      return /* @__PURE__ */ jsx(form.AppField, { ...formLensApi.getFormFieldOptions(props) });
    };
    extendedApi.Field = function Field(props) {
      return /* @__PURE__ */ jsx(form.Field, { ...formLensApi.getFormFieldOptions(props) });
    };
    extendedApi.Subscribe = function Subscribe(props) {
      return /* @__PURE__ */ jsx(
        LocalSubscribe,
        {
          lens: formLensApi,
          selector: props.selector,
          children: props.children
        }
      );
    };
    return Object.assign(extendedApi, {
      ...opts.formComponents
    });
  });
  useIsomorphicLayoutEffect(formLensApi.mount, [formLensApi]);
  return formLensApi;
}
export {
  useFieldGroup
};
//# sourceMappingURL=useFieldGroup.js.map
