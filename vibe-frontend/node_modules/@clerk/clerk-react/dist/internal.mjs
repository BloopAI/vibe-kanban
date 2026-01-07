import {
  MultisessionAppSupport
} from "./chunk-VMBS36YX.mjs";
import {
  errorThrower,
  incompatibleRoutingWithPathProvidedError,
  noPathProvidedError,
  setErrorThrowerOptions,
  useDerivedAuth
} from "./chunk-OT5FTIRN.mjs";
import "./chunk-OANWQR3B.mjs";

// src/hooks/useRoutingProps.ts
function useRoutingProps(componentName, props, routingOptions) {
  const path = props.path || (routingOptions == null ? void 0 : routingOptions.path);
  const routing = props.routing || (routingOptions == null ? void 0 : routingOptions.routing) || "path";
  if (routing === "path") {
    if (!path) {
      return errorThrower.throw(noPathProvidedError(componentName));
    }
    return {
      ...routingOptions,
      ...props,
      routing: "path"
    };
  }
  if (props.path) {
    return errorThrower.throw(incompatibleRoutingWithPathProvidedError(componentName));
  }
  return {
    ...routingOptions,
    ...props,
    path: void 0
  };
}

// src/internal.ts
import {
  clerkJsScriptUrl,
  buildClerkJsScriptAttributes,
  setClerkJsLoadingErrorPackageName
} from "@clerk/shared/loadClerkJsScript";
export {
  MultisessionAppSupport,
  buildClerkJsScriptAttributes,
  clerkJsScriptUrl,
  setClerkJsLoadingErrorPackageName,
  setErrorThrowerOptions,
  useDerivedAuth,
  useRoutingProps
};
//# sourceMappingURL=internal.mjs.map