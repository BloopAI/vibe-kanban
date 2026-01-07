'use strict';

var core = require('@react-pdf-viewer/core');
var React = require('react');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var React__namespace = /*#__PURE__*/_interopNamespaceDefault(React);

var ExitFullScreenIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M11.5 23.499L11.5 14.499" }),
    React__namespace.createElement("path", { d: "M7.5 18.499L11.5 14.499 15.5 18.499" }),
    React__namespace.createElement("path", { d: "M11.5 1.499L11.5 10.499" }),
    React__namespace.createElement("path", { d: "M7.5 6.499L11.5 10.499 15.5 6.499" }),
    React__namespace.createElement("path", { d: "M20.5 12.499L1.5 12.499" }))); };

var FullScreenIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M0.5 12L23.5 12" }),
    React__namespace.createElement("path", { d: "M11.5 1L11.5 23" }),
    React__namespace.createElement("path", { d: "M8.5 4L11.5 1 14.5 4" }),
    React__namespace.createElement("path", { d: "M20.5 9L23.5 12 20.5 15" }),
    React__namespace.createElement("path", { d: "M3.5 15L0.5 12 3.5 9" }),
    React__namespace.createElement("path", { d: "M14.5 20L11.5 23 8.5 20" }))); };

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

var TOOLTIP_OFFSET$1 = { left: 0, top: 8 };
var EnterFullScreenButton = function (_a) {
    var enableShortcuts = _a.enableShortcuts, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.fullScreen ? l10n.fullScreen.enterFullScreen : 'Full screen';
    var ariaKeyShortcuts = enableShortcuts ? (core.isMac() ? 'Meta+Ctrl+F' : 'F11') : '';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "full-screen-enter", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaKeyShortcuts: ariaKeyShortcuts, ariaLabel: label, isDisabled: !core.isFullScreenEnabled(), testId: "full-screen__enter-button", onClick: onClick },
            React__namespace.createElement(FullScreenIcon, null)), content: function () { return label; }, offset: TOOLTIP_OFFSET$1 }));
};

var TOOLTIP_OFFSET = { left: 0, top: 8 };
var ExitFullScreenButtonWithTooltip = function (_a) {
    var onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var exitFullScreenLabel = l10n && l10n.fullScreen ? l10n.fullScreen.exitFullScreen : 'Exit full screen';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "full-screen-exit", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaKeyShortcuts: "Esc", ariaLabel: exitFullScreenLabel, testId: "full-screen__exit-button-with-tooltip", onClick: onClick },
            React__namespace.createElement(ExitFullScreenIcon, null)), content: function () { return exitFullScreenLabel; }, offset: TOOLTIP_OFFSET }));
};

var useEnterFullScreen = function (getFullScreenTarget, store) {
    var _a = React__namespace.useState(store.get('fullScreenMode')), fullScreenMode = _a[0], setFullScreenMode = _a[1];
    var handleFullScreenMode = React__namespace.useCallback(function (fullScreenMode) {
        setFullScreenMode(fullScreenMode);
    }, []);
    var enterFullScreen = function () {
        var pagesContainer = store.get('getPagesContainer');
        if (!pagesContainer) {
            return;
        }
        var target = getFullScreenTarget(pagesContainer());
        store.get('enterFullScreenMode')(target);
    };
    var exitFullScreen = function () {
        store.get('exitFullScreenMode')();
    };
    React__namespace.useEffect(function () {
        store.subscribe('fullScreenMode', handleFullScreenMode);
        return function () {
            store.unsubscribe('fullScreenMode', handleFullScreenMode);
        };
    }, []);
    return {
        enterFullScreen: enterFullScreen,
        exitFullScreen: exitFullScreen,
        isFullScreen: fullScreenMode === core.FullScreenMode.Entering || fullScreenMode === core.FullScreenMode.EnteredCompletely,
    };
};

