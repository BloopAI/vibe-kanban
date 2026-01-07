import {
  customLinkWrongProps,
  customMenuItemsIgnoredComponent,
  customPageWrongProps,
  customPagesIgnoredComponent,
  errorThrower,
  multipleChildrenInButtonComponent,
  organizationProfileLinkRenderedError,
  organizationProfilePageRenderedError,
  userButtonIgnoredComponent,
  userButtonMenuActionRenderedError,
  userButtonMenuItemLinkWrongProps,
  userButtonMenuItemsActionWrongsProps,
  userButtonMenuItemsRenderedError,
  userButtonMenuLinkRenderedError,
  userProfileLinkRenderedError,
  userProfilePageRenderedError,
  withClerk
} from "./chunk-OT5FTIRN.mjs";

// src/components/uiComponents.tsx
import { logErrorInDevMode as logErrorInDevMode3 } from "@clerk/shared/utils";
import React7, { createContext, createElement, useContext } from "react";

// src/utils/childrenUtils.tsx
import React from "react";
var assertSingleChild = (children) => (name) => {
  try {
    return React.Children.only(children);
  } catch {
    return errorThrower.throw(multipleChildrenInButtonComponent(name));
  }
};
var normalizeWithDefaultValue = (children, defaultText) => {
  if (!children) {
    children = defaultText;
  }
  if (typeof children === "string") {
    children = /* @__PURE__ */ React.createElement("button", null, children);
  }
  return children;
};
var safeExecute = (cb) => (...args) => {
  if (cb && typeof cb === "function") {
    return cb(...args);
  }
};

// src/utils/isConstructor.ts
function isConstructor(f) {
  return typeof f === "function";
}

// src/utils/useMaxAllowedInstancesGuard.tsx
import React2 from "react";
var counts = /* @__PURE__ */ new Map();
function useMaxAllowedInstancesGuard(name, error, maxCount = 1) {
  React2.useEffect(() => {
    const count = counts.get(name) || 0;
    if (count == maxCount) {
      return errorThrower.throw(error);
    }
    counts.set(name, count + 1);
    return () => {
      counts.set(name, (counts.get(name) || 1) - 1);
    };
  }, []);
}
function withMaxAllowedInstancesGuard(WrappedComponent, name, error) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || name || "Component";
  const Hoc = (props) => {
    useMaxAllowedInstancesGuard(name, error);
    return /* @__PURE__ */ React2.createElement(WrappedComponent, { ...props });
  };
  Hoc.displayName = `withMaxAllowedInstancesGuard(${displayName})`;
  return Hoc;
}

// src/utils/useCustomElementPortal.tsx
import { useState } from "react";
import { createPortal } from "react-dom";
var useCustomElementPortal = (elements) => {
  const [nodeMap, setNodeMap] = useState(/* @__PURE__ */ new Map());
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
      return node ? createPortal(el.component, node) : null;
    }
  }));
};

// src/utils/useCustomPages.tsx
import { logErrorInDevMode } from "@clerk/shared/utils";
import React4 from "react";

