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

var DualPageCoverViewModeIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("rect", { x: "0.5", y: "0.497", width: "22", height: "22", rx: "1", ry: "1" }),
    React__namespace.createElement("line", { x1: "0.5", y1: "6.497", x2: "22.5", y2: "6.497" }),
    React__namespace.createElement("line", { x1: "11.5", y1: "6.497", x2: "11.5", y2: "22.497" }))); };

var DualPageViewModeIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("rect", { x: "0.5", y: "0.497", width: "22", height: "22", rx: "1", ry: "1" }),
    React__namespace.createElement("line", { x1: "11.5", y1: "0.497", x2: "11.5", y2: "22.497" }))); };

var HorizontalScrollingIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M6.5,21.5c0,0.552-0.448,1-1,1h-4c-0.552,0-1-0.448-1-1v-20c0-0.552,0.448-1,1-1h4c0.552,0,1,0.448,1,1V21.5z\n            M14.5,21.5c0,0.552-0.448,1-1,1h-4c-0.552,0-1-0.448-1-1v-20c0-0.552,0.448-1,1-1h4c0.552,0,1,0.448,1,1V21.5z\n            M22.5,21.5 c0,0.552-0.448,1-1,1h-4c-0.552,0-1-0.448-1-1v-20c0-0.552,0.448-1,1-1h4c0.552,0,1,0.448,1,1V21.5z" }))); };

var PageScrollingIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("rect", { x: "0.5", y: "0.497", width: "22", height: "22", rx: "1", ry: "1" }))); };

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

var switchScrollMode = function (store, scrollMode) {
    store.get('switchScrollMode')(scrollMode);
    var currentViewMode = store.get('viewMode');
    if ((scrollMode === core.ScrollMode.Horizontal || scrollMode === core.ScrollMode.Wrapped) &&
        currentViewMode !== core.ViewMode.SinglePage) {
        store.get('switchViewMode')(core.ViewMode.SinglePage);
    }
};

var VerticalScrollingIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M23.5,5.5c0,0.552-0.448,1-1,1h-21c-0.552,0-1-0.448-1-1v-3c0-0.552,0.448-1,1-1h21c0.552,0,1,0.448,1,1V5.5z\n            M23.5,13.5c0,0.552-0.448,1-1,1h-21c-0.552,0-1-0.448-1-1v-3c0-0.552,0.448-1,1-1h21c0.552,0,1,0.448,1,1V13.5z\n            M23.5,21.5 c0,0.552-0.448,1-1,1h-21c-0.552,0-1-0.448-1-1v-3c0-0.552,0.448-1,1-1h21c0.552,0,1,0.448,1,1V21.5z" }))); };

var WrappedScrollingIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M10.5,9.5c0,0.552-0.448,1-1,1h-8c-0.552,0-1-0.448-1-1v-8c0-0.552,0.448-1,1-1h8c0.552,0,1,0.448,1,1V9.5z\n            M23.5,9.5c0,0.552-0.448,1-1,1h-8c-0.552,0-1-0.448-1-1v-8c0-0.552,0.448-1,1-1h8c0.552,0,1,0.448,1,1V9.5z\n            M10.5,22.5 c0,0.552-0.448,1-1,1h-8c-0.552,0-1-0.448-1-1v-8c0-0.552,0.448-1,1-1h8c0.552,0,1,0.448,1,1V22.5z\n            M23.5,22.5c0,0.552-0.448,1-1,1 h-8c-0.552,0-1-0.448-1-1v-8c0-0.552,0.448-1,1-1h8c0.552,0,1,0.448,1,1V22.5z" }))); };

