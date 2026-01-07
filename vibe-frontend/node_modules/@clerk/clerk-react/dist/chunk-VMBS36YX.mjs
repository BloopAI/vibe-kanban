import {
  useAssertWrappedByClerkProvider,
  useAuth,
  useIsomorphicClerkContext,
  withClerk
} from "./chunk-OT5FTIRN.mjs";

// src/components/controlComponents.tsx
import { deprecated } from "@clerk/shared/deprecated";
import React from "react";

// src/contexts/SessionContext.tsx
import { SessionContext, useSessionContext } from "@clerk/shared/react";

// src/components/controlComponents.tsx
var SignedIn = ({ children, treatPendingAsSignedOut }) => {
  useAssertWrappedByClerkProvider("SignedIn");
  const { userId } = useAuth({ treatPendingAsSignedOut });
  if (userId) {
    return children;
  }
  return null;
};
var SignedOut = ({ children, treatPendingAsSignedOut }) => {
  useAssertWrappedByClerkProvider("SignedOut");
  const { userId } = useAuth({ treatPendingAsSignedOut });
  if (userId === null) {
    return children;
  }
  return null;
};
var ClerkLoaded = ({ children }) => {
  useAssertWrappedByClerkProvider("ClerkLoaded");
  const isomorphicClerk = useIsomorphicClerkContext();
  if (!isomorphicClerk.loaded) {
    return null;
  }
  return children;
};
var ClerkLoading = ({ children }) => {
  useAssertWrappedByClerkProvider("ClerkLoading");
  const isomorphicClerk = useIsomorphicClerkContext();
  if (isomorphicClerk.status !== "loading") {
    return null;
  }
  return children;
};
var ClerkFailed = ({ children }) => {
  useAssertWrappedByClerkProvider("ClerkFailed");
  const isomorphicClerk = useIsomorphicClerkContext();
  if (isomorphicClerk.status !== "error") {
    return null;
  }
  return children;
};
var ClerkDegraded = ({ children }) => {
  useAssertWrappedByClerkProvider("ClerkDegraded");
  const isomorphicClerk = useIsomorphicClerkContext();
  if (isomorphicClerk.status !== "degraded") {
    return null;
  }
  return children;
};
var Protect = ({ children, fallback, treatPendingAsSignedOut, ...restAuthorizedParams }) => {
  useAssertWrappedByClerkProvider("Protect");
  const { isLoaded, has, userId } = useAuth({ treatPendingAsSignedOut });
  if (!isLoaded) {
    return null;
  }
  const unauthorized = fallback != null ? fallback : null;
  const authorized = children;
  if (!userId) {
    return unauthorized;
  }
  if (typeof restAuthorizedParams.condition === "function") {
    if (restAuthorizedParams.condition(has)) {
      return authorized;
    }
    return unauthorized;
  }
  if (restAuthorizedParams.role || restAuthorizedParams.permission || restAuthorizedParams.feature || restAuthorizedParams.plan) {
    if (has(restAuthorizedParams)) {
      return authorized;
    }
    return unauthorized;
  }
  return authorized;
};
var RedirectToSignIn = withClerk(({ clerk, ...props }) => {
  const { client, session } = clerk;
  const hasSignedInSessions = client.signedInSessions ? client.signedInSessions.length > 0 : (
    // Compat for clerk-js<5.54.0 (which was released with the `signedInSessions` property)
    client.activeSessions && client.activeSessions.length > 0
  );
  React.useEffect(() => {
    if (session === null && hasSignedInSessions) {
      void clerk.redirectToAfterSignOut();
    } else {
      void clerk.redirectToSignIn(props);
    }
  }, []);
  return null;
}, "RedirectToSignIn");
var RedirectToSignUp = withClerk(({ clerk, ...props }) => {
  React.useEffect(() => {
    void clerk.redirectToSignUp(props);
  }, []);
  return null;
}, "RedirectToSignUp");
var RedirectToTasks = withClerk(({ clerk, ...props }) => {
  React.useEffect(() => {
    void clerk.redirectToTasks(props);
  }, []);
  return null;
}, "RedirectToTasks");
var RedirectToUserProfile = withClerk(({ clerk }) => {
  React.useEffect(() => {
    deprecated("RedirectToUserProfile", "Use the `redirectToUserProfile()` method instead.");
    void clerk.redirectToUserProfile();
  }, []);
  return null;
}, "RedirectToUserProfile");
var RedirectToOrganizationProfile = withClerk(({ clerk }) => {
  React.useEffect(() => {
    deprecated("RedirectToOrganizationProfile", "Use the `redirectToOrganizationProfile()` method instead.");
    void clerk.redirectToOrganizationProfile();
  }, []);
  return null;
}, "RedirectToOrganizationProfile");
var RedirectToCreateOrganization = withClerk(({ clerk }) => {
  React.useEffect(() => {
    deprecated("RedirectToCreateOrganization", "Use the `redirectToCreateOrganization()` method instead.");
    void clerk.redirectToCreateOrganization();
  }, []);
  return null;
}, "RedirectToCreateOrganization");
var AuthenticateWithRedirectCallback = withClerk(
  ({ clerk, ...handleRedirectCallbackParams }) => {
    React.useEffect(() => {
      void clerk.handleRedirectCallback(handleRedirectCallbackParams);
    }, []);
    return null;
  },
  "AuthenticateWithRedirectCallback"
);
var MultisessionAppSupport = ({ children }) => {
  useAssertWrappedByClerkProvider("MultisessionAppSupport");
  const session = useSessionContext();
  return /* @__PURE__ */ React.createElement(React.Fragment, { key: session ? session.id : "no-users" }, children);
};

export {
  SignedIn,
  SignedOut,
  ClerkLoaded,
  ClerkLoading,
  ClerkFailed,
  ClerkDegraded,
  Protect,
  RedirectToSignIn,
  RedirectToSignUp,
  RedirectToTasks,
  RedirectToUserProfile,
  RedirectToOrganizationProfile,
  RedirectToCreateOrganization,
  AuthenticateWithRedirectCallback,
  MultisessionAppSupport
};
//# sourceMappingURL=chunk-VMBS36YX.mjs.map