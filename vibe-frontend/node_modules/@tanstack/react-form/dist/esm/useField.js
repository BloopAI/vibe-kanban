"use client";
import { jsx, Fragment } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { useStore } from "@tanstack/react-store";
import { FieldApi, functionalUpdate } from "@tanstack/form-core";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect.js";
function useField(opts) {
  const [prevOptions, setPrevOptions] = useState(() => ({
    form: opts.form,
    name: opts.name
  }));
  const [fieldApi, setFieldApi] = useState(() => {
    return new FieldApi({
      ...opts
    });
  });
  if (prevOptions.form !== opts.form || prevOptions.name !== opts.name) {
    setFieldApi(
      new FieldApi({
        ...opts
      })
    );
    setPrevOptions({ form: opts.form, name: opts.name });
  }
  const reactiveStateValue = useStore(
    fieldApi.store,
    opts.mode === "array" ? (state) => Object.keys(state.value ?? []).length : (state) => state.value
  );
  const reactiveMetaIsTouched = useStore(
    fieldApi.store,
    (state) => state.meta.isTouched
  );
  const reactiveMetaIsBlurred = useStore(
    fieldApi.store,
    (state) => state.meta.isBlurred
  );
  const reactiveMetaIsDirty = useStore(
    fieldApi.store,
    (state) => state.meta.isDirty
  );
  const reactiveMetaErrorMap = useStore(
    fieldApi.store,
    (state) => state.meta.errorMap
  );
  const reactiveMetaErrorSourceMap = useStore(
    fieldApi.store,
    (state) => state.meta.errorSourceMap
  );
  const reactiveMetaIsValidating = useStore(
    fieldApi.store,
    (state) => state.meta.isValidating
  );
  const extendedFieldApi = useMemo(() => {
    const reactiveFieldApi = {
      ...fieldApi,
      get state() {
        return {
          // For array mode, reactiveStateValue is the length (for reactivity tracking),
          // so we need to get the actual value from fieldApi
          value: opts.mode === "array" ? fieldApi.state.value : reactiveStateValue,
          get meta() {
            return {
              ...fieldApi.state.meta,
              isTouched: reactiveMetaIsTouched,
              isBlurred: reactiveMetaIsBlurred,
              isDirty: reactiveMetaIsDirty,
              errorMap: reactiveMetaErrorMap,
              errorSourceMap: reactiveMetaErrorSourceMap,
              isValidating: reactiveMetaIsValidating
            };
          }
        };
      }
    };
    const extendedApi = reactiveFieldApi;
    extendedApi.Field = Field;
    return extendedApi;
  }, [
    fieldApi,
    opts.mode,
    reactiveStateValue,
    reactiveMetaIsTouched,
    reactiveMetaIsBlurred,
    reactiveMetaIsDirty,
    reactiveMetaErrorMap,
    reactiveMetaErrorSourceMap,
    reactiveMetaIsValidating
  ]);
  useIsomorphicLayoutEffect(fieldApi.mount, [fieldApi]);
  useIsomorphicLayoutEffect(() => {
    fieldApi.update(opts);
  });
  return extendedFieldApi;
}
const Field = (({
  children,
  ...fieldOptions
}) => {
  const fieldApi = useField(fieldOptions);
  const jsxToDisplay = useMemo(
    () => functionalUpdate(children, fieldApi),
    [children, fieldApi]
  );
  return /* @__PURE__ */ jsx(Fragment, { children: jsxToDisplay });
});
export {
  Field,
  useField
};
//# sourceMappingURL=useField.js.map
