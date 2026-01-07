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

// src/experimental.ts
var experimental_exports = {};
__export(experimental_exports, {
  CheckoutButton: () => CheckoutButton,
  CheckoutProvider: () => import_react24.__experimental_CheckoutProvider,
  PaymentElement: () => import_react24.__experimental_PaymentElement,
  PaymentElementProvider: () => import_react24.__experimental_PaymentElementProvider,
  PlanDetailsButton: () => PlanDetailsButton,
  SubscriptionDetailsButton: () => SubscriptionDetailsButton,
  useAPIKeys: () => import_react24.__experimental_useAPIKeys,
  useCheckout: () => import_react24.__experimental_useCheckout,
  usePaymentAttempts: () => import_react24.__experimental_usePaymentAttempts,
  usePaymentElement: () => import_react24.__experimental_usePaymentElement,
  usePaymentMethods: () => import_react24.__experimental_usePaymentMethods,
  usePlans: () => import_react24.__experimental_usePlans,
  useSignInSignal: () => useSignInSignal,
  useSignUpSignal: () => useSignUpSignal,
  useStatements: () => import_react24.__experimental_useStatements,
  useSubscription: () => import_react24.__experimental_useSubscription
});
module.exports = __toCommonJS(experimental_exports);

// src/components/CheckoutButton.tsx
var import_react20 = __toESM(require("react"));

// src/hooks/useAuth.ts
var import_authorization = require("@clerk/shared/authorization");
var import_telemetry = require("@clerk/shared/telemetry");
var import_react4 = require("react");

// src/contexts/AuthContext.ts
var import_react = require("@clerk/shared/react");
var [AuthContext, useAuthContext] = (0, import_react.createContextAndHook)("AuthContext");

// src/contexts/IsomorphicClerkContext.tsx
var import_react2 = require("@clerk/shared/react");
var useIsomorphicClerkContext = import_react2.useClerkInstanceContext;

// src/errors/errorThrower.ts
var import_error = require("@clerk/shared/error");
var errorThrower = (0, import_error.buildErrorThrower)({ packageName: "@clerk/clerk-react" });

// src/errors/messages.ts
var multipleChildrenInButtonComponent = (name) => `You've passed multiple children components to <${name}/>. You can only pass a single child component or text.`;
var invalidStateError = "Invalid state. Feel free to submit a bug or reach out to support here: https://clerk.com/support";
var userProfilePageRenderedError = "<UserProfile.Page /> component needs to be a direct child of `<UserProfile />` or `<UserButton />`.";
var userProfileLinkRenderedError = "<UserProfile.Link /> component needs to be a direct child of `<UserProfile />` or `<UserButton />`.";
var organizationProfilePageRenderedError = "<OrganizationProfile.Page /> component needs to be a direct child of `<OrganizationProfile />` or `<OrganizationSwitcher />`.";
var organizationProfileLinkRenderedError = "<OrganizationProfile.Link /> component needs to be a direct child of `<OrganizationProfile />` or `<OrganizationSwitcher />`.";
var customPagesIgnoredComponent = (componentName) => `<${componentName} /> can only accept <${componentName}.Page /> and <${componentName}.Link /> as its children. Any other provided component will be ignored. Additionally, please ensure that the component is rendered in a client component.`;
var customPageWrongProps = (componentName) => `Missing props. <${componentName}.Page /> component requires the following props: url, label, labelIcon, alongside with children to be rendered inside the page.`;
var customLinkWrongProps = (componentName) => `Missing props. <${componentName}.Link /> component requires the following props: url, label and labelIcon.`;
var userButtonIgnoredComponent = `<UserButton /> can only accept <UserButton.UserProfilePage />, <UserButton.UserProfileLink /> and <UserButton.MenuItems /> as its children. Any other provided component will be ignored. Additionally, please ensure that the component is rendered in a client component.`;
var customMenuItemsIgnoredComponent = "<UserButton.MenuItems /> component can only accept <UserButton.Action /> and <UserButton.Link /> as its children. Any other provided component will be ignored. Additionally, please ensure that the component is rendered in a client component.";
var userButtonMenuItemsRenderedError = "<UserButton.MenuItems /> component needs to be a direct child of `<UserButton />`.";
var userButtonMenuActionRenderedError = "<UserButton.Action /> component needs to be a direct child of `<UserButton.MenuItems />`.";
var userButtonMenuLinkRenderedError = "<UserButton.Link /> component needs to be a direct child of `<UserButton.MenuItems />`.";
var userButtonMenuItemLinkWrongProps = "Missing props. <UserButton.Link /> component requires the following props: href, label and labelIcon.";
var userButtonMenuItemsActionWrongsProps = "Missing props. <UserButton.Action /> component requires the following props: label.";

// src/hooks/useAssertWrappedByClerkProvider.ts
var import_react3 = require("@clerk/shared/react");
var useAssertWrappedByClerkProvider = (source) => {
  (0, import_react3.useAssertWrappedByClerkProvider)(() => {
    errorThrower.throwMissingClerkProviderError({ source });
  });
};