var SwitchScrollModeDecorator = function (_a) {
    var children = _a.children, mode = _a.mode, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = '';
    var icon = React__namespace.createElement(VerticalScrollingIcon, null);
    switch (mode) {
        case core.ScrollMode.Horizontal:
            label =
                l10n && l10n.scrollMode
                    ? l10n.scrollMode.horizontalScrolling
                    : 'Horizontal scrolling';
            icon = React__namespace.createElement(HorizontalScrollingIcon, null);
            break;
        case core.ScrollMode.Page:
            label =
                l10n && l10n.scrollMode
                    ? l10n.scrollMode.pageScrolling
                    : 'Page scrolling';
            icon = React__namespace.createElement(PageScrollingIcon, null);
            break;
        case core.ScrollMode.Wrapped:
            label =
                l10n && l10n.scrollMode
                    ? l10n.scrollMode.wrappedScrolling
                    : 'Wrapped scrolling';
            icon = React__namespace.createElement(WrappedScrollingIcon, null);
            break;
        case core.ScrollMode.Vertical:
        default:
            label =
                l10n && l10n.scrollMode
                    ? l10n.scrollMode.verticalScrolling
                    : 'Vertical scrolling';
            icon = React__namespace.createElement(VerticalScrollingIcon, null);
            break;
    }
    return children({ icon: icon, label: label, onClick: onClick });
};

var TOOLTIP_OFFSET$1 = { left: 0, top: 8 };
var SwitchScrollModeButton = function (_a) {
    var isDisabled = _a.isDisabled, isSelected = _a.isSelected, mode = _a.mode, onClick = _a.onClick;
    var testId = '';
    switch (mode) {
        case core.ScrollMode.Horizontal:
            testId = 'scroll-mode__horizontal-button';
            break;
        case core.ScrollMode.Page:
            testId = 'scroll-mode__page-button';
            break;
        case core.ScrollMode.Wrapped:
            testId = 'scroll-mode__wrapped-button';
            break;
        case core.ScrollMode.Vertical:
        default:
            testId = 'scroll-mode__vertical-button';
            break;
    }
    return (React__namespace.createElement(SwitchScrollModeDecorator, { mode: mode, onClick: onClick }, function (props) { return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "scroll-mode-switch", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: props.label, isDisabled: isDisabled, isSelected: isSelected, testId: testId, onClick: props.onClick }, props.icon), content: function () { return props.label; }, offset: TOOLTIP_OFFSET$1 })); }));
};

var useScrollMode = function (store) {
    var _a = React__namespace.useState(store.get('scrollMode') || core.ScrollMode.Vertical), scrollMode = _a[0], setScrollMode = _a[1];
    var handleScrollModeChanged = function (currentScrollMode) {
        setScrollMode(currentScrollMode);
    };
    React__namespace.useEffect(function () {
        store.subscribe('scrollMode', handleScrollModeChanged);
        return function () {
            store.unsubscribe('scrollMode', handleScrollModeChanged);
        };
    }, []);
    return { scrollMode: scrollMode };
};

var useViewMode = function (store) {
    var _a = React__namespace.useState(store.get('viewMode') || core.ViewMode.SinglePage), viewMode = _a[0], setViewMode = _a[1];
    var handleViewModeChanged = function (currentViewMode) {
        setViewMode(currentViewMode);
    };
    React__namespace.useEffect(function () {
        store.subscribe('viewMode', handleViewModeChanged);
        return function () {
            store.unsubscribe('viewMode', handleViewModeChanged);
        };
    }, []);
    return { viewMode: viewMode };
};

var SwitchScrollMode = function (_a) {
    var children = _a.children, mode = _a.mode, store = _a.store;
    var viewMode = useViewMode(store).viewMode;
    var scrollMode = useScrollMode(store).scrollMode;
    var onClick = function () {
        switchScrollMode(store, mode);
    };
    var isSelected = scrollMode === mode;
    var isDisabled = (mode === core.ScrollMode.Horizontal || mode === core.ScrollMode.Wrapped) && viewMode !== core.ViewMode.SinglePage;
    var defaultChildren = function (props) { return (React__namespace.createElement(SwitchScrollModeButton, { isDisabled: isDisabled, isSelected: isSelected, mode: props.mode, onClick: props.onClick })); };
    var render = children || defaultChildren;
    return render({
        isDisabled: isDisabled,
        isSelected: isSelected,
        mode: mode,
        onClick: onClick,
    });
};