var EnterFullScreen = function (_a) {
    var children = _a.children, enableShortcuts = _a.enableShortcuts, getFullScreenTarget = _a.getFullScreenTarget, store = _a.store;
    var _b = useEnterFullScreen(getFullScreenTarget, store), enterFullScreen = _b.enterFullScreen, exitFullScreen = _b.exitFullScreen, isFullScreen = _b.isFullScreen;
    var defaultChildren = function (props) {
        return isFullScreen ? (React__namespace.createElement(ExitFullScreenButtonWithTooltip, { onClick: props.onClick })) : (React__namespace.createElement(EnterFullScreenButton, { enableShortcuts: enableShortcuts, onClick: props.onClick }));
    };
    var render = children || defaultChildren;
    return render({
        onClick: isFullScreen ? exitFullScreen : enterFullScreen,
    });
};

var EnterFullScreenMenuItem = function (_a) {
    var onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.fullScreen ? l10n.fullScreen.enterFullScreen : 'Full screen';
    return (React__namespace.createElement(core.MenuItem, { icon: React__namespace.createElement(FullScreenIcon, null), isDisabled: !core.isFullScreenEnabled(), testId: "full-screen__enter-menu", onClick: onClick }, label));
};

var ExitFullScreenButton = function (_a) {
    var onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var direction = React__namespace.useContext(core.ThemeContext).direction;
    var isRtl = direction === core.TextDirection.RightToLeft;
    var exitFullScreenLabel = l10n && l10n.fullScreen ? l10n.fullScreen.exitFullScreen : 'Exit full screen';
    return (React__namespace.createElement("div", { className: core.classNames({
            'rpv-full-screen__exit-button': true,
            'rpv-full-screen__exit-button--ltr': !isRtl,
            'rpv-full-screen__exit-button--rtl': isRtl,
        }) },
        React__namespace.createElement(core.MinimalButton, { ariaLabel: exitFullScreenLabel, testId: "full-screen__exit-button", onClick: onClick },
            React__namespace.createElement(ExitFullScreenIcon, null))));
};

var ExitFullScreen = function (_a) {
    var children = _a.children, getFullScreenTarget = _a.getFullScreenTarget, store = _a.store;
    var _b = useEnterFullScreen(getFullScreenTarget, store), enterFullScreen = _b.enterFullScreen, exitFullScreen = _b.exitFullScreen, isFullScreen = _b.isFullScreen;
    var defaultChildren = function (props) { return React__namespace.createElement(ExitFullScreenButton, { onClick: props.onClick }); };
    var render = children || defaultChildren;
    return (isFullScreen &&
        render({
            onClick: isFullScreen ? exitFullScreen : enterFullScreen,
        }));
};

var FullScreenModeTracker = function (_a) {
    var store = _a.store, onEnterFullScreen = _a.onEnterFullScreen, onExitFullScreen = _a.onExitFullScreen;
    var _b = React__namespace.useState(store.get('fullScreenMode')), fullScreenMode = _b[0], setFullScreenMode = _b[1];
    var handleFullScreenMode = React__namespace.useCallback(function (fullScreenMode) {
        setFullScreenMode(fullScreenMode);
    }, []);
    var handleEnteredFullScreen = function () {
        onEnterFullScreen(store.get('zoom'));
    };
    var handleExitedFullScreen = function () {
        onExitFullScreen(store.get('zoom'));
    };
    React__namespace.useEffect(function () {
        switch (fullScreenMode) {
            case core.FullScreenMode.EnteredCompletely:
                handleEnteredFullScreen();
                break;
            case core.FullScreenMode.Exited:
                handleExitedFullScreen();
                break;
        }
    }, [fullScreenMode]);
    React__namespace.useEffect(function () {
        store.subscribe('fullScreenMode', handleFullScreenMode);
        return function () {
            store.unsubscribe('fullScreenMode', handleFullScreenMode);
        };
    }, []);
    return ((fullScreenMode === core.FullScreenMode.Entering || fullScreenMode === core.FullScreenMode.Entered) && (React__namespace.createElement("div", { className: "rpv-full-screen__overlay" },
        React__namespace.createElement(core.Spinner, null))));
};

