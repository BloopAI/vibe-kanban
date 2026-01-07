import {
  AuthenticateWithRedirectCallback,
  ClerkDegraded,
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Protect,
  RedirectToCreateOrganization,
  RedirectToOrganizationProfile,
  RedirectToSignIn,
  RedirectToSignUp,
  RedirectToTasks,
  RedirectToUserProfile,
  SignedIn,
  SignedOut
} from "./chunk-VMBS36YX.mjs";
import {
  APIKeys,
  CreateOrganization,
  GoogleOneTap,
  OrganizationList,
  OrganizationProfile,
  OrganizationSwitcher,
  PricingTable,
  SignIn,
  SignUp,
  TaskChooseOrganization,
  TaskResetPassword,
  UserAvatar,
  UserButton,
  UserProfile,
  Waitlist,
  assertSingleChild,
  isConstructor,
  normalizeWithDefaultValue,
  safeExecute,
  withMaxAllowedInstancesGuard
} from "./chunk-6WD75OPE.mjs";
import {
  AuthContext,
  IsomorphicClerkContext,
  __experimental_CheckoutProvider,
  __experimental_PaymentElement,
  __experimental_PaymentElementProvider,
  __experimental_useCheckout,
  __experimental_usePaymentElement,
  errorThrower,
  multipleClerkProvidersError,
  setErrorThrowerOptions,
  unsupportedNonBrowserDomainOrProxyUrlFunction,
  useAuth,
  useClerk,
  useEmailLink,
  useOrganization,
  useOrganizationList,
  useReverification,
  useSession,
  useSessionList,
  useSignIn,
  useSignUp,
  useUser,
  withClerk
} from "./chunk-OT5FTIRN.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-OANWQR3B.mjs";

// src/polyfills.ts
if (typeof window !== "undefined" && !window.global) {
  window.global = typeof global === "undefined" ? window : global;
}

// src/index.ts
import { setClerkJsLoadingErrorPackageName } from "@clerk/shared/loadClerkJsScript";

// src/components/SignInButton.tsx
import React from "react";
var SignInButton = withClerk(
  ({ clerk, children, ...props }) => {
    const {
      signUpFallbackRedirectUrl,
      forceRedirectUrl,
      fallbackRedirectUrl,
      signUpForceRedirectUrl,
      mode,
      initialValues,
      withSignUp,
      oauthFlow,
      ...rest
    } = props;
    children = normalizeWithDefaultValue(children, "Sign in");
    const child = assertSingleChild(children)("SignInButton");
    const clickHandler = () => {
      const opts = {
        forceRedirectUrl,
        fallbackRedirectUrl,
        signUpFallbackRedirectUrl,
        signUpForceRedirectUrl,
        initialValues,
        withSignUp,
        oauthFlow
      };
      if (mode === "modal") {
        return clerk.openSignIn({ ...opts, appearance: props.appearance });
      }
      return clerk.redirectToSignIn({
        ...opts,
        signInFallbackRedirectUrl: fallbackRedirectUrl,
        signInForceRedirectUrl: forceRedirectUrl
      });
    };
    const wrappedChildClickHandler = async (e) => {
      if (child && typeof child === "object" && "props" in child) {
        await safeExecute(child.props.onClick)(e);
      }
      return clickHandler();
    };
    const childProps = { ...rest, onClick: wrappedChildClickHandler };
    return React.cloneElement(child, childProps);
  },
  { component: "SignInButton", renderWhileLoading: true }
);

// src/components/SignInWithMetamaskButton.tsx
import React2 from "react";
var SignInWithMetamaskButton = withClerk(
  ({ clerk, children, ...props }) => {
    const { redirectUrl, ...rest } = props;
    children = normalizeWithDefaultValue(children, "Sign in with Metamask");
    const child = assertSingleChild(children)("SignInWithMetamaskButton");
    const clickHandler = async () => {
      async function authenticate() {
        await clerk.authenticateWithMetamask({ redirectUrl: redirectUrl || void 0 });
      }
      void authenticate();
    };
    const wrappedChildClickHandler = async (e) => {
      await safeExecute(child.props.onClick)(e);
      return clickHandler();
    };
    const childProps = { ...rest, onClick: wrappedChildClickHandler };
    return React2.cloneElement(child, childProps);
  },
  { component: "SignInWithMetamask", renderWhileLoading: true }
);

// src/components/SignOutButton.tsx
import React3 from "react";
var SignOutButton = withClerk(
  ({ clerk, children, ...props }) => {
    const { redirectUrl = "/", signOutOptions, ...rest } = props;
    children = normalizeWithDefaultValue(children, "Sign out");
    const child = assertSingleChild(children)("SignOutButton");
    const clickHandler = () => clerk.signOut({ redirectUrl, ...signOutOptions });
    const wrappedChildClickHandler = async (e) => {
      await safeExecute(child.props.onClick)(e);
      return clickHandler();
    };
    const childProps = { ...rest, onClick: wrappedChildClickHandler };
    return React3.cloneElement(child, childProps);
  },
  { component: "SignOutButton", renderWhileLoading: true }
);

// src/components/SignUpButton.tsx
import React4 from "react";
var SignUpButton = withClerk(
  ({ clerk, children, ...props }) => {
    const {
      fallbackRedirectUrl,
      forceRedirectUrl,
      signInFallbackRedirectUrl,
      signInForceRedirectUrl,
      mode,
      initialValues,
      oauthFlow,
      ...rest
    } = props;
    children = normalizeWithDefaultValue(children, "Sign up");
    const child = assertSingleChild(children)("SignUpButton");
    const clickHandler = () => {
      const opts = {
        fallbackRedirectUrl,
        forceRedirectUrl,
        signInFallbackRedirectUrl,
        signInForceRedirectUrl,
        initialValues,
        oauthFlow
      };
      if (mode === "modal") {
        return clerk.openSignUp({
          ...opts,
          appearance: props.appearance,
          unsafeMetadata: props.unsafeMetadata
        });
      }
      return clerk.redirectToSignUp({
        ...opts,
        signUpFallbackRedirectUrl: fallbackRedirectUrl,
        signUpForceRedirectUrl: forceRedirectUrl
      });
    };
    const wrappedChildClickHandler = async (e) => {
      if (child && typeof child === "object" && "props" in child) {
        await safeExecute(child.props.onClick)(e);
      }
      return clickHandler();
    };
    const childProps = { ...rest, onClick: wrappedChildClickHandler };
    return React4.cloneElement(child, childProps);
  },
  { component: "SignUpButton", renderWhileLoading: true }
);

// src/contexts/ClerkProvider.tsx
import { isPublishableKey } from "@clerk/shared/keys";
import React6 from "react";

// src/contexts/ClerkContextProvider.tsx
import { deriveState } from "@clerk/shared/deriveState";
import {
  __experimental_CheckoutProvider as CheckoutProvider,
  ClientContext,
  OrganizationProvider,
  SessionContext,
  UserContext
} from "@clerk/shared/react";
import React5 from "react";