var SwitchScrollModeMenuItem = function (_a) {
    var isDisabled = _a.isDisabled, isSelected = _a.isSelected, mode = _a.mode, onClick = _a.onClick;
    var testId = '';
    switch (mode) {
        case core.ScrollMode.Horizontal:
            testId = 'scroll-mode__horizontal-menu';
            break;
        case core.ScrollMode.Page:
            testId = 'scroll-mode__page-menu';
            break;
        case core.ScrollMode.Wrapped:
            testId = 'scroll-mode__wrapped-menu';
            break;
        case core.ScrollMode.Vertical:
        default:
            testId = 'scroll-mode__vertical-menu';
            break;
    }
    return (React__namespace.createElement(SwitchScrollModeDecorator, { mode: mode, onClick: onClick }, function (props) { return (React__namespace.createElement(core.MenuItem, { checked: isSelected, icon: props.icon, isDisabled: isDisabled, testId: testId, onClick: props.onClick }, props.label)); }));
};

var switchViewMode = function (store, viewMode) {
    store.get('switchViewMode')(viewMode);
    var currentScrollMode = store.get('scrollMode');
    if ((currentScrollMode === core.ScrollMode.Horizontal || currentScrollMode === core.ScrollMode.Wrapped) &&
        viewMode !== core.ViewMode.SinglePage) {
        store.get('switchScrollMode')(core.ScrollMode.Vertical);
    }
};

var SwitchViewModeDecorator = function (_a) {
    var children = _a.children, mode = _a.mode, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = '';
    var icon = React__namespace.createElement(PageScrollingIcon, null);
    switch (mode) {
        case core.ViewMode.DualPage:
            label = l10n && l10n.scrollMode ? l10n.scrollMode.dualPage : 'Dual page';
            icon = React__namespace.createElement(DualPageViewModeIcon, null);
            break;
        case core.ViewMode.DualPageWithCover:
            label =
                l10n && l10n.scrollMode
                    ? l10n.scrollMode.dualPageCover
                    : 'Dual page with cover';
            icon = React__namespace.createElement(DualPageCoverViewModeIcon, null);
            break;
        case core.ViewMode.SinglePage:
        default:
            label =
                l10n && l10n.scrollMode ? l10n.scrollMode.singlePage : 'Single page';
            icon = React__namespace.createElement(PageScrollingIcon, null);
            break;
    }
    return children({ icon: icon, label: label, onClick: onClick });
};

var TOOLTIP_OFFSET = { left: 0, top: 8 };
var SwitchViewModeButton = function (_a) {
    var isDisabled = _a.isDisabled, isSelected = _a.isSelected, mode = _a.mode, onClick = _a.onClick;
    var testId = '';
    switch (mode) {
        case core.ViewMode.DualPage:
            testId = 'view-mode__dual-button';
            break;
        case core.ViewMode.DualPageWithCover:
            testId = 'view-mode__dual-cover-button';
            break;
        case core.ViewMode.SinglePage:
        default:
            testId = 'view-mode__single-button';
            break;
    }
    return (React__namespace.createElement(SwitchViewModeDecorator, { mode: mode, onClick: onClick }, function (props) { return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "view-mode-switch", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: props.label, isDisabled: isDisabled, isSelected: isSelected, testId: testId, onClick: props.onClick }, props.icon), content: function () { return props.label; }, offset: TOOLTIP_OFFSET })); }));
};

var SwitchViewMode = function (_a) {
    var children = _a.children, mode = _a.mode, store = _a.store;
    var viewMode = useViewMode(store).viewMode;
    var scrollMode = useScrollMode(store).scrollMode;
    var onClick = function () {
        switchViewMode(store, mode);
    };
    var isSelected = viewMode === mode;
    var isDisabled = (scrollMode === core.ScrollMode.Horizontal || scrollMode === core.ScrollMode.Wrapped) && mode !== core.ViewMode.SinglePage;
    var defaultChildren = function (props) { return (React__namespace.createElement(SwitchViewModeButton, { isDisabled: isDisabled, isSelected: isSelected, mode: props.mode, onClick: props.onClick })); };
    var render = children || defaultChildren;
    return render({
        isDisabled: isDisabled,
        isSelected: isSelected,
        mode: mode,
        onClick: onClick,
    });
};

