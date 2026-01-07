import posthogJs from 'posthog-js';
import React, { createContext, useRef, useMemo, useEffect, useContext, useState, useCallback, Children } from 'react';

var PostHogContext = createContext({
    client: posthogJs,
    bootstrap: undefined,
});

function isDeepEqual(obj1, obj2, visited) {
    if (visited === void 0) { visited = new WeakMap(); }
    if (obj1 === obj2) {
        return true;
    }
    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return false;
    }
    if (visited.has(obj1) && visited.get(obj1) === obj2) {
        return true;
    }
    visited.set(obj1, obj2);
    var keys1 = Object.keys(obj1);
    var keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    for (var _i = 0, keys1_1 = keys1; _i < keys1_1.length; _i++) {
        var key = keys1_1[_i];
        if (!keys2.includes(key)) {
            return false;
        }
        if (!isDeepEqual(obj1[key], obj2[key], visited)) {
            return false;
        }
    }
    return true;
}

function PostHogProvider(_a) {
    var _b, _c;
    var children = _a.children, client = _a.client, apiKey = _a.apiKey, options = _a.options;
    var previousInitializationRef = useRef(null);
    var posthog = useMemo(function () {
        if (client) {
            if (apiKey) {
                console.warn('[PostHog.js] You have provided both `client` and `apiKey` to `PostHogProvider`. `apiKey` will be ignored in favour of `client`.');
            }
            if (options) {
                console.warn('[PostHog.js] You have provided both `client` and `options` to `PostHogProvider`. `options` will be ignored in favour of `client`.');
            }
            return client;
        }
        if (apiKey) {
            return posthogJs;
        }
        console.warn('[PostHog.js] No `apiKey` or `client` were provided to `PostHogProvider`. Using default global `window.posthog` instance. You must initialize it manually. This is not recommended behavior.');
        return posthogJs;
    }, [client, apiKey, JSON.stringify(options)]);
    useEffect(function () {
        if (client) {
            return;
        }
        var previousInitialization = previousInitializationRef.current;
        if (!previousInitialization) {
            if (posthogJs.__loaded) {
                console.warn('[PostHog.js] `posthog` was already loaded elsewhere. This may cause issues.');
            }
            posthogJs.init(apiKey, options);
            previousInitializationRef.current = {
                apiKey: apiKey,
                options: options !== null && options !== void 0 ? options : {},
            };
        }
        else {
            if (apiKey !== previousInitialization.apiKey) {
                console.warn("[PostHog.js] You have provided a different `apiKey` to `PostHogProvider` than the one that was already initialized. This is not supported by our provider and we'll keep using the previous key. If you need to toggle between API Keys you need to control the `client` yourself and pass it in as a prop rather than an `apiKey` prop.");
            }
            if (options && !isDeepEqual(options, previousInitialization.options)) {
                posthogJs.set_config(options);
            }
            previousInitializationRef.current = {
                apiKey: apiKey,
                options: options !== null && options !== void 0 ? options : {},
            };
        }
    }, [client, apiKey, JSON.stringify(options)]);
    return (React.createElement(PostHogContext.Provider, { value: { client: posthog, bootstrap: (_b = options === null || options === void 0 ? void 0 : options.bootstrap) !== null && _b !== void 0 ? _b : (_c = client === null || client === void 0 ? void 0 : client.config) === null || _c === void 0 ? void 0 : _c.bootstrap } }, children));
}

var isFunction = function (f) {
    return typeof f === 'function';
};
var isUndefined = function (x) {
    return x === void 0;
};
var isNull = function (x) {
    return x === null;
};