// src/isomorphicClerk.ts
import { inBrowser as inBrowser2 } from "@clerk/shared/browser";
import { clerkEvents, createClerkEventBus } from "@clerk/shared/clerkEventBus";
import { loadClerkJsScript } from "@clerk/shared/loadClerkJsScript";
import { handleValueOrFn } from "@clerk/shared/utils";

// src/stateProxy.ts
import { inBrowser } from "@clerk/shared/browser";
var defaultSignInErrors = () => ({
  fields: {
    identifier: null,
    password: null,
    code: null
  },
  raw: null,
  global: null
});
var defaultSignUpErrors = () => ({
  fields: {
    firstName: null,
    lastName: null,
    emailAddress: null,
    phoneNumber: null,
    password: null,
    username: null,
    code: null,
    captcha: null,
    legalAccepted: null
  },
  raw: null,
  global: null
});
var StateProxy = class {
  constructor(isomorphicClerk) {
    this.isomorphicClerk = isomorphicClerk;
    this.signInSignalProxy = this.buildSignInProxy();
    this.signUpSignalProxy = this.buildSignUpProxy();
  }
  signInSignal() {
    return this.signInSignalProxy;
  }
  signUpSignal() {
    return this.signUpSignalProxy;
  }
  buildSignInProxy() {
    const gateProperty = this.gateProperty.bind(this);
    const target = () => this.client.signIn.__internal_future;
    return {
      errors: defaultSignInErrors(),
      fetchStatus: "idle",
      signIn: {
        status: "needs_identifier",
        availableStrategies: [],
        isTransferable: false,
        get id() {
          return gateProperty(target, "id", void 0);
        },
        get supportedFirstFactors() {
          return gateProperty(target, "supportedFirstFactors", []);
        },
        get supportedSecondFactors() {
          return gateProperty(target, "supportedSecondFactors", []);
        },
        get secondFactorVerification() {
          return gateProperty(target, "secondFactorVerification", {
            status: null,
            error: null,
            expireAt: null,
            externalVerificationRedirectURL: null,
            nonce: null,
            attempts: null,
            message: null,
            strategy: null,
            verifiedAtClient: null,
            verifiedFromTheSameClient: () => false,
            __internal_toSnapshot: () => {
              throw new Error("__internal_toSnapshot called before Clerk is loaded");
            },
            pathRoot: "",
            reload: () => {
              throw new Error("__internal_toSnapshot called before Clerk is loaded");
            }
          });
        },
        get identifier() {
          return gateProperty(target, "identifier", null);
        },
        get createdSessionId() {
          return gateProperty(target, "createdSessionId", null);
        },
        get userData() {
          return gateProperty(target, "userData", {});
        },
        get firstFactorVerification() {
          return gateProperty(target, "firstFactorVerification", {
            status: null,
            error: null,
            expireAt: null,
            externalVerificationRedirectURL: null,
            nonce: null,
            attempts: null,
            message: null,
            strategy: null,
            verifiedAtClient: null,
            verifiedFromTheSameClient: () => false,
            __internal_toSnapshot: () => {
              throw new Error("__internal_toSnapshot called before Clerk is loaded");
            },
            pathRoot: "",
            reload: () => {
              throw new Error("__internal_toSnapshot called before Clerk is loaded");
            }
          });
        },
        create: this.gateMethod(target, "create"),
        password: this.gateMethod(target, "password"),
        sso: this.gateMethod(target, "sso"),
        finalize: this.gateMethod(target, "finalize"),
        emailCode: this.wrapMethods(() => target().emailCode, ["sendCode", "verifyCode"]),
        emailLink: this.wrapStruct(
          () => target().emailLink,
          ["sendLink", "waitForVerification"],
          ["verification"],
          { verification: null }
        ),
        resetPasswordEmailCode: this.wrapMethods(() => target().resetPasswordEmailCode, [
          "sendCode",
          "verifyCode",
          "submitPassword"
        ]),
        phoneCode: this.wrapMethods(() => target().phoneCode, ["sendCode", "verifyCode"]),
        mfa: this.wrapMethods(() => target().mfa, [
          "sendPhoneCode",
          "verifyPhoneCode",
          "verifyTOTP",
          "verifyBackupCode"
        ]),
        ticket: this.gateMethod(target, "ticket"),
        passkey: this.gateMethod(target, "passkey"),
        web3: this.gateMethod(target, "web3")
      }
    };
  }
  buildSignUpProxy() {
    const gateProperty = this.gateProperty.bind(this);
    const gateMethod = this.gateMethod.bind(this);
    const wrapMethods = this.wrapMethods.bind(this);
    const target = () => this.client.signUp.__internal_future;
    return {
      errors: defaultSignUpErrors(),
      fetchStatus: "idle",
      signUp: {
        get id() {
          return gateProperty(target, "id", void 0);
        },
        get requiredFields() {
          return gateProperty(target, "requiredFields", []);
        },
        get optionalFields() {
          return gateProperty(target, "optionalFields", []);
        },
        get missingFields() {
          return gateProperty(target, "missingFields", []);
        },
        get username() {
          return gateProperty(target, "username", null);
        },
        get firstName() {
          return gateProperty(target, "firstName", null);
        },
        get lastName() {
          return gateProperty(target, "lastName", null);
        },
        get emailAddress() {
          return gateProperty(target, "emailAddress", null);
        },
        get phoneNumber() {
          return gateProperty(target, "phoneNumber", null);
        },
        get web3Wallet() {
          return gateProperty(target, "web3Wallet", null);
        },
        get hasPassword() {
          return gateProperty(target, "hasPassword", false);
        },
        get unsafeMetadata() {
          return gateProperty(target, "unsafeMetadata", {});
        },
        get createdSessionId() {
          return gateProperty(target, "createdSessionId", null);
        },
        get createdUserId() {
          return gateProperty(target, "createdUserId", null);
        },
        get abandonAt() {
          return gateProperty(target, "abandonAt", null);
        },
        get legalAcceptedAt() {
          return gateProperty(target, "legalAcceptedAt", null);
        },
        get locale() {
          return gateProperty(target, "locale", null);
        },
        get status() {
          return gateProperty(target, "status", "missing_requirements");
        },
        get unverifiedFields() {
          return gateProperty(target, "unverifiedFields", []);
        },
        get isTransferable() {
          return gateProperty(target, "isTransferable", false);
        },
        create: gateMethod(target, "create"),
        update: gateMethod(target, "update"),
        sso: gateMethod(target, "sso"),
        password: gateMethod(target, "password"),
        ticket: gateMethod(target, "ticket"),
        web3: gateMethod(target, "web3"),
        finalize: gateMethod(target, "finalize"),
        verifications: wrapMethods(() => target().verifications, [
          "sendEmailCode",
          "verifyEmailCode",
          "sendPhoneCode",
          "verifyPhoneCode"
        ])
      }
    };
  }
  __internal_effect(_) {
    throw new Error("__internal_effect called before Clerk is loaded");
  }
  __internal_computed(_) {
    throw new Error("__internal_computed called before Clerk is loaded");
  }
  get client() {
    const c = this.isomorphicClerk.client;
    if (!c) {
      throw new Error("Clerk client not ready");
    }
    return c;
  }
  gateProperty(getTarget, key, defaultValue) {
    return (() => {
      if (!inBrowser() || !this.isomorphicClerk.loaded) {
        return defaultValue;
      }
      const t = getTarget();
      return t[key];
    })();
  }
  gateMethod(getTarget, key) {
    return (async (...args) => {
      if (!inBrowser()) {
        return errorThrower.throw(`Attempted to call a method (${key}) that is not supported on the server.`);
      }
      if (!this.isomorphicClerk.loaded) {
        await new Promise((resolve) => this.isomorphicClerk.addOnLoaded(resolve));
      }
      const t = getTarget();
      return t[key].apply(t, args);
    });
  }
  wrapMethods(getTarget, keys) {
    return Object.fromEntries(keys.map((k) => [k, this.gateMethod(getTarget, k)]));
  }
  wrapStruct(getTarget, methods, getters, fallbacks) {
    const out = {};
    for (const m of methods) {
      out[m] = this.gateMethod(getTarget, m);
    }
    for (const g of getters) {
      Object.defineProperty(out, g, {
        get: () => this.gateProperty(getTarget, g, fallbacks[g]),
        enumerable: true
      });
    }
    return out;
  }
};

