"use client";
"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const jsxRuntime = require("react/jsx-runtime");
const React = require("react");
const reactStore = require("@tanstack/react-store");
const formCore = require("@tanstack/form-core");
const useIsomorphicLayoutEffect = require("./useIsomorphicLayoutEffect.cjs");
function LocalSubscribe({
  lens,
  selector,
  children
}) {
  const data = reactStore.useStore(lens.store, selector);
  return /* @__PURE__ */ jsxRuntime.jsx(jsxRuntime.Fragment, { children: formCore.functionalUpdate(children, data) });
}
function useFieldGroup(opts) {
  const [formLensApi] = React.useState(() => {
    const api = new formCore.FieldGroupApi(opts);
    const form = opts.form instanceof formCore.FieldGroupApi ? opts.form.form : opts.form;
    const extendedApi = api;
    extendedApi.AppForm = function AppForm(appFormProps) {
      return /* @__PURE__ */ jsxRuntime.jsx(form.AppForm, { ...appFormProps });
    };
    extendedApi.AppField = function AppField(props) {
      return /* @__PURE__ */ jsxRuntime.jsx(form.AppField, { ...formLensApi.getFormFieldOptions(props) });
    };
    extendedApi.Field = function Field(props) {
      return /* @__PURE__ */ jsxRuntime.jsx(form.Field, { ...formLensApi.getFormFieldOptions(props) });
    };
    extendedApi.Subscribe = function Subscribe(props) {
      return /* @__PURE__ */ jsxRuntime.jsx(
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
  useIsomorphicLayoutEffect.useIsomorphicLayoutEffect(formLensApi.mount, [formLensApi]);
  return formLensApi;
}
exports.useFieldGroup = useFieldGroup;
//# sourceMappingURL=useFieldGroup.cjs.map