// src/hooks/utils.ts
var clerkLoaded = (isomorphicClerk) => {
  return new Promise((resolve) => {
    const handler = (status) => {
      if (["ready", "degraded"].includes(status)) {
        resolve();
        isomorphicClerk.off("status", handler);
      }
    };
    isomorphicClerk.on("status", handler, { notify: true });
  });
};
var createGetToken = (isomorphicClerk) => {
  return async (options) => {
    await clerkLoaded(isomorphicClerk);
    if (!isomorphicClerk.session) {
      return null;
    }
    return isomorphicClerk.session.getToken(options);
  };
};
var createSignOut = (isomorphicClerk) => {
  return async (...args) => {
    await clerkLoaded(isomorphicClerk);
    return isomorphicClerk.signOut(...args);
  };
};

// src/hooks/useAuth.ts
var useAuth = (initialAuthStateOrOptions = {}) => {
  var _a;
  useAssertWrappedByClerkProvider("useAuth");
  const { treatPendingAsSignedOut, ...rest } = initialAuthStateOrOptions != null ? initialAuthStateOrOptions : {};
  const initialAuthState = rest;
  const authContextFromHook = useAuthContext();
  let authContext = authContextFromHook;
  if (authContext.sessionId === void 0 && authContext.userId === void 0) {
    authContext = initialAuthState != null ? initialAuthState : {};
  }
  const isomorphicClerk = useIsomorphicClerkContext();
  const getToken = (0, import_react4.useCallback)(createGetToken(isomorphicClerk), [isomorphicClerk]);
  const signOut = (0, import_react4.useCallback)(createSignOut(isomorphicClerk), [isomorphicClerk]);
  (_a = isomorphicClerk.telemetry) == null ? void 0 : _a.record((0, import_telemetry.eventMethodCalled)("useAuth", { treatPendingAsSignedOut }));
  return useDerivedAuth(
    {
      ...authContext,
      getToken,
      signOut
    },
    {
      treatPendingAsSignedOut
    }
  );
};
function useDerivedAuth(authObject, { treatPendingAsSignedOut = true } = {}) {
  const { userId, orgId, orgRole, has, signOut, getToken, orgPermissions, factorVerificationAge, sessionClaims } = authObject != null ? authObject : {};
  const derivedHas = (0, import_react4.useCallback)(
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
var import_react5 = __toESM(require("react"));

// src/hooks/useSignIn.ts
var import_react6 = require("@clerk/shared/react");
var import_telemetry2 = require("@clerk/shared/telemetry");

// src/hooks/useSignUp.ts
var import_react7 = require("@clerk/shared/react");
var import_telemetry3 = require("@clerk/shared/telemetry");

// src/hooks/index.ts
var import_react8 = require("@clerk/shared/react");

// src/utils/childrenUtils.tsx
var import_react9 = __toESM(require("react"));
var assertSingleChild = (children) => (name) => {
  try {
    return import_react9.default.Children.only(children);
  } catch {
    return errorThrower.throw(multipleChildrenInButtonComponent(name));
  }
};
var normalizeWithDefaultValue = (children, defaultText) => {
  if (!children) {
    children = defaultText;
  }
  if (typeof children === "string") {
    children = /* @__PURE__ */ import_react9.default.createElement("button", null, children);
  }
  return children;
};
var safeExecute = (cb) => (...args) => {
  if (cb && typeof cb === "function") {
    return cb(...args);
  }
};

// src/utils/useMaxAllowedInstancesGuard.tsx
var import_react10 = __toESM(require("react"));

// src/utils/useCustomElementPortal.tsx
var import_react11 = require("react");
var import_react_dom = require("react-dom");
var useCustomElementPortal = (elements) => {
  const [nodeMap, setNodeMap] = (0, import_react11.useState)(/* @__PURE__ */ new Map());
  return elements.map((el) => ({
    id: el.id,
    mount: (node) => setNodeMap((prev) => new Map(prev).set(String(el.id), node)),
    unmount: () => setNodeMap((prev) => {
      const newMap = new Map(prev);
      newMap.set(String(el.id), null);
      return newMap;
    }),
    portal: () => {
      const node = nodeMap.get(String(el.id));
      return node ? (0, import_react_dom.createPortal)(el.component, node) : null;
    }
  }));
};

// src/utils/useCustomPages.tsx
var import_utils4 = require("@clerk/shared/utils");
var import_react18 = __toESM(require("react"));

// src/components/uiComponents.tsx
var import_utils2 = require("@clerk/shared/utils");
var import_react16 = __toESM(require("react"));

// src/utils/useWaitForComponentMount.ts
var import_react12 = require("react");
var createAwaitableMutationObserver = (globalOptions) => {
  const isReady = globalOptions == null ? void 0 : globalOptions.isReady;
  return (options) => new Promise((resolve, reject) => {
    const { root = document == null ? void 0 : document.body, selector, timeout = 0 } = options;
    if (!root) {
      reject(new Error("No root element provided"));
      return;
    }
    let elementToWatch = root;
    if (selector) {
      elementToWatch = root == null ? void 0 : root.querySelector(selector);
    }
    if (isReady(elementToWatch, selector)) {
      resolve();
      return;
    }
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (!elementToWatch && selector) {
          elementToWatch = root == null ? void 0 : root.querySelector(selector);
        }
        if (globalOptions.childList && mutation.type === "childList" || globalOptions.attributes && mutation.type === "attributes") {
          if (isReady(elementToWatch, selector)) {
            observer.disconnect();
            resolve();
            return;
          }
        }
      }
    });
    observer.observe(root, globalOptions);
    if (timeout > 0) {
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for ${selector}`));
      }, timeout);
    }
  });
};
var waitForElementChildren = createAwaitableMutationObserver({
  childList: true,
  subtree: true,
  isReady: (el, selector) => {
    var _a;
    return !!(el == null ? void 0 : el.childElementCount) && ((_a = el == null ? void 0 : el.matches) == null ? void 0 : _a.call(el, selector)) && el.childElementCount > 0;
  }
});
function useWaitForComponentMount(component, options) {
  const watcherRef = (0, import_react12.useRef)();
  const [status, setStatus] = (0, import_react12.useState)("rendering");
  (0, import_react12.useEffect)(() => {
    if (!component) {
      throw new Error("Clerk: no component name provided, unable to detect mount.");
    }
    if (typeof window !== "undefined" && !watcherRef.current) {
      const defaultSelector = `[data-clerk-component="${component}"]`;
      const selector = options == null ? void 0 : options.selector;
      watcherRef.current = waitForElementChildren({
        selector: selector ? (
          // Allows for `[data-clerk-component="xxxx"][data-some-attribute="123"] .my-class`
          defaultSelector + selector
        ) : defaultSelector
      }).then(() => {
        setStatus("rendered");
      }).catch(() => {
        setStatus("error");
      });
    }
  }, [component, options == null ? void 0 : options.selector]);
  return status;
}

// src/components/ClerkHostRenderer.tsx
var import_object = require("@clerk/shared/object");
var import_react13 = require("@clerk/shared/react");
var import_react14 = __toESM(require("react"));
var isMountProps = (props) => {
  return "mount" in props;
};
var isOpenProps = (props) => {
  return "open" in props;
};
var stripMenuItemIconHandlers = (menuItems) => {
  return menuItems == null ? void 0 : menuItems.map(({ mountIcon, unmountIcon, ...rest }) => rest);
};
var ClerkHostRenderer = class extends import_react14.default.PureComponent {
  constructor() {
    super(...arguments);
    this.rootRef = import_react14.default.createRef();
  }
  componentDidUpdate(_prevProps) {
    var _a, _b, _c, _d;
    if (!isMountProps(_prevProps) || !isMountProps(this.props)) {
      return;
    }
    const prevProps = (0, import_object.without)(_prevProps.props, "customPages", "customMenuItems", "children");
    const newProps = (0, import_object.without)(this.props.props, "customPages", "customMenuItems", "children");
    const customPagesChanged = ((_a = prevProps.customPages) == null ? void 0 : _a.length) !== ((_b = newProps.customPages) == null ? void 0 : _b.length);
    const customMenuItemsChanged = ((_c = prevProps.customMenuItems) == null ? void 0 : _c.length) !== ((_d = newProps.customMenuItems) == null ? void 0 : _d.length);
    const prevMenuItemsWithoutHandlers = stripMenuItemIconHandlers(_prevProps.props.customMenuItems);
    const newMenuItemsWithoutHandlers = stripMenuItemIconHandlers(this.props.props.customMenuItems);
    if (!(0, import_react13.isDeeplyEqual)(prevProps, newProps) || !(0, import_react13.isDeeplyEqual)(prevMenuItemsWithoutHandlers, newMenuItemsWithoutHandlers) || customPagesChanged || customMenuItemsChanged) {
      if (this.rootRef.current) {
        this.props.updateProps({ node: this.rootRef.current, props: this.props.props });
      }
    }
  }
  componentDidMount() {
    if (this.rootRef.current) {
      if (isMountProps(this.props)) {
        this.props.mount(this.rootRef.current, this.props.props);
      }
      if (isOpenProps(this.props)) {
        this.props.open(this.props.props);
      }
    }
  }
  componentWillUnmount() {
    if (this.rootRef.current) {
      if (isMountProps(this.props)) {
        this.props.unmount(this.rootRef.current);
      }
      if (isOpenProps(this.props)) {
        this.props.close();
      }
    }
  }
  render() {
    const { hideRootHtmlElement = false } = this.props;
    const rootAttributes = {
      ref: this.rootRef,
      ...this.props.rootProps,
      ...this.props.component && { "data-clerk-component": this.props.component }
    };
    return /* @__PURE__ */ import_react14.default.createElement(import_react14.default.Fragment, null, !hideRootHtmlElement && /* @__PURE__ */ import_react14.default.createElement("div", { ...rootAttributes }), this.props.children);
  }
};

// src/components/withClerk.tsx
var import_react15 = __toESM(require("react"));
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
    return /* @__PURE__ */ import_react15.default.createElement(
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

// src/components/uiComponents.tsx
var CustomPortalsRenderer = (props) => {
  var _a, _b;
  return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, (_a = props == null ? void 0 : props.customPagesPortals) == null ? void 0 : _a.map((portal, index) => (0, import_react16.createElement)(portal, { key: index })), (_b = props == null ? void 0 : props.customMenuItemsPortals) == null ? void 0 : _b.map((portal, index) => (0, import_react16.createElement)(portal, { key: index })));
};
var SignIn = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountSignIn,
        unmount: clerk.unmountSignIn,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "SignIn", renderWhileLoading: true }
);
var SignUp = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountSignUp,
        unmount: clerk.unmountSignUp,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "SignUp", renderWhileLoading: true }
);
function UserProfilePage({ children }) {
  (0, import_utils2.logErrorInDevMode)(userProfilePageRenderedError);
  return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, children);
}
function UserProfileLink({ children }) {
  (0, import_utils2.logErrorInDevMode)(userProfileLinkRenderedError);
  return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, children);
}
var _UserProfile = withClerk(
  ({
    clerk,
    component,
    fallback,
    ...props
  }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    const { customPages, customPagesPortals } = useUserProfileCustomPages(props.children);
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountUserProfile,
        unmount: clerk.unmountUserProfile,
        updateProps: clerk.__unstable__updateProps,
        props: { ...props, customPages },
        rootProps: rendererRootProps
      },
      /* @__PURE__ */ import_react16.default.createElement(CustomPortalsRenderer, { customPagesPortals })
    ));
  },
  { component: "UserProfile", renderWhileLoading: true }
);
var UserProfile = Object.assign(_UserProfile, {
  Page: UserProfilePage,
  Link: UserProfileLink
});
var UserButtonContext = (0, import_react16.createContext)({
  mount: () => {
  },
  unmount: () => {
  },
  updateProps: () => {
  }
});
var _UserButton = withClerk(
  ({
    clerk,
    component,
    fallback,
    ...props
  }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    const { customPages, customPagesPortals } = useUserProfileCustomPages(props.children, {
      allowForAnyChildren: !!props.__experimental_asProvider
    });
    const userProfileProps = { ...props.userProfileProps, customPages };
    const { customMenuItems, customMenuItemsPortals } = useUserButtonCustomMenuItems(props.children, {
      allowForAnyChildren: !!props.__experimental_asProvider
    });
    const sanitizedChildren = useSanitizedChildren(props.children);
    const passableProps = {
      mount: clerk.mountUserButton,
      unmount: clerk.unmountUserButton,
      updateProps: clerk.__unstable__updateProps,
      props: { ...props, userProfileProps, customMenuItems }
    };
    const portalProps = {
      customPagesPortals,
      customMenuItemsPortals
    };
    return /* @__PURE__ */ import_react16.default.createElement(UserButtonContext.Provider, { value: passableProps }, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        ...passableProps,
        hideRootHtmlElement: !!props.__experimental_asProvider,
        rootProps: rendererRootProps
      },
      props.__experimental_asProvider ? sanitizedChildren : null,
      /* @__PURE__ */ import_react16.default.createElement(CustomPortalsRenderer, { ...portalProps })
    ));
  },
  { component: "UserButton", renderWhileLoading: true }
);
function MenuItems({ children }) {
  (0, import_utils2.logErrorInDevMode)(userButtonMenuItemsRenderedError);
  return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, children);
}
function MenuAction({ children }) {
  (0, import_utils2.logErrorInDevMode)(userButtonMenuActionRenderedError);
  return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, children);
}
function MenuLink({ children }) {
  (0, import_utils2.logErrorInDevMode)(userButtonMenuLinkRenderedError);
  return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, children);
}
function UserButtonOutlet(outletProps) {
  const providerProps = (0, import_react16.useContext)(UserButtonContext);
  const portalProps = {
    ...providerProps,
    props: {
      ...providerProps.props,
      ...outletProps
    }
  };
  return /* @__PURE__ */ import_react16.default.createElement(ClerkHostRenderer, { ...portalProps });
}
var UserButton = Object.assign(_UserButton, {
  UserProfilePage,
  UserProfileLink,
  MenuItems,
  Action: MenuAction,
  Link: MenuLink,
  __experimental_Outlet: UserButtonOutlet
});
function OrganizationProfilePage({ children }) {
  (0, import_utils2.logErrorInDevMode)(organizationProfilePageRenderedError);
  return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, children);
}
function OrganizationProfileLink({ children }) {
  (0, import_utils2.logErrorInDevMode)(organizationProfileLinkRenderedError);
  return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, children);
}
var _OrganizationProfile = withClerk(
  ({
    clerk,
    component,
    fallback,
    ...props
  }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    const { customPages, customPagesPortals } = useOrganizationProfileCustomPages(props.children);
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountOrganizationProfile,
        unmount: clerk.unmountOrganizationProfile,
        updateProps: clerk.__unstable__updateProps,
        props: { ...props, customPages },
        rootProps: rendererRootProps
      },
      /* @__PURE__ */ import_react16.default.createElement(CustomPortalsRenderer, { customPagesPortals })
    ));
  },
  { component: "OrganizationProfile", renderWhileLoading: true }
);
var OrganizationProfile = Object.assign(_OrganizationProfile, {
  Page: OrganizationProfilePage,
  Link: OrganizationProfileLink
});
var CreateOrganization = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountCreateOrganization,
        unmount: clerk.unmountCreateOrganization,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "CreateOrganization", renderWhileLoading: true }
);
var OrganizationSwitcherContext = (0, import_react16.createContext)({
  mount: () => {
  },
  unmount: () => {
  },
  updateProps: () => {
  }
});
var _OrganizationSwitcher = withClerk(
  ({
    clerk,
    component,
    fallback,
    ...props
  }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    const { customPages, customPagesPortals } = useOrganizationProfileCustomPages(props.children, {
      allowForAnyChildren: !!props.__experimental_asProvider
    });
    const organizationProfileProps = { ...props.organizationProfileProps, customPages };
    const sanitizedChildren = useSanitizedChildren(props.children);
    const passableProps = {
      mount: clerk.mountOrganizationSwitcher,
      unmount: clerk.unmountOrganizationSwitcher,
      updateProps: clerk.__unstable__updateProps,
      props: { ...props, organizationProfileProps },
      rootProps: rendererRootProps,
      component
    };
    clerk.__experimental_prefetchOrganizationSwitcher();
    return /* @__PURE__ */ import_react16.default.createElement(OrganizationSwitcherContext.Provider, { value: passableProps }, /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        ...passableProps,
        hideRootHtmlElement: !!props.__experimental_asProvider
      },
      props.__experimental_asProvider ? sanitizedChildren : null,
      /* @__PURE__ */ import_react16.default.createElement(CustomPortalsRenderer, { customPagesPortals })
    )));
  },
  { component: "OrganizationSwitcher", renderWhileLoading: true }
);
function OrganizationSwitcherOutlet(outletProps) {
  const providerProps = (0, import_react16.useContext)(OrganizationSwitcherContext);
  const portalProps = {
    ...providerProps,
    props: {
      ...providerProps.props,
      ...outletProps
    }
  };
  return /* @__PURE__ */ import_react16.default.createElement(ClerkHostRenderer, { ...portalProps });
}
var OrganizationSwitcher = Object.assign(_OrganizationSwitcher, {
  OrganizationProfilePage,
  OrganizationProfileLink,
  __experimental_Outlet: OrganizationSwitcherOutlet
});
var OrganizationList = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountOrganizationList,
        unmount: clerk.unmountOrganizationList,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "OrganizationList", renderWhileLoading: true }
);
var GoogleOneTap = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        open: clerk.openGoogleOneTap,
        close: clerk.closeGoogleOneTap,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "GoogleOneTap", renderWhileLoading: true }
);
var Waitlist = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountWaitlist,
        unmount: clerk.unmountWaitlist,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "Waitlist", renderWhileLoading: true }
);
var PricingTable = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component, {
      // This attribute is added to the PricingTable root element after we've successfully fetched the plans asynchronously.
      selector: '[data-component-status="ready"]'
    });
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountPricingTable,
        unmount: clerk.unmountPricingTable,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "PricingTable", renderWhileLoading: true }
);
var APIKeys = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountAPIKeys,
        unmount: clerk.unmountAPIKeys,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "ApiKeys", renderWhileLoading: true }
);
var UserAvatar = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountUserAvatar,
        unmount: clerk.unmountUserAvatar,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "UserAvatar", renderWhileLoading: true }
);
var TaskChooseOrganization = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountTaskChooseOrganization,
        unmount: clerk.unmountTaskChooseOrganization,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "TaskChooseOrganization", renderWhileLoading: true }
);
var TaskResetPassword = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ import_react16.default.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountTaskResetPassword,
        unmount: clerk.unmountTaskResetPassword,
        updateProps: clerk.__unstable__updateProps,
        props,
        rootProps: rendererRootProps
      }
    ));
  },
  { component: "TaskResetPassword", renderWhileLoading: true }
);

// src/utils/componentValidation.ts
var import_react17 = __toESM(require("react"));
var isThatComponent = (v, component) => {
  return !!v && import_react17.default.isValidElement(v) && (v == null ? void 0 : v.type) === component;
};

// src/utils/useCustomPages.tsx
var useUserProfileCustomPages = (children, options) => {
  const reorderItemsLabels = ["account", "security", "billing", "apiKeys"];
  return useCustomPages(
    {
      children,
      reorderItemsLabels,
      LinkComponent: UserProfileLink,
      PageComponent: UserProfilePage,
      MenuItemsComponent: MenuItems,
      componentName: "UserProfile"
    },
    options
  );
};
var useOrganizationProfileCustomPages = (children, options) => {
  const reorderItemsLabels = ["general", "members", "billing", "apiKeys"];
  return useCustomPages(
    {
      children,
      reorderItemsLabels,
      LinkComponent: OrganizationProfileLink,
      PageComponent: OrganizationProfilePage,
      componentName: "OrganizationProfile"
    },
    options
  );
};
var useSanitizedChildren = (children) => {
  const sanitizedChildren = [];
  const excludedComponents = [
    OrganizationProfileLink,
    OrganizationProfilePage,
    MenuItems,
    UserProfilePage,
    UserProfileLink
  ];
  import_react18.default.Children.forEach(children, (child) => {
    if (!excludedComponents.some((component) => isThatComponent(child, component))) {
      sanitizedChildren.push(child);
    }
  });
  return sanitizedChildren;
};
var useCustomPages = (params, options) => {
  const { children, LinkComponent, PageComponent, MenuItemsComponent, reorderItemsLabels, componentName } = params;
  const { allowForAnyChildren = false } = options || {};
  const validChildren = [];
  import_react18.default.Children.forEach(children, (child) => {
    if (!isThatComponent(child, PageComponent) && !isThatComponent(child, LinkComponent) && !isThatComponent(child, MenuItemsComponent)) {
      if (child && !allowForAnyChildren) {
        (0, import_utils4.logErrorInDevMode)(customPagesIgnoredComponent(componentName));
      }
      return;
    }
    const { props } = child;
    const { children: children2, label, url, labelIcon } = props;
    if (isThatComponent(child, PageComponent)) {
      if (isReorderItem(props, reorderItemsLabels)) {
        validChildren.push({ label });
      } else if (isCustomPage(props)) {
        validChildren.push({ label, labelIcon, children: children2, url });
      } else {
        (0, import_utils4.logErrorInDevMode)(customPageWrongProps(componentName));
        return;
      }
    }
    if (isThatComponent(child, LinkComponent)) {
      if (isExternalLink(props)) {
        validChildren.push({ label, labelIcon, url });
      } else {
        (0, import_utils4.logErrorInDevMode)(customLinkWrongProps(componentName));
        return;
      }
    }
  });
  const customPageContents = [];
  const customPageLabelIcons = [];
  const customLinkLabelIcons = [];
  validChildren.forEach((cp, index) => {
    if (isCustomPage(cp)) {
      customPageContents.push({ component: cp.children, id: index });
      customPageLabelIcons.push({ component: cp.labelIcon, id: index });
      return;
    }
    if (isExternalLink(cp)) {
      customLinkLabelIcons.push({ component: cp.labelIcon, id: index });
    }
  });
  const customPageContentsPortals = useCustomElementPortal(customPageContents);
  const customPageLabelIconsPortals = useCustomElementPortal(customPageLabelIcons);
  const customLinkLabelIconsPortals = useCustomElementPortal(customLinkLabelIcons);
  const customPages = [];
  const customPagesPortals = [];
  validChildren.forEach((cp, index) => {
    if (isReorderItem(cp, reorderItemsLabels)) {
      customPages.push({ label: cp.label });
      return;
    }
    if (isCustomPage(cp)) {
      const {
        portal: contentPortal,
        mount,
        unmount
      } = customPageContentsPortals.find((p) => p.id === index);
      const {
        portal: labelPortal,
        mount: mountIcon,
        unmount: unmountIcon
      } = customPageLabelIconsPortals.find((p) => p.id === index);
      customPages.push({ label: cp.label, url: cp.url, mount, unmount, mountIcon, unmountIcon });
      customPagesPortals.push(contentPortal);
      customPagesPortals.push(labelPortal);
      return;
    }
    if (isExternalLink(cp)) {
      const {
        portal: labelPortal,
        mount: mountIcon,
        unmount: unmountIcon
      } = customLinkLabelIconsPortals.find((p) => p.id === index);
      customPages.push({ label: cp.label, url: cp.url, mountIcon, unmountIcon });
      customPagesPortals.push(labelPortal);
      return;
    }
  });
  return { customPages, customPagesPortals };
};
var isReorderItem = (childProps, validItems) => {
  const { children, label, url, labelIcon } = childProps;
  return !children && !url && !labelIcon && validItems.some((v) => v === label);
};
var isCustomPage = (childProps) => {
  const { children, label, url, labelIcon } = childProps;
  return !!children && !!url && !!labelIcon && !!label;
};
var isExternalLink = (childProps) => {
  const { children, label, url, labelIcon } = childProps;
  return !children && !!url && !!labelIcon && !!label;
};

// src/utils/useCustomMenuItems.tsx
var import_utils5 = require("@clerk/shared/utils");
var import_react19 = __toESM(require("react"));
var useUserButtonCustomMenuItems = (children, options) => {
  var _a;
  const reorderItemsLabels = ["manageAccount", "signOut"];
  return useCustomMenuItems({
    children,
    reorderItemsLabels,
    MenuItemsComponent: MenuItems,
    MenuActionComponent: MenuAction,
    MenuLinkComponent: MenuLink,
    UserProfileLinkComponent: UserProfileLink,
    UserProfilePageComponent: UserProfilePage,
    allowForAnyChildren: (_a = options == null ? void 0 : options.allowForAnyChildren) != null ? _a : false
  });
};
var useCustomMenuItems = ({
  children,
  MenuItemsComponent,
  MenuActionComponent,
  MenuLinkComponent,
  UserProfileLinkComponent,
  UserProfilePageComponent,
  reorderItemsLabels,
  allowForAnyChildren = false
}) => {
  const validChildren = [];
  const customMenuItems = [];
  const customMenuItemsPortals = [];
  import_react19.default.Children.forEach(children, (child) => {
    if (!isThatComponent(child, MenuItemsComponent) && !isThatComponent(child, UserProfileLinkComponent) && !isThatComponent(child, UserProfilePageComponent)) {
      if (child && !allowForAnyChildren) {
        (0, import_utils5.logErrorInDevMode)(userButtonIgnoredComponent);
      }
      return;
    }
    if (isThatComponent(child, UserProfileLinkComponent) || isThatComponent(child, UserProfilePageComponent)) {
      return;
    }
    const { props } = child;
    import_react19.default.Children.forEach(props.children, (child2) => {
      if (!isThatComponent(child2, MenuActionComponent) && !isThatComponent(child2, MenuLinkComponent)) {
        if (child2) {
          (0, import_utils5.logErrorInDevMode)(customMenuItemsIgnoredComponent);
        }
        return;
      }
      const { props: props2 } = child2;
      const { label, labelIcon, href, onClick, open } = props2;
      if (isThatComponent(child2, MenuActionComponent)) {
        if (isReorderItem2(props2, reorderItemsLabels)) {
          validChildren.push({ label });
        } else if (isCustomMenuItem(props2)) {
          const baseItem = {
            label,
            labelIcon
          };
          if (onClick !== void 0) {
            validChildren.push({
              ...baseItem,
              onClick
            });
          } else if (open !== void 0) {
            validChildren.push({
              ...baseItem,
              open: open.startsWith("/") ? open : `/${open}`
            });
          } else {
            (0, import_utils5.logErrorInDevMode)("Custom menu item must have either onClick or open property");
            return;
          }
        } else {
          (0, import_utils5.logErrorInDevMode)(userButtonMenuItemsActionWrongsProps);
          return;
        }
      }
      if (isThatComponent(child2, MenuLinkComponent)) {
        if (isExternalLink2(props2)) {
          validChildren.push({ label, labelIcon, href });
        } else {
          (0, import_utils5.logErrorInDevMode)(userButtonMenuItemLinkWrongProps);
          return;
        }
      }
    });
  });
  const customMenuItemLabelIcons = [];
  const customLinkLabelIcons = [];
  validChildren.forEach((mi, index) => {
    if (isCustomMenuItem(mi)) {
      customMenuItemLabelIcons.push({ component: mi.labelIcon, id: index });
    }
    if (isExternalLink2(mi)) {
      customLinkLabelIcons.push({ component: mi.labelIcon, id: index });
    }
  });
  const customMenuItemLabelIconsPortals = useCustomElementPortal(customMenuItemLabelIcons);
  const customLinkLabelIconsPortals = useCustomElementPortal(customLinkLabelIcons);
  validChildren.forEach((mi, index) => {
    if (isReorderItem2(mi, reorderItemsLabels)) {
      customMenuItems.push({
        label: mi.label
      });
    }
    if (isCustomMenuItem(mi)) {
      const {
        portal: iconPortal,
        mount: mountIcon,
        unmount: unmountIcon
      } = customMenuItemLabelIconsPortals.find((p) => p.id === index);
      const menuItem = {
        label: mi.label,
        mountIcon,
        unmountIcon
      };
      if ("onClick" in mi) {
        menuItem.onClick = mi.onClick;
      } else if ("open" in mi) {
        menuItem.open = mi.open;
      }
      customMenuItems.push(menuItem);
      customMenuItemsPortals.push(iconPortal);
    }
    if (isExternalLink2(mi)) {
      const {
        portal: iconPortal,
        mount: mountIcon,
        unmount: unmountIcon
      } = customLinkLabelIconsPortals.find((p) => p.id === index);
      customMenuItems.push({
        label: mi.label,
        href: mi.href,
        mountIcon,
        unmountIcon
      });
      customMenuItemsPortals.push(iconPortal);
    }
  });
  return { customMenuItems, customMenuItemsPortals };
};
var isReorderItem2 = (childProps, validItems) => {
  const { children, label, onClick, labelIcon } = childProps;
  return !children && !onClick && !labelIcon && validItems.some((v) => v === label);
};
var isCustomMenuItem = (childProps) => {
  const { label, labelIcon, onClick, open } = childProps;
  return !!labelIcon && !!label && (typeof onClick === "function" || typeof open === "string");
};
var isExternalLink2 = (childProps) => {
  const { label, href, labelIcon } = childProps;
  return !!href && !!labelIcon && !!label;
};

// src/components/CheckoutButton.tsx
var CheckoutButton = withClerk(
  ({ clerk, children, ...props }) => {
    const {
      planId,
      planPeriod,
      for: _for,
      onSubscriptionComplete,
      newSubscriptionRedirectUrl,
      checkoutProps,
      ...rest
    } = props;
    const { userId, orgId } = useAuth();
    if (userId === null) {
      throw new Error("Clerk: Ensure that `<CheckoutButton />` is rendered inside a `<SignedIn />` component.");
    }
    if (orgId === null && _for === "organization") {
      throw new Error(
        'Clerk: Wrap `<CheckoutButton for="organization" />` with a check for an active organization. Retrieve `orgId` from `useAuth()` and confirm it is defined. For SSR, see: https://clerk.com/docs/reference/backend/types/auth-object#how-to-access-the-auth-object'
      );
    }
    children = normalizeWithDefaultValue(children, "Checkout");
    const child = assertSingleChild(children)("CheckoutButton");
    const clickHandler = () => {
      if (!clerk) {
        return;
      }
      return clerk.__internal_openCheckout({
        planId,
        planPeriod,
        for: _for,
        onSubscriptionComplete,
        newSubscriptionRedirectUrl,
        ...checkoutProps
      });
    };
    const wrappedChildClickHandler = async (e) => {
      if (child && typeof child === "object" && "props" in child) {
        await safeExecute(child.props.onClick)(e);
      }
      return clickHandler();
    };
    const childProps = { ...rest, onClick: wrappedChildClickHandler };
    return import_react20.default.cloneElement(child, childProps);
  },
  { component: "CheckoutButton", renderWhileLoading: true }
);

// src/components/PlanDetailsButton.tsx
var import_react21 = __toESM(require("react"));
var PlanDetailsButton = withClerk(
  ({ clerk, children, ...props }) => {
    const { plan, planId, initialPlanPeriod, planDetailsProps, ...rest } = props;
    children = normalizeWithDefaultValue(children, "Plan details");
    const child = assertSingleChild(children)("PlanDetailsButton");
    const clickHandler = () => {
      if (!clerk) {
        return;
      }
      return clerk.__internal_openPlanDetails({
        plan,
        planId,
        initialPlanPeriod,
        ...planDetailsProps
      });
    };
    const wrappedChildClickHandler = async (e) => {
      if (child && typeof child === "object" && "props" in child) {
        await safeExecute(child.props.onClick)(e);
      }
      return clickHandler();
    };
    const childProps = { ...rest, onClick: wrappedChildClickHandler };
    return import_react21.default.cloneElement(child, childProps);
  },
  { component: "PlanDetailsButton", renderWhileLoading: true }
);

// src/components/SubscriptionDetailsButton.tsx
var import_react22 = __toESM(require("react"));
var SubscriptionDetailsButton = withClerk(
  ({
    clerk,
    children,
    ...props
  }) => {
    const { for: _for, subscriptionDetailsProps, onSubscriptionCancel, ...rest } = props;
    children = normalizeWithDefaultValue(children, "Subscription details");
    const child = assertSingleChild(children)("SubscriptionDetailsButton");
    const { userId, orgId } = useAuth();
    if (userId === null) {
      throw new Error(
        "Clerk: Ensure that `<SubscriptionDetailsButton />` is rendered inside a `<SignedIn />` component."
      );
    }
    if (orgId === null && _for === "organization") {
      throw new Error(
        'Clerk: Wrap `<SubscriptionDetailsButton for="organization" />` with a check for an active organization. Retrieve `orgId` from `useAuth()` and confirm it is defined. For SSR, see: https://clerk.com/docs/reference/backend/types/auth-object#how-to-access-the-auth-object'
      );
    }
    const clickHandler = () => {
      if (!clerk) {
        return;
      }
      return clerk.__internal_openSubscriptionDetails({
        for: _for,
        onSubscriptionCancel,
        ...subscriptionDetailsProps
      });
    };
    const wrappedChildClickHandler = async (e) => {
      if (child && typeof child === "object" && "props" in child) {
        await safeExecute(child.props.onClick)(e);
      }
      return clickHandler();
    };
    const childProps = { ...rest, onClick: wrappedChildClickHandler };
    return import_react22.default.cloneElement(child, childProps);
  },
  { component: "SubscriptionDetailsButton", renderWhileLoading: true }
);

// src/hooks/useClerkSignal.ts
var import_react23 = require("react");
function useClerkSignal(signal) {
  useAssertWrappedByClerkProvider("useClerkSignal");
  const clerk = useIsomorphicClerkContext();
  const subscribe = (0, import_react23.useCallback)(
    (callback) => {
      if (!clerk.loaded) {
        return () => {
        };
      }
      return clerk.__internal_state.__internal_effect(() => {
        switch (signal) {
          case "signIn":
            clerk.__internal_state.signInSignal();
            break;
          case "signUp":
            clerk.__internal_state.signUpSignal();
            break;
          default:
            throw new Error(`Unknown signal: ${signal}`);
        }
        callback();
      });
    },
    [clerk, clerk.loaded, clerk.__internal_state]
  );
  const getSnapshot = (0, import_react23.useCallback)(() => {
    switch (signal) {
      case "signIn":
        return clerk.__internal_state.signInSignal();
      case "signUp":
        return clerk.__internal_state.signUpSignal();
      default:
        throw new Error(`Unknown signal: ${signal}`);
    }
  }, [clerk.__internal_state]);
  const value = (0, import_react23.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
  return value;
}
function useSignInSignal() {
  return useClerkSignal("signIn");
}
function useSignUpSignal() {
  return useClerkSignal("signUp");
}

// src/experimental.ts
var import_react24 = require("@clerk/shared/react");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CheckoutButton,
  CheckoutProvider,
  PaymentElement,
  PaymentElementProvider,
  PlanDetailsButton,
  SubscriptionDetailsButton,
  useAPIKeys,
  useCheckout,
  usePaymentAttempts,
  usePaymentElement,
  usePaymentMethods,
  usePlans,
  useSignInSignal,
  useSignUpSignal,
  useStatements,
  useSubscription
});
//# sourceMappingURL=experimental.js.map