// src/isomorphicClerk.ts
if (typeof globalThis.__BUILD_DISABLE_RHC__ === "undefined") {
  globalThis.__BUILD_DISABLE_RHC__ = false;
}
var SDK_METADATA = {
  name: "@clerk/clerk-react",
  version: "5.59.2",
  environment: process.env.NODE_ENV
};
var _status, _domain, _proxyUrl, _publishableKey, _eventBus, _stateProxy, _instance, _IsomorphicClerk_instances, waitForClerkJS_fn;
var _IsomorphicClerk = class _IsomorphicClerk {
  constructor(options) {
    __privateAdd(this, _IsomorphicClerk_instances);
    this.clerkjs = null;
    this.preopenOneTap = null;
    this.preopenUserVerification = null;
    this.preopenEnableOrganizationsPrompt = null;
    this.preopenSignIn = null;
    this.preopenCheckout = null;
    this.preopenPlanDetails = null;
    this.preopenSubscriptionDetails = null;
    this.preopenSignUp = null;
    this.preopenUserProfile = null;
    this.preopenOrganizationProfile = null;
    this.preopenCreateOrganization = null;
    this.preOpenWaitlist = null;
    this.premountSignInNodes = /* @__PURE__ */ new Map();
    this.premountSignUpNodes = /* @__PURE__ */ new Map();
    this.premountUserAvatarNodes = /* @__PURE__ */ new Map();
    this.premountUserProfileNodes = /* @__PURE__ */ new Map();
    this.premountUserButtonNodes = /* @__PURE__ */ new Map();
    this.premountOrganizationProfileNodes = /* @__PURE__ */ new Map();
    this.premountCreateOrganizationNodes = /* @__PURE__ */ new Map();
    this.premountOrganizationSwitcherNodes = /* @__PURE__ */ new Map();
    this.premountOrganizationListNodes = /* @__PURE__ */ new Map();
    this.premountMethodCalls = /* @__PURE__ */ new Map();
    this.premountWaitlistNodes = /* @__PURE__ */ new Map();
    this.premountPricingTableNodes = /* @__PURE__ */ new Map();
    this.premountAPIKeysNodes = /* @__PURE__ */ new Map();
    this.premountOAuthConsentNodes = /* @__PURE__ */ new Map();
    this.premountTaskChooseOrganizationNodes = /* @__PURE__ */ new Map();
    this.premountTaskResetPasswordNodes = /* @__PURE__ */ new Map();
    // A separate Map of `addListener` method calls to handle multiple listeners.
    this.premountAddListenerCalls = /* @__PURE__ */ new Map();
    this.loadedListeners = [];
    __privateAdd(this, _status, "loading");
    __privateAdd(this, _domain);
    __privateAdd(this, _proxyUrl);
    __privateAdd(this, _publishableKey);
    __privateAdd(this, _eventBus, createClerkEventBus());
    __privateAdd(this, _stateProxy);
    this.buildSignInUrl = (opts) => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildSignInUrl(opts)) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildSignInUrl", callback);
      }
    };
    this.buildSignUpUrl = (opts) => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildSignUpUrl(opts)) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildSignUpUrl", callback);
      }
    };
    this.buildAfterSignInUrl = (...args) => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildAfterSignInUrl(...args)) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildAfterSignInUrl", callback);
      }
    };
    this.buildAfterSignUpUrl = (...args) => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildAfterSignUpUrl(...args)) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildAfterSignUpUrl", callback);
      }
    };
    this.buildAfterSignOutUrl = () => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildAfterSignOutUrl()) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildAfterSignOutUrl", callback);
      }
    };
    this.buildNewSubscriptionRedirectUrl = () => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildNewSubscriptionRedirectUrl()) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildNewSubscriptionRedirectUrl", callback);
      }
    };
    this.buildAfterMultiSessionSingleSignOutUrl = () => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildAfterMultiSessionSingleSignOutUrl()) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildAfterMultiSessionSingleSignOutUrl", callback);
      }
    };
    this.buildUserProfileUrl = () => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildUserProfileUrl()) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildUserProfileUrl", callback);
      }
    };
    this.buildCreateOrganizationUrl = () => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildCreateOrganizationUrl()) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildCreateOrganizationUrl", callback);
      }
    };
    this.buildOrganizationProfileUrl = () => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildOrganizationProfileUrl()) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildOrganizationProfileUrl", callback);
      }
    };
    this.buildWaitlistUrl = () => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildWaitlistUrl()) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildWaitlistUrl", callback);
      }
    };
    this.buildTasksUrl = () => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildTasksUrl()) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildTasksUrl", callback);
      }
    };
    this.buildUrlWithAuth = (to) => {
      const callback = () => {
        var _a;
        return ((_a = this.clerkjs) == null ? void 0 : _a.buildUrlWithAuth(to)) || "";
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("buildUrlWithAuth", callback);
      }
    };
    this.handleUnauthenticated = async () => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.handleUnauthenticated();
      };
      if (this.clerkjs && this.loaded) {
        void callback();
      } else {
        this.premountMethodCalls.set("handleUnauthenticated", callback);
      }
    };
    this.on = (...args) => {
      var _a;
      if ((_a = this.clerkjs) == null ? void 0 : _a.on) {
        return this.clerkjs.on(...args);
      } else {
        __privateGet(this, _eventBus).on(...args);
      }
    };
    this.off = (...args) => {
      var _a;
      if ((_a = this.clerkjs) == null ? void 0 : _a.off) {
        return this.clerkjs.off(...args);
      } else {
        __privateGet(this, _eventBus).off(...args);
      }
    };
    /**
     * @deprecated Please use `addStatusListener`. This api will be removed in the next major.
     */
    this.addOnLoaded = (cb) => {
      this.loadedListeners.push(cb);
      if (this.loaded) {
        this.emitLoaded();
      }
    };
    /**
     * @deprecated Please use `__internal_setStatus`. This api will be removed in the next major.
     */
    this.emitLoaded = () => {
      this.loadedListeners.forEach((cb) => cb());
      this.loadedListeners = [];
    };
    this.beforeLoad = (clerkjs) => {
      if (!clerkjs) {
        throw new Error("Failed to hydrate latest Clerk JS");
      }
    };
    this.hydrateClerkJS = (clerkjs) => {
      var _a, _b;
      if (!clerkjs) {
        throw new Error("Failed to hydrate latest Clerk JS");
      }
      this.clerkjs = clerkjs;
      this.premountMethodCalls.forEach((cb) => cb());
      this.premountAddListenerCalls.forEach((listenerHandlers, listener) => {
        listenerHandlers.nativeUnsubscribe = clerkjs.addListener(listener);
      });
      (_a = __privateGet(this, _eventBus).internal.retrieveListeners("status")) == null ? void 0 : _a.forEach((listener) => {
        this.on("status", listener, { notify: true });
      });
      (_b = __privateGet(this, _eventBus).internal.retrieveListeners("queryClientStatus")) == null ? void 0 : _b.forEach((listener) => {
        this.on("queryClientStatus", listener, { notify: true });
      });
      if (this.preopenSignIn !== null) {
        clerkjs.openSignIn(this.preopenSignIn);
      }
      if (this.preopenCheckout !== null) {
        clerkjs.__internal_openCheckout(this.preopenCheckout);
      }
      if (this.preopenPlanDetails !== null) {
        clerkjs.__internal_openPlanDetails(this.preopenPlanDetails);
      }
      if (this.preopenSubscriptionDetails !== null) {
        clerkjs.__internal_openSubscriptionDetails(this.preopenSubscriptionDetails);
      }
      if (this.preopenSignUp !== null) {
        clerkjs.openSignUp(this.preopenSignUp);
      }
      if (this.preopenUserProfile !== null) {
        clerkjs.openUserProfile(this.preopenUserProfile);
      }
      if (this.preopenUserVerification !== null) {
        clerkjs.__internal_openReverification(this.preopenUserVerification);
      }
      if (this.preopenOneTap !== null) {
        clerkjs.openGoogleOneTap(this.preopenOneTap);
      }
      if (this.preopenOrganizationProfile !== null) {
        clerkjs.openOrganizationProfile(this.preopenOrganizationProfile);
      }
      if (this.preopenCreateOrganization !== null) {
        clerkjs.openCreateOrganization(this.preopenCreateOrganization);
      }
      if (this.preOpenWaitlist !== null) {
        clerkjs.openWaitlist(this.preOpenWaitlist);
      }
      if (this.preopenEnableOrganizationsPrompt) {
        clerkjs.__internal_openEnableOrganizationsPrompt(this.preopenEnableOrganizationsPrompt);
      }
      this.premountSignInNodes.forEach((props, node) => {
        clerkjs.mountSignIn(node, props);
      });
      this.premountSignUpNodes.forEach((props, node) => {
        clerkjs.mountSignUp(node, props);
      });
      this.premountUserProfileNodes.forEach((props, node) => {
        clerkjs.mountUserProfile(node, props);
      });
      this.premountUserAvatarNodes.forEach((props, node) => {
        clerkjs.mountUserAvatar(node, props);
      });
      this.premountUserButtonNodes.forEach((props, node) => {
        clerkjs.mountUserButton(node, props);
      });
      this.premountOrganizationListNodes.forEach((props, node) => {
        clerkjs.mountOrganizationList(node, props);
      });
      this.premountWaitlistNodes.forEach((props, node) => {
        clerkjs.mountWaitlist(node, props);
      });
      this.premountPricingTableNodes.forEach((props, node) => {
        clerkjs.mountPricingTable(node, props);
      });
      this.premountAPIKeysNodes.forEach((props, node) => {
        clerkjs.mountAPIKeys(node, props);
      });
      this.premountOAuthConsentNodes.forEach((props, node) => {
        clerkjs.__internal_mountOAuthConsent(node, props);
      });
      this.premountTaskChooseOrganizationNodes.forEach((props, node) => {
        clerkjs.mountTaskChooseOrganization(node, props);
      });
      this.premountTaskResetPasswordNodes.forEach((props, node) => {
        clerkjs.mountTaskResetPassword(node, props);
      });
      if (typeof this.clerkjs.status === "undefined") {
        __privateGet(this, _eventBus).emit(clerkEvents.Status, "ready");
      }
      this.emitLoaded();
      return this.clerkjs;
    };
    this.__experimental_checkout = (...args) => {
      var _a;
      return (_a = this.clerkjs) == null ? void 0 : _a.__experimental_checkout(...args);
    };
    // TODO @userland-errors:
    this.__unstable__updateProps = async (props) => {
      const clerkjs = await __privateMethod(this, _IsomorphicClerk_instances, waitForClerkJS_fn).call(this);
      if (clerkjs && "__unstable__updateProps" in clerkjs) {
        return clerkjs.__unstable__updateProps(props);
      }
    };
    /**
     * `setActive` can be used to set the active session and/or organization.
     */
    this.setActive = (params) => {
      if (this.clerkjs) {
        return this.clerkjs.setActive(params);
      } else {
        return Promise.reject();
      }
    };
    this.openSignIn = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.openSignIn(props);
      } else {
        this.preopenSignIn = props;
      }
    };
    this.closeSignIn = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.closeSignIn();
      } else {
        this.preopenSignIn = null;
      }
    };
    this.__internal_openCheckout = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_openCheckout(props);
      } else {
        this.preopenCheckout = props;
      }
    };
    this.__internal_closeCheckout = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_closeCheckout();
      } else {
        this.preopenCheckout = null;
      }
    };
    this.__internal_openPlanDetails = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_openPlanDetails(props);
      } else {
        this.preopenPlanDetails = props;
      }
    };
    this.__internal_closePlanDetails = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_closePlanDetails();
      } else {
        this.preopenPlanDetails = null;
      }
    };
    this.__internal_openSubscriptionDetails = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_openSubscriptionDetails(props);
      } else {
        this.preopenSubscriptionDetails = props != null ? props : null;
      }
    };
    this.__internal_closeSubscriptionDetails = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_closeSubscriptionDetails();
      } else {
        this.preopenSubscriptionDetails = null;
      }
    };
    this.__internal_openReverification = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_openReverification(props);
      } else {
        this.preopenUserVerification = props;
      }
    };
    this.__internal_closeReverification = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_closeReverification();
      } else {
        this.preopenUserVerification = null;
      }
    };
    this.__internal_openEnableOrganizationsPrompt = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_openEnableOrganizationsPrompt(props);
      } else {
        this.preopenEnableOrganizationsPrompt = props;
      }
    };
    this.__internal_closeEnableOrganizationsPrompt = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_closeEnableOrganizationsPrompt();
      } else {
        this.preopenEnableOrganizationsPrompt = null;
      }
    };
    this.openGoogleOneTap = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.openGoogleOneTap(props);
      } else {
        this.preopenOneTap = props;
      }
    };
    this.closeGoogleOneTap = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.closeGoogleOneTap();
      } else {
        this.preopenOneTap = null;
      }
    };
    this.openUserProfile = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.openUserProfile(props);
      } else {
        this.preopenUserProfile = props;
      }
    };
    this.closeUserProfile = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.closeUserProfile();
      } else {
        this.preopenUserProfile = null;
      }
    };
    this.openOrganizationProfile = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.openOrganizationProfile(props);
      } else {
        this.preopenOrganizationProfile = props;
      }
    };
    this.closeOrganizationProfile = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.closeOrganizationProfile();
      } else {
        this.preopenOrganizationProfile = null;
      }
    };
    this.openCreateOrganization = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.openCreateOrganization(props);
      } else {
        this.preopenCreateOrganization = props;
      }
    };
    this.closeCreateOrganization = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.closeCreateOrganization();
      } else {
        this.preopenCreateOrganization = null;
      }
    };
    this.openWaitlist = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.openWaitlist(props);
      } else {
        this.preOpenWaitlist = props;
      }
    };
    this.closeWaitlist = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.closeWaitlist();
      } else {
        this.preOpenWaitlist = null;
      }
    };
    this.openSignUp = (props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.openSignUp(props);
      } else {
        this.preopenSignUp = props;
      }
    };
    this.closeSignUp = () => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.closeSignUp();
      } else {
        this.preopenSignUp = null;
      }
    };
    this.mountSignIn = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountSignIn(node, props);
      } else {
        this.premountSignInNodes.set(node, props);
      }
    };
    this.unmountSignIn = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountSignIn(node);
      } else {
        this.premountSignInNodes.delete(node);
      }
    };
    this.mountSignUp = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountSignUp(node, props);
      } else {
        this.premountSignUpNodes.set(node, props);
      }
    };
    this.unmountSignUp = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountSignUp(node);
      } else {
        this.premountSignUpNodes.delete(node);
      }
    };
    this.mountUserAvatar = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountUserAvatar(node, props);
      } else {
        this.premountUserAvatarNodes.set(node, props);
      }
    };
    this.unmountUserAvatar = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountUserAvatar(node);
      } else {
        this.premountUserAvatarNodes.delete(node);
      }
    };
    this.mountUserProfile = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountUserProfile(node, props);
      } else {
        this.premountUserProfileNodes.set(node, props);
      }
    };
    this.unmountUserProfile = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountUserProfile(node);
      } else {
        this.premountUserProfileNodes.delete(node);
      }
    };
    this.mountOrganizationProfile = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountOrganizationProfile(node, props);
      } else {
        this.premountOrganizationProfileNodes.set(node, props);
      }
    };
    this.unmountOrganizationProfile = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountOrganizationProfile(node);
      } else {
        this.premountOrganizationProfileNodes.delete(node);
      }
    };
    this.mountCreateOrganization = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountCreateOrganization(node, props);
      } else {
        this.premountCreateOrganizationNodes.set(node, props);
      }
    };
    this.unmountCreateOrganization = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountCreateOrganization(node);
      } else {
        this.premountCreateOrganizationNodes.delete(node);
      }
    };
    this.mountOrganizationSwitcher = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountOrganizationSwitcher(node, props);
      } else {
        this.premountOrganizationSwitcherNodes.set(node, props);
      }
    };
    this.unmountOrganizationSwitcher = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountOrganizationSwitcher(node);
      } else {
        this.premountOrganizationSwitcherNodes.delete(node);
      }
    };
    this.__experimental_prefetchOrganizationSwitcher = () => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.__experimental_prefetchOrganizationSwitcher();
      };
      if (this.clerkjs && this.loaded) {
        void callback();
      } else {
        this.premountMethodCalls.set("__experimental_prefetchOrganizationSwitcher", callback);
      }
    };
    this.mountOrganizationList = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountOrganizationList(node, props);
      } else {
        this.premountOrganizationListNodes.set(node, props);
      }
    };
    this.unmountOrganizationList = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountOrganizationList(node);
      } else {
        this.premountOrganizationListNodes.delete(node);
      }
    };
    this.mountUserButton = (node, userButtonProps) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountUserButton(node, userButtonProps);
      } else {
        this.premountUserButtonNodes.set(node, userButtonProps);
      }
    };
    this.unmountUserButton = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountUserButton(node);
      } else {
        this.premountUserButtonNodes.delete(node);
      }
    };
    this.mountWaitlist = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountWaitlist(node, props);
      } else {
        this.premountWaitlistNodes.set(node, props);
      }
    };
    this.unmountWaitlist = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountWaitlist(node);
      } else {
        this.premountWaitlistNodes.delete(node);
      }
    };
    this.mountPricingTable = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountPricingTable(node, props);
      } else {
        this.premountPricingTableNodes.set(node, props);
      }
    };
    this.unmountPricingTable = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountPricingTable(node);
      } else {
        this.premountPricingTableNodes.delete(node);
      }
    };
    this.mountAPIKeys = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountAPIKeys(node, props);
      } else {
        this.premountAPIKeysNodes.set(node, props);
      }
    };
    this.unmountAPIKeys = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountAPIKeys(node);
      } else {
        this.premountAPIKeysNodes.delete(node);
      }
    };
    this.__internal_mountOAuthConsent = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_mountOAuthConsent(node, props);
      } else {
        this.premountOAuthConsentNodes.set(node, props);
      }
    };
    this.__internal_unmountOAuthConsent = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.__internal_unmountOAuthConsent(node);
      } else {
        this.premountOAuthConsentNodes.delete(node);
      }
    };
    this.mountTaskChooseOrganization = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountTaskChooseOrganization(node, props);
      } else {
        this.premountTaskChooseOrganizationNodes.set(node, props);
      }
    };
    this.unmountTaskChooseOrganization = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountTaskChooseOrganization(node);
      } else {
        this.premountTaskChooseOrganizationNodes.delete(node);
      }
    };
    this.mountTaskResetPassword = (node, props) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.mountTaskResetPassword(node, props);
      } else {
        this.premountTaskResetPasswordNodes.set(node, props);
      }
    };
    this.unmountTaskResetPassword = (node) => {
      if (this.clerkjs && this.loaded) {
        this.clerkjs.unmountTaskResetPassword(node);
      } else {
        this.premountTaskResetPasswordNodes.delete(node);
      }
    };
    this.addListener = (listener) => {
      if (this.clerkjs) {
        return this.clerkjs.addListener(listener);
      } else {
        const unsubscribe = () => {
          var _a;
          const listenerHandlers = this.premountAddListenerCalls.get(listener);
          if (listenerHandlers) {
            (_a = listenerHandlers.nativeUnsubscribe) == null ? void 0 : _a.call(listenerHandlers);
            this.premountAddListenerCalls.delete(listener);
          }
        };
        this.premountAddListenerCalls.set(listener, { unsubscribe, nativeUnsubscribe: void 0 });
        return unsubscribe;
      }
    };
    this.navigate = (to) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.navigate(to);
      };
      if (this.clerkjs && this.loaded) {
        void callback();
      } else {
        this.premountMethodCalls.set("navigate", callback);
      }
    };
    this.redirectWithAuth = async (...args) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectWithAuth(...args);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("redirectWithAuth", callback);
        return;
      }
    };
    this.redirectToSignIn = async (opts) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToSignIn(opts);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("redirectToSignIn", callback);
        return;
      }
    };
    this.redirectToSignUp = async (opts) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToSignUp(opts);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("redirectToSignUp", callback);
        return;
      }
    };
    this.redirectToUserProfile = async () => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToUserProfile();
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("redirectToUserProfile", callback);
        return;
      }
    };
    this.redirectToAfterSignUp = () => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToAfterSignUp();
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("redirectToAfterSignUp", callback);
      }
    };
    this.redirectToAfterSignIn = () => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToAfterSignIn();
      };
      if (this.clerkjs && this.loaded) {
        callback();
      } else {
        this.premountMethodCalls.set("redirectToAfterSignIn", callback);
      }
    };
    this.redirectToAfterSignOut = () => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToAfterSignOut();
      };
      if (this.clerkjs && this.loaded) {
        callback();
      } else {
        this.premountMethodCalls.set("redirectToAfterSignOut", callback);
      }
    };
    this.redirectToOrganizationProfile = async () => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToOrganizationProfile();
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("redirectToOrganizationProfile", callback);
        return;
      }
    };
    this.redirectToCreateOrganization = async () => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToCreateOrganization();
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("redirectToCreateOrganization", callback);
        return;
      }
    };
    this.redirectToWaitlist = async () => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToWaitlist();
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("redirectToWaitlist", callback);
        return;
      }
    };
    this.redirectToTasks = async (opts) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.redirectToTasks(opts);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("redirectToTasks", callback);
        return;
      }
    };
    this.handleRedirectCallback = async (params) => {
      var _a;
      const callback = () => {
        var _a2;
        return (_a2 = this.clerkjs) == null ? void 0 : _a2.handleRedirectCallback(params);
      };
      if (this.clerkjs && this.loaded) {
        void ((_a = callback()) == null ? void 0 : _a.catch(() => {
        }));
      } else {
        this.premountMethodCalls.set("handleRedirectCallback", callback);
      }
    };
    this.handleGoogleOneTapCallback = async (signInOrUp, params) => {
      var _a;
      const callback = () => {
        var _a2;
        return (_a2 = this.clerkjs) == null ? void 0 : _a2.handleGoogleOneTapCallback(signInOrUp, params);
      };
      if (this.clerkjs && this.loaded) {
        void ((_a = callback()) == null ? void 0 : _a.catch(() => {
        }));
      } else {
        this.premountMethodCalls.set("handleGoogleOneTapCallback", callback);
      }
    };
    this.handleEmailLinkVerification = async (params) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.handleEmailLinkVerification(params);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("handleEmailLinkVerification", callback);
      }
    };
    this.authenticateWithMetamask = async (params) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.authenticateWithMetamask(params);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("authenticateWithMetamask", callback);
      }
    };
    this.authenticateWithCoinbaseWallet = async (params) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.authenticateWithCoinbaseWallet(params);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("authenticateWithCoinbaseWallet", callback);
      }
    };
    this.authenticateWithBase = async (params) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.authenticateWithBase(params);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("authenticateWithBase", callback);
      }
    };
    this.authenticateWithOKXWallet = async (params) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.authenticateWithOKXWallet(params);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("authenticateWithOKXWallet", callback);
      }
    };
    this.authenticateWithSolana = async (params) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.authenticateWithSolana(params);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("authenticateWithSolana", callback);
      }
    };
    this.authenticateWithWeb3 = async (params) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.authenticateWithWeb3(params);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("authenticateWithWeb3", callback);
      }
    };
    this.authenticateWithGoogleOneTap = async (params) => {
      const clerkjs = await __privateMethod(this, _IsomorphicClerk_instances, waitForClerkJS_fn).call(this);
      return clerkjs.authenticateWithGoogleOneTap(params);
    };
    this.__internal_loadStripeJs = async () => {
      const clerkjs = await __privateMethod(this, _IsomorphicClerk_instances, waitForClerkJS_fn).call(this);
      return clerkjs.__internal_loadStripeJs();
    };
    this.createOrganization = async (params) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.createOrganization(params);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("createOrganization", callback);
      }
    };
    this.getOrganization = async (organizationId) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.getOrganization(organizationId);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("getOrganization", callback);
      }
    };
    this.joinWaitlist = async (params) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.joinWaitlist(params);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("joinWaitlist", callback);
      }
    };
    this.signOut = async (...args) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.signOut(...args);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("signOut", callback);
      }
    };
    this.__internal_attemptToEnableEnvironmentSetting = (options) => {
      const callback = () => {
        var _a;
        return (_a = this.clerkjs) == null ? void 0 : _a.__internal_attemptToEnableEnvironmentSetting(options);
      };
      if (this.clerkjs && this.loaded) {
        return callback();
      } else {
        this.premountMethodCalls.set("__internal_attemptToEnableEnvironmentSetting", callback);
      }
    };
    const { Clerk = null, publishableKey } = options || {};
    __privateSet(this, _publishableKey, publishableKey);
    __privateSet(this, _proxyUrl, options == null ? void 0 : options.proxyUrl);
    __privateSet(this, _domain, options == null ? void 0 : options.domain);
    this.options = options;
    this.Clerk = Clerk;
    this.mode = inBrowser2() ? "browser" : "server";
    __privateSet(this, _stateProxy, new StateProxy(this));
    if (!this.options.sdkMetadata) {
      this.options.sdkMetadata = SDK_METADATA;
    }
    __privateGet(this, _eventBus).emit(clerkEvents.Status, "loading");
    __privateGet(this, _eventBus).prioritizedOn(clerkEvents.Status, (status) => __privateSet(this, _status, status));
    if (__privateGet(this, _publishableKey)) {
      void this.loadClerkJS();
    }
  }
  get publishableKey() {
    return __privateGet(this, _publishableKey);
  }
  get loaded() {
    var _a;
    return ((_a = this.clerkjs) == null ? void 0 : _a.loaded) || false;
  }
  get status() {
    var _a;
    if (!this.clerkjs) {
      return __privateGet(this, _status);
    }
    return ((_a = this.clerkjs) == null ? void 0 : _a.status) || /**
     * Support older clerk-js versions.
     * If clerk-js is available but `.status` is missing it we need to fallback to `.loaded`.
     * Since "degraded" an "error" did not exist before,
     * map "loaded" to "ready" and "not loaded" to "loading".
     */
    (this.clerkjs.loaded ? "ready" : "loading");
  }
  static getOrCreateInstance(options) {
    if (!inBrowser2() || !__privateGet(this, _instance) || options.Clerk && __privateGet(this, _instance).Clerk !== options.Clerk || // Allow hot swapping PKs on the client
    __privateGet(this, _instance).publishableKey !== options.publishableKey) {
      __privateSet(this, _instance, new _IsomorphicClerk(options));
    }
    return __privateGet(this, _instance);
  }
  static clearInstance() {
    __privateSet(this, _instance, null);
  }
  get domain() {
    if (typeof window !== "undefined" && window.location) {
      return handleValueOrFn(__privateGet(this, _domain), new URL(window.location.href), "");
    }
    if (typeof __privateGet(this, _domain) === "function") {
      return errorThrower.throw(unsupportedNonBrowserDomainOrProxyUrlFunction);
    }
    return __privateGet(this, _domain) || "";
  }
  get proxyUrl() {
    if (typeof window !== "undefined" && window.location) {
      return handleValueOrFn(__privateGet(this, _proxyUrl), new URL(window.location.href), "");
    }
    if (typeof __privateGet(this, _proxyUrl) === "function") {
      return errorThrower.throw(unsupportedNonBrowserDomainOrProxyUrlFunction);
    }
    return __privateGet(this, _proxyUrl) || "";
  }
  /**
   * Accesses private options from the `Clerk` instance and defaults to
   * `IsomorphicClerk` options when in SSR context.
   *  @internal
   */
  __internal_getOption(key) {
    var _a, _b;
    return ((_a = this.clerkjs) == null ? void 0 : _a.__internal_getOption) ? (_b = this.clerkjs) == null ? void 0 : _b.__internal_getOption(key) : this.options[key];
  }
  get sdkMetadata() {
    var _a;
    return ((_a = this.clerkjs) == null ? void 0 : _a.sdkMetadata) || this.options.sdkMetadata || void 0;
  }
  get instanceType() {
    var _a;
    return (_a = this.clerkjs) == null ? void 0 : _a.instanceType;
  }
  get frontendApi() {
    var _a;
    return ((_a = this.clerkjs) == null ? void 0 : _a.frontendApi) || "";
  }
  get isStandardBrowser() {
    var _a;
    return ((_a = this.clerkjs) == null ? void 0 : _a.isStandardBrowser) || this.options.standardBrowser || false;
  }
  get __internal_queryClient() {
    var _a;
    return (_a = this.clerkjs) == null ? void 0 : _a.__internal_queryClient;
  }
  get isSatellite() {
    if (typeof window !== "undefined" && window.location) {
      return handleValueOrFn(this.options.isSatellite, new URL(window.location.href), false);
    }
    if (typeof this.options.isSatellite === "function") {
      return errorThrower.throw(unsupportedNonBrowserDomainOrProxyUrlFunction);
    }
    return false;
  }
  async loadClerkJS() {
    var _a;
    if (this.mode !== "browser" || this.loaded) {
      return;
    }
    if (typeof window !== "undefined") {
      window.__clerk_publishable_key = __privateGet(this, _publishableKey);
      window.__clerk_proxy_url = this.proxyUrl;
      window.__clerk_domain = this.domain;
    }
    try {
      if (this.Clerk) {
        let c;
        if (isConstructor(this.Clerk)) {
          c = new this.Clerk(__privateGet(this, _publishableKey), {
            proxyUrl: this.proxyUrl,
            domain: this.domain
          });
          this.beforeLoad(c);
          await c.load(this.options);
        } else {
          c = this.Clerk;
          if (!c.loaded) {
            this.beforeLoad(c);
            await c.load(this.options);
          }
        }
        global.Clerk = c;
      } else if (!__BUILD_DISABLE_RHC__) {
        if (!global.Clerk) {
          await loadClerkJsScript({
            ...this.options,
            publishableKey: __privateGet(this, _publishableKey),
            proxyUrl: this.proxyUrl,
            domain: this.domain,
            nonce: this.options.nonce
          });
        }
        if (!global.Clerk) {
          throw new Error("Failed to download latest ClerkJS. Contact support@clerk.com.");
        }
        this.beforeLoad(global.Clerk);
        await global.Clerk.load(this.options);
      }
      if ((_a = global.Clerk) == null ? void 0 : _a.loaded) {
        return this.hydrateClerkJS(global.Clerk);
      }
      return;
    } catch (err) {
      const error = err;
      __privateGet(this, _eventBus).emit(clerkEvents.Status, "error");
      console.error(error.stack || error.message || error);
      return;
    }
  }
  get version() {
    var _a;
    return (_a = this.clerkjs) == null ? void 0 : _a.version;
  }
  get client() {
    if (this.clerkjs) {
      return this.clerkjs.client;
    } else {
      return void 0;
    }
  }
  get session() {
    if (this.clerkjs) {
      return this.clerkjs.session;
    } else {
      return void 0;
    }
  }
  get user() {
    if (this.clerkjs) {
      return this.clerkjs.user;
    } else {
      return void 0;
    }
  }
  get organization() {
    if (this.clerkjs) {
      return this.clerkjs.organization;
    } else {
      return void 0;
    }
  }
  get telemetry() {
    if (this.clerkjs) {
      return this.clerkjs.telemetry;
    } else {
      return void 0;
    }
  }
  get __unstable__environment() {
    if (this.clerkjs) {
      return this.clerkjs.__unstable__environment;
    } else {
      return void 0;
    }
  }
  get isSignedIn() {
    if (this.clerkjs) {
      return this.clerkjs.isSignedIn;
    } else {
      return false;
    }
  }
  get billing() {
    var _a;
    return (_a = this.clerkjs) == null ? void 0 : _a.billing;
  }
  get __internal_state() {
    return this.loaded && this.clerkjs ? this.clerkjs.__internal_state : __privateGet(this, _stateProxy);
  }
  get apiKeys() {
    var _a;
    return (_a = this.clerkjs) == null ? void 0 : _a.apiKeys;
  }
  __unstable__setEnvironment(...args) {
    if (this.clerkjs && "__unstable__setEnvironment" in this.clerkjs) {
      this.clerkjs.__unstable__setEnvironment(args);
    } else {
      return void 0;
    }
  }
};
_status = new WeakMap();
_domain = new WeakMap();
_proxyUrl = new WeakMap();
_publishableKey = new WeakMap();
_eventBus = new WeakMap();
_stateProxy = new WeakMap();
_instance = new WeakMap();
_IsomorphicClerk_instances = new WeakSet();
waitForClerkJS_fn = function() {
  return new Promise((resolve) => {
    this.addOnLoaded(() => resolve(this.clerkjs));
  });
};
__privateAdd(_IsomorphicClerk, _instance);
var IsomorphicClerk = _IsomorphicClerk;