function useFeatureFlagEnabled(flag) {
    var _a, _b;
    var _c = useContext(PostHogContext), client = _c.client, bootstrap = _c.bootstrap;
    var _d = useState(function () { return client.isFeatureEnabled(flag); }), featureEnabled = _d[0], setFeatureEnabled = _d[1];
    useEffect(function () {
        return client.onFeatureFlags(function () {
            setFeatureEnabled(client.isFeatureEnabled(flag));
        });
    }, [client, flag]);
    var bootstrapped = (_a = bootstrap === null || bootstrap === void 0 ? void 0 : bootstrap.featureFlags) === null || _a === void 0 ? void 0 : _a[flag];
    if (!((_b = client === null || client === void 0 ? void 0 : client.featureFlags) === null || _b === void 0 ? void 0 : _b.hasLoadedFlags) && (bootstrap === null || bootstrap === void 0 ? void 0 : bootstrap.featureFlags)) {
        return isUndefined(bootstrapped) ? undefined : !!bootstrapped;
    }
    return featureEnabled;
}

function useFeatureFlagPayload(flag) {
    var _a;
    var _b = useContext(PostHogContext), client = _b.client, bootstrap = _b.bootstrap;
    var _c = useState(function () { return client.getFeatureFlagPayload(flag); }), featureFlagPayload = _c[0], setFeatureFlagPayload = _c[1];
    useEffect(function () {
        return client.onFeatureFlags(function () {
            setFeatureFlagPayload(client.getFeatureFlagPayload(flag));
        });
    }, [client, flag]);
    if (!((_a = client === null || client === void 0 ? void 0 : client.featureFlags) === null || _a === void 0 ? void 0 : _a.hasLoadedFlags) && (bootstrap === null || bootstrap === void 0 ? void 0 : bootstrap.featureFlagPayloads)) {
        return bootstrap.featureFlagPayloads[flag];
    }
    return featureFlagPayload;
}

function useActiveFeatureFlags() {
    var _a;
    var _b = useContext(PostHogContext), client = _b.client, bootstrap = _b.bootstrap;
    var _c = useState(function () { return client.featureFlags.getFlags(); }), featureFlags = _c[0], setFeatureFlags = _c[1];
    useEffect(function () {
        return client.onFeatureFlags(function (flags) {
            setFeatureFlags(flags);
        });
    }, [client]);
    if (!((_a = client === null || client === void 0 ? void 0 : client.featureFlags) === null || _a === void 0 ? void 0 : _a.hasLoadedFlags) && (bootstrap === null || bootstrap === void 0 ? void 0 : bootstrap.featureFlags)) {
        return Object.keys(bootstrap.featureFlags);
    }
    return featureFlags;
}

function useFeatureFlagVariantKey(flag) {
    var _a;
    var _b = useContext(PostHogContext), client = _b.client, bootstrap = _b.bootstrap;
    var _c = useState(function () {
        return client.getFeatureFlag(flag);
    }), featureFlagVariantKey = _c[0], setFeatureFlagVariantKey = _c[1];
    useEffect(function () {
        return client.onFeatureFlags(function () {
            setFeatureFlagVariantKey(client.getFeatureFlag(flag));
        });
    }, [client, flag]);
    if (!((_a = client === null || client === void 0 ? void 0 : client.featureFlags) === null || _a === void 0 ? void 0 : _a.hasLoadedFlags) && (bootstrap === null || bootstrap === void 0 ? void 0 : bootstrap.featureFlags)) {
        return bootstrap.featureFlags[flag];
    }
    return featureFlagVariantKey;
}

var usePostHog = function () {
    var client = useContext(PostHogContext).client;
    return client;
};

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    if (typeof b !== "function" && b !== null)
        throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

function VisibilityAndClickTracker(_a) {
    var children = _a.children, onIntersect = _a.onIntersect, onClick = _a.onClick, trackView = _a.trackView, options = _a.options, props = __rest(_a, ["children", "onIntersect", "onClick", "trackView", "options"]);
    var ref = useRef(null);
    var observerOptions = useMemo(function () { return (__assign({ threshold: 0.1 }, options)); }, [options === null || options === void 0 ? void 0 : options.threshold, options === null || options === void 0 ? void 0 : options.root, options === null || options === void 0 ? void 0 : options.rootMargin]);
    useEffect(function () {
        if (isNull(ref.current) || !trackView)
            return;
        var observer = new IntersectionObserver(function (_a) {
            var entry = _a[0];
            return onIntersect(entry);
        }, observerOptions);
        observer.observe(ref.current);
        return function () { return observer.disconnect(); };
    }, [observerOptions, trackView, onIntersect]);
    return (React.createElement("div", __assign({ ref: ref }, props, { onClick: onClick }), children));
}