// src/utils/componentValidation.ts
import React3 from "react";
var isThatComponent = (v, component) => {
  return !!v && React3.isValidElement(v) && (v == null ? void 0 : v.type) === component;
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
  React4.Children.forEach(children, (child) => {
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
  React4.Children.forEach(children, (child) => {
    if (!isThatComponent(child, PageComponent) && !isThatComponent(child, LinkComponent) && !isThatComponent(child, MenuItemsComponent)) {
      if (child && !allowForAnyChildren) {
        logErrorInDevMode(customPagesIgnoredComponent(componentName));
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
        logErrorInDevMode(customPageWrongProps(componentName));
        return;
      }
    }
    if (isThatComponent(child, LinkComponent)) {
      if (isExternalLink(props)) {
        validChildren.push({ label, labelIcon, url });
      } else {
        logErrorInDevMode(customLinkWrongProps(componentName));
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
import { logErrorInDevMode as logErrorInDevMode2 } from "@clerk/shared/utils";
import React5 from "react";
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
  React5.Children.forEach(children, (child) => {
    if (!isThatComponent(child, MenuItemsComponent) && !isThatComponent(child, UserProfileLinkComponent) && !isThatComponent(child, UserProfilePageComponent)) {
      if (child && !allowForAnyChildren) {
        logErrorInDevMode2(userButtonIgnoredComponent);
      }
      return;
    }
    if (isThatComponent(child, UserProfileLinkComponent) || isThatComponent(child, UserProfilePageComponent)) {
      return;
    }
    const { props } = child;
    React5.Children.forEach(props.children, (child2) => {
      if (!isThatComponent(child2, MenuActionComponent) && !isThatComponent(child2, MenuLinkComponent)) {
        if (child2) {
          logErrorInDevMode2(customMenuItemsIgnoredComponent);
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
            logErrorInDevMode2("Custom menu item must have either onClick or open property");
            return;
          }
        } else {
          logErrorInDevMode2(userButtonMenuItemsActionWrongsProps);
          return;
        }
      }
      if (isThatComponent(child2, MenuLinkComponent)) {
        if (isExternalLink2(props2)) {
          validChildren.push({ label, labelIcon, href });
        } else {
          logErrorInDevMode2(userButtonMenuItemLinkWrongProps);
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

// src/utils/useWaitForComponentMount.ts
import { useEffect, useRef, useState as useState2 } from "react";
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
  const watcherRef = useRef();
  const [status, setStatus] = useState2("rendering");
  useEffect(() => {
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
import { without } from "@clerk/shared/object";
import { isDeeplyEqual } from "@clerk/shared/react";
import React6 from "react";
var isMountProps = (props) => {
  return "mount" in props;
};
var isOpenProps = (props) => {
  return "open" in props;
};
var stripMenuItemIconHandlers = (menuItems) => {
  return menuItems == null ? void 0 : menuItems.map(({ mountIcon, unmountIcon, ...rest }) => rest);
};
var ClerkHostRenderer = class extends React6.PureComponent {
  constructor() {
    super(...arguments);
    this.rootRef = React6.createRef();
  }
  componentDidUpdate(_prevProps) {
    var _a, _b, _c, _d;
    if (!isMountProps(_prevProps) || !isMountProps(this.props)) {
      return;
    }
    const prevProps = without(_prevProps.props, "customPages", "customMenuItems", "children");
    const newProps = without(this.props.props, "customPages", "customMenuItems", "children");
    const customPagesChanged = ((_a = prevProps.customPages) == null ? void 0 : _a.length) !== ((_b = newProps.customPages) == null ? void 0 : _b.length);
    const customMenuItemsChanged = ((_c = prevProps.customMenuItems) == null ? void 0 : _c.length) !== ((_d = newProps.customMenuItems) == null ? void 0 : _d.length);
    const prevMenuItemsWithoutHandlers = stripMenuItemIconHandlers(_prevProps.props.customMenuItems);
    const newMenuItemsWithoutHandlers = stripMenuItemIconHandlers(this.props.props.customMenuItems);
    if (!isDeeplyEqual(prevProps, newProps) || !isDeeplyEqual(prevMenuItemsWithoutHandlers, newMenuItemsWithoutHandlers) || customPagesChanged || customMenuItemsChanged) {
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
    return /* @__PURE__ */ React6.createElement(React6.Fragment, null, !hideRootHtmlElement && /* @__PURE__ */ React6.createElement("div", { ...rootAttributes }), this.props.children);
  }
};

// src/components/uiComponents.tsx
var CustomPortalsRenderer = (props) => {
  var _a, _b;
  return /* @__PURE__ */ React7.createElement(React7.Fragment, null, (_a = props == null ? void 0 : props.customPagesPortals) == null ? void 0 : _a.map((portal, index) => createElement(portal, { key: index })), (_b = props == null ? void 0 : props.customMenuItemsPortals) == null ? void 0 : _b.map((portal, index) => createElement(portal, { key: index })));
};
var SignIn = withClerk(
  ({ clerk, component, fallback, ...props }) => {
    const mountingStatus = useWaitForComponentMount(component);
    const shouldShowFallback = mountingStatus === "rendering" || !clerk.loaded;
    const rendererRootProps = {
      ...shouldShowFallback && fallback && { style: { display: "none" } }
    };
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
  logErrorInDevMode3(userProfilePageRenderedError);
  return /* @__PURE__ */ React7.createElement(React7.Fragment, null, children);
}
function UserProfileLink({ children }) {
  logErrorInDevMode3(userProfileLinkRenderedError);
  return /* @__PURE__ */ React7.createElement(React7.Fragment, null, children);
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, /* @__PURE__ */ React7.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountUserProfile,
        unmount: clerk.unmountUserProfile,
        updateProps: clerk.__unstable__updateProps,
        props: { ...props, customPages },
        rootProps: rendererRootProps
      },
      /* @__PURE__ */ React7.createElement(CustomPortalsRenderer, { customPagesPortals })
    ));
  },
  { component: "UserProfile", renderWhileLoading: true }
);
var UserProfile = Object.assign(_UserProfile, {
  Page: UserProfilePage,
  Link: UserProfileLink
});
var UserButtonContext = createContext({
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
    return /* @__PURE__ */ React7.createElement(UserButtonContext.Provider, { value: passableProps }, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
      ClerkHostRenderer,
      {
        component,
        ...passableProps,
        hideRootHtmlElement: !!props.__experimental_asProvider,
        rootProps: rendererRootProps
      },
      props.__experimental_asProvider ? sanitizedChildren : null,
      /* @__PURE__ */ React7.createElement(CustomPortalsRenderer, { ...portalProps })
    ));
  },
  { component: "UserButton", renderWhileLoading: true }
);
function MenuItems({ children }) {
  logErrorInDevMode3(userButtonMenuItemsRenderedError);
  return /* @__PURE__ */ React7.createElement(React7.Fragment, null, children);
}
function MenuAction({ children }) {
  logErrorInDevMode3(userButtonMenuActionRenderedError);
  return /* @__PURE__ */ React7.createElement(React7.Fragment, null, children);
}
function MenuLink({ children }) {
  logErrorInDevMode3(userButtonMenuLinkRenderedError);
  return /* @__PURE__ */ React7.createElement(React7.Fragment, null, children);
}
function UserButtonOutlet(outletProps) {
  const providerProps = useContext(UserButtonContext);
  const portalProps = {
    ...providerProps,
    props: {
      ...providerProps.props,
      ...outletProps
    }
  };
  return /* @__PURE__ */ React7.createElement(ClerkHostRenderer, { ...portalProps });
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
  logErrorInDevMode3(organizationProfilePageRenderedError);
  return /* @__PURE__ */ React7.createElement(React7.Fragment, null, children);
}
function OrganizationProfileLink({ children }) {
  logErrorInDevMode3(organizationProfileLinkRenderedError);
  return /* @__PURE__ */ React7.createElement(React7.Fragment, null, children);
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
      ClerkHostRenderer,
      {
        component,
        mount: clerk.mountOrganizationProfile,
        unmount: clerk.unmountOrganizationProfile,
        updateProps: clerk.__unstable__updateProps,
        props: { ...props, customPages },
        rootProps: rendererRootProps
      },
      /* @__PURE__ */ React7.createElement(CustomPortalsRenderer, { customPagesPortals })
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
var OrganizationSwitcherContext = createContext({
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
    return /* @__PURE__ */ React7.createElement(OrganizationSwitcherContext.Provider, { value: passableProps }, /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
      ClerkHostRenderer,
      {
        ...passableProps,
        hideRootHtmlElement: !!props.__experimental_asProvider
      },
      props.__experimental_asProvider ? sanitizedChildren : null,
      /* @__PURE__ */ React7.createElement(CustomPortalsRenderer, { customPagesPortals })
    )));
  },
  { component: "OrganizationSwitcher", renderWhileLoading: true }
);
function OrganizationSwitcherOutlet(outletProps) {
  const providerProps = useContext(OrganizationSwitcherContext);
  const portalProps = {
    ...providerProps,
    props: {
      ...providerProps.props,
      ...outletProps
    }
  };
  return /* @__PURE__ */ React7.createElement(ClerkHostRenderer, { ...portalProps });
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, shouldShowFallback && fallback, clerk.loaded && /* @__PURE__ */ React7.createElement(
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

export {
  assertSingleChild,
  normalizeWithDefaultValue,
  safeExecute,
  isConstructor,
  withMaxAllowedInstancesGuard,
  SignIn,
  SignUp,
  UserProfile,
  UserButton,
  OrganizationProfile,
  CreateOrganization,
  OrganizationSwitcher,
  OrganizationList,
  GoogleOneTap,
  Waitlist,
  PricingTable,
  APIKeys,
  UserAvatar,
  TaskChooseOrganization,
  TaskResetPassword
};
//# sourceMappingURL=chunk-6WD75OPE.mjs.map