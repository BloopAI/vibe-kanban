"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/internal.ts
var internal_exports = {};
__export(internal_exports, {
  MultisessionAppSupport: () => MultisessionAppSupport,
  buildClerkJsScriptAttributes: () => import_loadClerkJsScript.buildClerkJsScriptAttributes,
  clerkJsScriptUrl: () => import_loadClerkJsScript.clerkJsScriptUrl,
  setClerkJsLoadingErrorPackageName: () => import_loadClerkJsScript.setClerkJsLoadingErrorPackageName,
  setErrorThrowerOptions: () => setErrorThrowerOptions,
  useDerivedAuth: () => useDerivedAuth,
  useRoutingProps: () => useRoutingProps
});
module.exports = __toCommonJS(internal_exports);

// src/errors/errorThrower.ts
var import_error = require("@clerk/shared/error");
var errorThrower = (0, import_error.buildErrorThrower)({ packageName: "@clerk/clerk-react" });
function setErrorThrowerOptions(options) {
  errorThrower.setMessages(options).setPackageName(options);
}

// src/components/controlComponents.tsx
var import_deprecated = require("@clerk/shared/deprecated");
var import_react11 = __toESM(require("react"));

// src/contexts/IsomorphicClerkContext.tsx
var import_react = require("@clerk/shared/react");
var useIsomorphicClerkContext = import_react.useClerkInstanceContext;

// src/contexts/SessionContext.tsx
var import_react2 = require("@clerk/shared/react");

// src/hooks/useAuth.ts
var import_authorization = require("@clerk/shared/authorization");
var import_telemetry = require("@clerk/shared/telemetry");
var import_react5 = require("react");

// src/contexts/AuthContext.ts
var import_react3 = require("@clerk/shared/react");
var [AuthContext, useAuthContext] = (0, import_react3.createContextAndHook)("AuthContext");

// src/errors/messages.ts
var invalidStateError = "Invalid state. Feel free to submit a bug or reach out to support here: https://clerk.com/support";
var noPathProvidedError = (componentName) => `The <${componentName}/> component uses path-based routing by default unless a different routing strategy is provided using the \`routing\` prop. When path-based routing is used, you need to provide the path where the component is mounted on by using the \`path\` prop. Example: <${componentName} path={'/my-path'} />`;
var incompatibleRoutingWithPathProvidedError = (componentName) => `The \`path\` prop will only be respected when the Clerk component uses path-based routing. To resolve this error, pass \`routing='path'\` to the <${componentName}/> component, or drop the \`path\` prop to switch to hash-based routing. For more details please refer to our docs: https://clerk.com/docs`;

// src/hooks/useAssertWrappedByClerkProvider.ts
var import_react4 = require("@clerk/shared/react");
var useAssertWrappedByClerkProvider = (source) => {
  (0, import_react4.useAssertWrappedByClerkProvider)(() => {
    errorThrower.throwMissingClerkProviderError({ source });
  });
};

// src/hooks/useAuth.ts
function useDerivedAuth(authObject, { treatPendingAsSignedOut = true } = {}) {
  const { userId, orgId, orgRole, has, signOut, getToken, orgPermissions, factorVerificationAge, sessionClaims } = authObject != null ? authObject : {};
  const derivedHas = (0, import_react5.useCallback)(
    (params) => {
      if (has) {
        return has(params);
      }
      return (0, import_authorization.createCheckAuthorization)({
        userId,
        orgId,
        orgRole,
        orgPermissions,
        factorVerificationAge,
        features: (sessionClaims == null ? void 0 : sessionClaims.fea) || "",
        plans: (sessionClaims == null ? void 0 : sessionClaims.pla) || ""
      })(params);
    },
    [has, userId, orgId, orgRole, orgPermissions, factorVerificationAge, sessionClaims]
  );
  const payload = (0, import_authorization.resolveAuthState)({
    authObject: {
      ...authObject,
      getToken,
      signOut,
      has: derivedHas
    },
    options: {
      treatPendingAsSignedOut
    }
  });
  if (!payload) {
    return errorThrower.throw(invalidStateError);
  }
  return payload;
}

// src/hooks/useEmailLink.ts
var import_react6 = __toESM(require("react"));

// src/hooks/useSignIn.ts
var import_react7 = require("@clerk/shared/react");
var import_telemetry2 = require("@clerk/shared/telemetry");