function VisibilityAndClickTrackers(_a) {
    var children = _a.children, trackInteraction = _a.trackInteraction, trackView = _a.trackView, options = _a.options, onInteract = _a.onInteract, onView = _a.onView, props = __rest(_a, ["children", "trackInteraction", "trackView", "options", "onInteract", "onView"]);
    var clickTrackedRef = useRef(false);
    var visibilityTrackedRef = useRef(false);
    var cachedOnClick = useCallback(function () {
        if (!clickTrackedRef.current && trackInteraction && onInteract) {
            onInteract();
            clickTrackedRef.current = true;
        }
    }, [trackInteraction, onInteract]);
    var onIntersect = function (entry) {
        if (!visibilityTrackedRef.current && entry.isIntersecting && onView) {
            onView();
            visibilityTrackedRef.current = true;
        }
    };
    var trackedChildren = Children.map(children, function (child) {
        return (React.createElement(VisibilityAndClickTracker, __assign({ onClick: cachedOnClick, onIntersect: onIntersect, trackView: trackView, options: options }, props), child));
    });
    return React.createElement(React.Fragment, null, trackedChildren);
}

function PostHogFeature(_a) {
    var flag = _a.flag, match = _a.match, children = _a.children, fallback = _a.fallback, visibilityObserverOptions = _a.visibilityObserverOptions, trackInteraction = _a.trackInteraction, trackView = _a.trackView, props = __rest(_a, ["flag", "match", "children", "fallback", "visibilityObserverOptions", "trackInteraction", "trackView"]);
    var payload = useFeatureFlagPayload(flag);
    var variant = useFeatureFlagVariantKey(flag);
    var posthog = usePostHog();
    var shouldTrackInteraction = trackInteraction !== null && trackInteraction !== void 0 ? trackInteraction : true;
    var shouldTrackView = trackView !== null && trackView !== void 0 ? trackView : true;
    if (isUndefined(match) || variant === match) {
        var childNode = isFunction(children) ? children(payload) : children;
        return (React.createElement(VisibilityAndClickTrackers, __assign({ flag: flag, options: visibilityObserverOptions, trackInteraction: shouldTrackInteraction, trackView: shouldTrackView, onInteract: function () { return captureFeatureInteraction({ flag: flag, posthog: posthog, flagVariant: variant }); }, onView: function () { return captureFeatureView({ flag: flag, posthog: posthog, flagVariant: variant }); } }, props), childNode));
    }
    return React.createElement(React.Fragment, null, fallback);
}
function captureFeatureInteraction(_a) {
    var _b;
    var flag = _a.flag, posthog = _a.posthog, flagVariant = _a.flagVariant;
    var properties = {
        feature_flag: flag,
        $set: (_b = {}, _b["$feature_interaction/".concat(flag)] = flagVariant !== null && flagVariant !== void 0 ? flagVariant : true, _b),
    };
    if (typeof flagVariant === 'string') {
        properties.feature_flag_variant = flagVariant;
    }
    posthog.capture('$feature_interaction', properties);
}
function captureFeatureView(_a) {
    var _b;
    var flag = _a.flag, posthog = _a.posthog, flagVariant = _a.flagVariant;
    var properties = {
        feature_flag: flag,
        $set: (_b = {}, _b["$feature_view/".concat(flag)] = flagVariant !== null && flagVariant !== void 0 ? flagVariant : true, _b),
    };
    if (typeof flagVariant === 'string') {
        properties.feature_flag_variant = flagVariant;
    }
    posthog.capture('$feature_view', properties);
}

