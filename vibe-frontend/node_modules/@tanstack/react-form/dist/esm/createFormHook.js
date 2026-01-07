"use client";
import { jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo } from "react";
import { useForm } from "./useForm.js";
import { useFieldGroup } from "./useFieldGroup.js";
const fieldContext = createContext(null);
const formContext = createContext(null);
function createFormHookContexts() {
  function useFieldContext() {
    const field = useContext(fieldContext);
    if (!field) {
      throw new Error(
        "`fieldContext` only works when within a `fieldComponent` passed to `createFormHook`"
      );
    }
    return field;
  }
  function useFormContext() {
    const form = useContext(formContext);
    if (!form) {
      throw new Error(
        "`formContext` only works when within a `formComponent` passed to `createFormHook`"
      );
    }
    return form;
  }
  return { fieldContext, useFieldContext, useFormContext, formContext };
}
function createFormHook({
  fieldComponents,
  fieldContext: fieldContext2,
  formContext: formContext2,
  formComponents
}) {
  function useAppForm(props) {
    const form = useForm(props);
    const AppForm = useMemo(() => {
      return ({ children }) => {
        return /* @__PURE__ */ jsx(formContext2.Provider, { value: form, children });
      };
    }, [form]);
    const AppField = useMemo(() => {
      const AppField2 = (({ children, ...props2 }) => {
        return /* @__PURE__ */ jsx(form.Field, { ...props2, children: (field) => (
          // eslint-disable-next-line @eslint-react/no-context-provider
          /* @__PURE__ */ jsx(fieldContext2.Provider, { value: field, children: children(Object.assign(field, fieldComponents)) })
        ) });
      });
      return AppField2;
    }, [form]);
    const extendedForm = useMemo(() => {
      return Object.assign(form, {
        AppField,
        AppForm,
        ...formComponents
      });
    }, [form, AppField, AppForm]);
    return extendedForm;
  }
  function withForm({
    render,
    props
  }) {
    return (innerProps) => render({ ...props, ...innerProps });
  }
  function withFieldGroup({
    render,
    props,
    defaultValues
  }) {
    return function Render(innerProps) {
      const fieldGroupProps = useMemo(() => {
        return {
          form: innerProps.form,
          fields: innerProps.fields,
          defaultValues,
          formComponents
        };
      }, [innerProps.form, innerProps.fields]);
      const fieldGroupApi = useFieldGroup(fieldGroupProps);
      return render({ ...props, ...innerProps, group: fieldGroupApi });
    };
  }
  return {
    useAppForm,
    withForm,
    withFieldGroup
  };
}
export {
  createFormHook,
  createFormHookContexts
};
//# sourceMappingURL=createFormHook.js.map