// src/contexts/ClerkContextProvider.tsx
function ClerkContextProvider(props) {
  const { isomorphicClerkOptions, initialState, children } = props;
  const { isomorphicClerk: clerk, clerkStatus } = useLoadedIsomorphicClerk(isomorphicClerkOptions);
  const [state, setState] = React5.useState({
    client: clerk.client,
    session: clerk.session,
    user: clerk.user,
    organization: clerk.organization
  });
  React5.useEffect(() => {
    return clerk.addListener((e) => setState({ ...e }));
  }, []);
  const derivedState = deriveState(clerk.loaded, state, initialState);
  const clerkCtx = React5.useMemo(
    () => ({ value: clerk }),
    [
      // Only update the clerk reference on status change
      clerkStatus
    ]
  );
  const clientCtx = React5.useMemo(() => ({ value: state.client }), [state.client]);
  const {
    sessionId,
    sessionStatus,
    sessionClaims,
    session,
    userId,
    user,
    orgId,
    actor,
    organization,
    orgRole,
    orgSlug,
    orgPermissions,
    factorVerificationAge
  } = derivedState;
  const authCtx = React5.useMemo(() => {
    const value = {
      sessionId,
      sessionStatus,
      sessionClaims,
      userId,
      actor,
      orgId,
      orgRole,
      orgSlug,
      orgPermissions,
      factorVerificationAge
    };
    return { value };
  }, [sessionId, sessionStatus, userId, actor, orgId, orgRole, orgSlug, factorVerificationAge, sessionClaims == null ? void 0 : sessionClaims.__raw]);
  const sessionCtx = React5.useMemo(() => ({ value: session }), [sessionId, session]);
  const userCtx = React5.useMemo(() => ({ value: user }), [userId, user]);
  const organizationCtx = React5.useMemo(() => {
    const value = {
      organization
    };
    return { value };
  }, [orgId, organization]);
  return (
    // @ts-expect-error value passed is of type IsomorphicClerk where the context expects LoadedClerk
    /* @__PURE__ */ React5.createElement(IsomorphicClerkContext.Provider, { value: clerkCtx }, /* @__PURE__ */ React5.createElement(ClientContext.Provider, { value: clientCtx }, /* @__PURE__ */ React5.createElement(SessionContext.Provider, { value: sessionCtx }, /* @__PURE__ */ React5.createElement(OrganizationProvider, { ...organizationCtx.value }, /* @__PURE__ */ React5.createElement(AuthContext.Provider, { value: authCtx }, /* @__PURE__ */ React5.createElement(UserContext.Provider, { value: userCtx }, /* @__PURE__ */ React5.createElement(
      CheckoutProvider,
      {
        value: void 0
      },
      children
    )))))))
  );
}
var useLoadedIsomorphicClerk = (options) => {
  const isomorphicClerkRef = React5.useRef(IsomorphicClerk.getOrCreateInstance(options));
  const [clerkStatus, setClerkStatus] = React5.useState(isomorphicClerkRef.current.status);
  React5.useEffect(() => {
    void isomorphicClerkRef.current.__unstable__updateProps({ appearance: options.appearance });
  }, [options.appearance]);
  React5.useEffect(() => {
    void isomorphicClerkRef.current.__unstable__updateProps({ options });
  }, [options.localization]);
  React5.useEffect(() => {
    isomorphicClerkRef.current.on("status", setClerkStatus);
    return () => {
      if (isomorphicClerkRef.current) {
        isomorphicClerkRef.current.off("status", setClerkStatus);
      }
      IsomorphicClerk.clearInstance();
    };
  }, []);
  return { isomorphicClerk: isomorphicClerkRef.current, clerkStatus };
};