var ShortcutHandler = function (_a) {
    var containerRef = _a.containerRef, getFullScreenTarget = _a.getFullScreenTarget, store = _a.store;
    var enterFullScreen = useEnterFullScreen(getFullScreenTarget, store).enterFullScreen;
    var keydownHandler = function (e) {
        if (e.shiftKey || e.altKey) {
            return;
        }
        var areShortcutsPressed = core.isMac() ? e.metaKey && e.ctrlKey && e.key === 'f' : e.key === 'F11';
        if (!areShortcutsPressed) {
            return;
        }
        var containerEle = containerRef.current;
        if (!containerEle || !document.activeElement || !containerEle.contains(document.activeElement)) {
            return;
        }
        e.preventDefault();
        enterFullScreen();
    };
    React__namespace.useEffect(function () {
        var containerEle = containerRef.current;
        if (!containerEle) {
            return;
        }
        document.addEventListener('keydown', keydownHandler);
        return function () {
            document.removeEventListener('keydown', keydownHandler);
        };
    }, [containerRef.current]);
    return React__namespace.createElement(React__namespace.Fragment, null);
};

var fullScreenPlugin = function (props) {
    var defaultFullScreenTarget = function (ele) { return ele; };
    var getFullScreenTarget = (props === null || props === void 0 ? void 0 : props.getFullScreenTarget) || defaultFullScreenTarget;
    var fullScreenPluginProps = React__namespace.useMemo(function () {
        return Object.assign({}, { enableShortcuts: true, onEnterFullScreen: function () { }, onExitFullScreen: function () { } }, props);
    }, []);
    var store = React__namespace.useMemo(function () {
        return core.createStore({
            enterFullScreenMode: function () { },
            exitFullScreenMode: function () { },
            fullScreenMode: core.FullScreenMode.Normal,
            zoom: function () { },
        });
    }, []);
    var EnterFullScreenDecorator = function (props) { return (React__namespace.createElement(EnterFullScreen, __assign({}, props, { enableShortcuts: fullScreenPluginProps.enableShortcuts, getFullScreenTarget: getFullScreenTarget, store: store }))); };
    var EnterFullScreenButtonDecorator = function () { return (React__namespace.createElement(EnterFullScreenDecorator, null, function (renderProps) { return (React__namespace.createElement(EnterFullScreenButton, __assign({ enableShortcuts: fullScreenPluginProps.enableShortcuts }, renderProps))); })); };
    var EnterFullScreenMenuItemDecorator = function (props) { return (React__namespace.createElement(EnterFullScreenDecorator, null, function (p) { return (React__namespace.createElement(EnterFullScreenMenuItem, { onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var ExitFullScreenDecorator = function () { return (React__namespace.createElement(ExitFullScreen, { getFullScreenTarget: getFullScreenTarget, store: store }, props === null || props === void 0 ? void 0 : props.renderExitFullScreenButton)); };
    var renderViewer = function (props) {
        var currentSlot = props.slot;
        if (currentSlot.subSlot) {
            currentSlot.subSlot.children = (React__namespace.createElement(React__namespace.Fragment, null,
                fullScreenPluginProps.enableShortcuts && (React__namespace.createElement(ShortcutHandler, { containerRef: props.containerRef, getFullScreenTarget: getFullScreenTarget, store: store })),
                React__namespace.createElement(FullScreenModeTracker, { store: store, onEnterFullScreen: fullScreenPluginProps.onEnterFullScreen, onExitFullScreen: fullScreenPluginProps.onExitFullScreen }),
                React__namespace.createElement(ExitFullScreenDecorator, null),
                currentSlot.subSlot.children));
        }
        return currentSlot;
    };
    return {
        install: function (pluginFunctions) {
            store.update('enterFullScreenMode', pluginFunctions.enterFullScreenMode);
            store.update('exitFullScreenMode', pluginFunctions.exitFullScreenMode);
            store.update('getPagesContainer', pluginFunctions.getPagesContainer);
            store.update('zoom', pluginFunctions.zoom);
        },
        onViewerStateChange: function (viewerState) {
            store.update('fullScreenMode', viewerState.fullScreenMode);
            return viewerState;
        },
        renderViewer: renderViewer,
        EnterFullScreen: EnterFullScreenDecorator,
        EnterFullScreenButton: EnterFullScreenButtonDecorator,
        EnterFullScreenMenuItem: EnterFullScreenMenuItemDecorator,
    };
};

exports.ExitFullScreenIcon = ExitFullScreenIcon;
exports.FullScreenIcon = FullScreenIcon;
exports.fullScreenPlugin = fullScreenPlugin;