function TrackedChild(_a) {
    var child = _a.child, index = _a.index, name = _a.name, properties = _a.properties, observerOptions = _a.observerOptions;
    var trackedRef = useRef(false);
    var posthog = usePostHog();
    var onIntersect = useCallback(function (entry) {
        if (entry.isIntersecting && !trackedRef.current) {
            posthog.capture('$element_viewed', __assign({ element_name: name, child_index: index }, properties));
            trackedRef.current = true;
        }
    }, [posthog, name, index, properties]);
    return (React.createElement(VisibilityAndClickTracker, { onIntersect: onIntersect, trackView: true, options: observerOptions }, child));
}
function PostHogCaptureOnViewed(_a) {
    var name = _a.name, properties = _a.properties, observerOptions = _a.observerOptions, trackAllChildren = _a.trackAllChildren, children = _a.children, props = __rest(_a, ["name", "properties", "observerOptions", "trackAllChildren", "children"]);
    var trackedRef = useRef(false);
    var posthog = usePostHog();
    var onIntersect = useCallback(function (entry) {
        if (entry.isIntersecting && !trackedRef.current) {
            posthog.capture('$element_viewed', __assign({ element_name: name }, properties));
            trackedRef.current = true;
        }
    }, [posthog, name, properties]);
    if (trackAllChildren) {
        var trackedChildren = Children.map(children, function (child, index) {
            return (React.createElement(TrackedChild, { key: index, child: child, index: index, name: name, properties: properties, observerOptions: observerOptions }));
        });
        return React.createElement("div", __assign({}, props), trackedChildren);
    }
    return (React.createElement(VisibilityAndClickTracker, __assign({ onIntersect: onIntersect, trackView: true, options: observerOptions }, props), children));
}

var INITIAL_STATE = {
    componentStack: null,
    exceptionEvent: null,
    error: null,
};
var __POSTHOG_ERROR_MESSAGES = {
    INVALID_FALLBACK: '[PostHog.js][PostHogErrorBoundary] Invalid fallback prop, provide a valid React element or a function that returns a valid React element.',
};
var PostHogErrorBoundary = (function (_super) {
    __extends(PostHogErrorBoundary, _super);
    function PostHogErrorBoundary(props) {
        var _this = _super.call(this, props) || this;
        _this.state = INITIAL_STATE;
        return _this;
    }
    PostHogErrorBoundary.prototype.componentDidCatch = function (error, errorInfo) {
        var additionalProperties = this.props.additionalProperties;
        var currentProperties;
        if (isFunction(additionalProperties)) {
            currentProperties = additionalProperties(error);
        }
        else if (typeof additionalProperties === 'object') {
            currentProperties = additionalProperties;
        }
        var client = this.context.client;
        var exceptionEvent = client.captureException(error, currentProperties);
        var componentStack = errorInfo.componentStack;
        this.setState({
            error: error,
            componentStack: componentStack !== null && componentStack !== void 0 ? componentStack : null,
            exceptionEvent: exceptionEvent,
        });
    };
    PostHogErrorBoundary.prototype.render = function () {
        var _a = this.props, children = _a.children, fallback = _a.fallback;
        var state = this.state;
        if (state.componentStack == null) {
            return isFunction(children) ? children() : children;
        }
        var element = isFunction(fallback)
            ? React.createElement(fallback, {
                error: state.error,
                componentStack: state.componentStack,
                exceptionEvent: state.exceptionEvent,
            })
            : fallback;
        if (React.isValidElement(element)) {
            return element;
        }
        console.warn(__POSTHOG_ERROR_MESSAGES.INVALID_FALLBACK);
        return React.createElement(React.Fragment, null);
    };
    PostHogErrorBoundary.contextType = PostHogContext;
    return PostHogErrorBoundary;
}(React.Component));

var setupReactErrorHandler = function (client, callback) {
    return function (error, errorInfo) {
        var event = client.captureException(error);
        if (callback) {
            callback(event, error, errorInfo);
        }
    };
};

export { PostHogCaptureOnViewed, PostHogContext, PostHogErrorBoundary, PostHogFeature, PostHogProvider, captureFeatureInteraction, captureFeatureView, setupReactErrorHandler, useActiveFeatureFlags, useFeatureFlagEnabled, useFeatureFlagPayload, useFeatureFlagVariantKey, usePostHog };
//# sourceMappingURL=index.js.map