// src/hooks/useSignUp.ts
var import_react8 = require("@clerk/shared/react");
var import_telemetry3 = require("@clerk/shared/telemetry");

// src/hooks/index.ts
var import_react9 = require("@clerk/shared/react");

// src/components/withClerk.tsx
var import_react10 = __toESM(require("react"));
var withClerk = (Component, displayNameOrOptions) => {
  const passedDisplayedName = typeof displayNameOrOptions === "string" ? displayNameOrOptions : displayNameOrOptions == null ? void 0 : displayNameOrOptions.component;
  const displayName = passedDisplayedName || Component.displayName || Component.name || "Component";
  Component.displayName = displayName;
  const options = typeof displayNameOrOptions === "string" ? void 0 : displayNameOrOptions;
  const HOC = (props) => {
    useAssertWrappedByClerkProvider(displayName || "withClerk");
    const clerk = useIsomorphicClerkContext();
    if (!clerk.loaded && !(options == null ? void 0 : options.renderWhileLoading)) {
      return null;
    }
    return /* @__PURE__ */ import_react10.default.createElement(
      Component,
      {
        ...props,
        component: displayName,
        clerk
      }
    );
  };
  HOC.displayName = `withClerk(${displayName})`;
  return HOC;
};

// src/components/controlComponents.tsx
var RedirectToSignIn = withClerk(({ clerk, ...props }) => {
  const { client, session } = clerk;
  const hasSignedInSessions = client.signedInSessions ? client.signedInSessions.length > 0 : (
    // Compat for clerk-js<5.54.0 (which was released with the `signedInSessions` property)
    client.activeSessions && client.activeSessions.length > 0
  );
  import_react11.default.useEffect(() => {
    if (session === null && hasSignedInSessions) {
      void clerk.redirectToAfterSignOut();
    } else {
      void clerk.redirectToSignIn(props);
    }
  }, []);
  return null;
}, "RedirectToSignIn");
var RedirectToSignUp = withClerk(({ clerk, ...props }) => {
  import_react11.default.useEffect(() => {
    void clerk.redirectToSignUp(props);
  }, []);
  return null;
}, "RedirectToSignUp");
var RedirectToTasks = withClerk(({ clerk, ...props }) => {
  import_react11.default.useEffect(() => {
    void clerk.redirectToTasks(props);
  }, []);
  return null;
}, "RedirectToTasks");
var RedirectToUserProfile = withClerk(({ clerk }) => {
  import_react11.default.useEffect(() => {
    (0, import_deprecated.deprecated)("RedirectToUserProfile", "Use the `redirectToUserProfile()` method instead.");
    void clerk.redirectToUserProfile();
  }, []);
  return null;
}, "RedirectToUserProfile");
var RedirectToOrganizationProfile = withClerk(({ clerk }) => {
  import_react11.default.useEffect(() => {
    (0, import_deprecated.deprecated)("RedirectToOrganizationProfile", "Use the `redirectToOrganizationProfile()` method instead.");
    void clerk.redirectToOrganizationProfile();
  }, []);
  return null;
}, "RedirectToOrganizationProfile");
var RedirectToCreateOrganization = withClerk(({ clerk }) => {
  import_react11.default.useEffect(() => {
    (0, import_deprecated.deprecated)("RedirectToCreateOrganization", "Use the `redirectToCreateOrganization()` method instead.");
    void clerk.redirectToCreateOrganization();
  }, []);
  return null;
}, "RedirectToCreateOrganization");
var AuthenticateWithRedirectCallback = withClerk(
  ({ clerk, ...handleRedirectCallbackParams }) => {
    import_react11.default.useEffect(() => {
      void clerk.handleRedirectCallback(handleRedirectCallbackParams);
    }, []);
    return null;
  },
  "AuthenticateWithRedirectCallback"
);
var MultisessionAppSupport = ({ children }) => {
  useAssertWrappedByClerkProvider("MultisessionAppSupport");
  const session = (0, import_react2.useSessionContext)();
  return /* @__PURE__ */ import_react11.default.createElement(import_react11.default.Fragment, { key: session ? session.id : "no-users" }, children);
};

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
var import_loadClerkJsScript = require("@clerk/shared/loadClerkJsScript");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MultisessionAppSupport,
  buildClerkJsScriptAttributes,
  clerkJsScriptUrl,
  setClerkJsLoadingErrorPackageName,
  setErrorThrowerOptions,
  useDerivedAuth,
  useRoutingProps
});
//# sourceMappingURL=internal.js.map