// src/contexts/ClerkProvider.tsx
function ClerkProviderBase(props) {
  const { initialState, children, __internal_bypassMissingPublishableKey, ...restIsomorphicClerkOptions } = props;
  const { publishableKey = "", Clerk: userInitialisedClerk } = restIsomorphicClerkOptions;
  if (!userInitialisedClerk && !__internal_bypassMissingPublishableKey) {
    if (!publishableKey) {
      errorThrower.throwMissingPublishableKeyError();
    } else if (publishableKey && !isPublishableKey(publishableKey)) {
      errorThrower.throwInvalidPublishableKeyError({ key: publishableKey });
    }
  }
  return /* @__PURE__ */ React6.createElement(
    ClerkContextProvider,
    {
      initialState,
      isomorphicClerkOptions: restIsomorphicClerkOptions
    },
    children
  );
}
var ClerkProvider = withMaxAllowedInstancesGuard(ClerkProviderBase, "ClerkProvider", multipleClerkProvidersError);
ClerkProvider.displayName = "ClerkProvider";

// src/index.ts
setErrorThrowerOptions({ packageName: "@clerk/clerk-react" });
setClerkJsLoadingErrorPackageName("@clerk/clerk-react");
export {
  APIKeys,
  AuthenticateWithRedirectCallback,
  ClerkDegraded,
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  ClerkProvider,
  CreateOrganization,
  GoogleOneTap,
  OrganizationList,
  OrganizationProfile,
  OrganizationSwitcher,
  PricingTable,
  Protect,
  RedirectToCreateOrganization,
  RedirectToOrganizationProfile,
  RedirectToSignIn,
  RedirectToSignUp,
  RedirectToTasks,
  RedirectToUserProfile,
  SignIn,
  SignInButton,
  SignInWithMetamaskButton,
  SignOutButton,
  SignUp,
  SignUpButton,
  SignedIn,
  SignedOut,
  TaskChooseOrganization,
  TaskResetPassword,
  UserAvatar,
  UserButton,
  UserProfile,
  Waitlist,
  __experimental_CheckoutProvider,
  __experimental_PaymentElement,
  __experimental_PaymentElementProvider,
  __experimental_useCheckout,
  __experimental_usePaymentElement,
  useAuth,
  useClerk,
  useEmailLink,
  useOrganization,
  useOrganizationList,
  useReverification,
  useSession,
  useSessionList,
  useSignIn,
  useSignUp,
  useUser
};
//# sourceMappingURL=index.mjs.map