var SwitchViewModeMenuItem = function (_a) {
    var isDisabled = _a.isDisabled, isSelected = _a.isSelected, mode = _a.mode, onClick = _a.onClick;
    var testId = '';
    switch (mode) {
        case core.ViewMode.DualPage:
            testId = 'view-mode__dual-menu';
            break;
        case core.ViewMode.DualPageWithCover:
            testId = 'view-mode__dual-cover-menu';
            break;
        case core.ViewMode.SinglePage:
        default:
            testId = 'view-mode__single-menu';
            break;
    }
    return (React__namespace.createElement(SwitchViewModeDecorator, { mode: mode, onClick: onClick }, function (props) { return (React__namespace.createElement(core.MenuItem, { checked: isSelected, icon: props.icon, isDisabled: isDisabled, testId: testId, onClick: props.onClick }, props.label)); }));
};

var scrollModePlugin = function () {
    var store = React__namespace.useMemo(function () {
        return core.createStore({
            scrollMode: core.ScrollMode.Vertical,
            viewMode: core.ViewMode.SinglePage,
            switchScrollMode: function () {
            },
            switchViewMode: function () {
            },
        });
    }, []);
    var SwitchScrollModeDecorator = function (props) { return React__namespace.createElement(SwitchScrollMode, __assign({}, props, { store: store })); };
    var SwitchScrollModeButtonDecorator = function (props) { return (React__namespace.createElement(SwitchScrollModeDecorator, { mode: props.mode }, function (p) { return (React__namespace.createElement(SwitchScrollModeButton, { isDisabled: p.isDisabled, isSelected: p.isSelected, mode: p.mode, onClick: function () {
            p.onClick();
        } })); })); };
    var SwitchScrollModeMenuItemDecorator = function (props) { return (React__namespace.createElement(SwitchScrollModeDecorator, { mode: props.mode }, function (p) { return (React__namespace.createElement(SwitchScrollModeMenuItem, { isDisabled: p.isDisabled, isSelected: p.isSelected, mode: p.mode, onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var SwitchViewModeDecorator = function (props) { return React__namespace.createElement(SwitchViewMode, __assign({}, props, { store: store })); };
    var SwitchViewModeButtonDecorator = function (props) { return (React__namespace.createElement(SwitchViewModeDecorator, { mode: props.mode }, function (p) { return (React__namespace.createElement(SwitchViewModeButton, { isDisabled: p.isDisabled, isSelected: p.isSelected, mode: p.mode, onClick: function () {
            p.onClick();
        } })); })); };
    var SwitchViewModeMenuItemDecorator = function (props) { return (React__namespace.createElement(SwitchViewModeDecorator, { mode: props.mode }, function (p) { return (React__namespace.createElement(SwitchViewModeMenuItem, { isDisabled: p.isDisabled, isSelected: p.isSelected, mode: p.mode, onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    return {
        install: function (pluginFunctions) {
            store.update('switchScrollMode', pluginFunctions.switchScrollMode);
            store.update('switchViewMode', pluginFunctions.switchViewMode);
        },
        onViewerStateChange: function (viewerState) {
            store.update('scrollMode', viewerState.scrollMode);
            store.update('viewMode', viewerState.viewMode);
            return viewerState;
        },
        switchScrollMode: function (scrollMode) {
            switchScrollMode(store, scrollMode);
        },
        switchViewMode: function (viewMode) {
            switchViewMode(store, viewMode);
        },
        SwitchScrollMode: SwitchScrollModeDecorator,
        SwitchScrollModeButton: SwitchScrollModeButtonDecorator,
        SwitchScrollModeMenuItem: SwitchScrollModeMenuItemDecorator,
        SwitchViewMode: SwitchViewModeDecorator,
        SwitchViewModeButton: SwitchViewModeButtonDecorator,
        SwitchViewModeMenuItem: SwitchViewModeMenuItemDecorator,
    };
};

exports.DualPageCoverViewModeIcon = DualPageCoverViewModeIcon;
exports.DualPageViewModeIcon = DualPageViewModeIcon;
exports.HorizontalScrollingIcon = HorizontalScrollingIcon;
exports.PageScrollingIcon = PageScrollingIcon;
exports.VerticalScrollingIcon = VerticalScrollingIcon;
exports.WrappedScrollingIcon = WrappedScrollingIcon;
exports.scrollModePlugin = scrollModePlugin;
