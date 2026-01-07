'use strict';

var core = require('@react-pdf-viewer/core');
var React = require('react');
var attachment = require('@react-pdf-viewer/attachment');
var bookmark = require('@react-pdf-viewer/bookmark');
var thumbnail = require('@react-pdf-viewer/thumbnail');
var toolbar = require('@react-pdf-viewer/toolbar');

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

var BookmarkIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M11.5,1.5h11c0.552,0,1,0.448,1,1v20c0,0.552-0.448,1-1,1h-21c-0.552,0-1-0.448-1-1v-20c0-0.552,0.448-1,1-1h3\n            M11.5,10.5c0,0.55-0.3,0.661-0.659,0.248L8,7.5l-2.844,3.246c-0.363,0.414-0.659,0.3-0.659-0.247v-9c0-0.552,0.448-1,1-1h5\n            c0.552,0,1,0.448,1,1L11.5,10.5z\n            M14.5,6.499h6\n            M14.5,10.499h6\n            M3.5,14.499h17\n            M3.5,18.499h16.497" }))); };

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

var FileIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M7.618,15.345l8.666-8.666c0.78-0.812,2.071-0.838,2.883-0.058s0.838,2.071,0.058,2.883\n            c-0.019,0.02-0.038,0.039-0.058,0.058L7.461,21.305c-1.593,1.593-4.175,1.592-5.767,0s-1.592-4.175,0-5.767c0,0,0,0,0,0\n            L13.928,3.305c2.189-2.19,5.739-2.19,7.929-0.001s2.19,5.739,0,7.929l0,0L13.192,19.9" }))); };

var ThumbnailIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M10.5,9.5c0,0.552-0.448,1-1,1h-8c-0.552,0-1-0.448-1-1v-8c0-0.552,0.448-1,1-1h8c0.552,0,1,0.448,1,1V9.5z\n            M23.5,9.5c0,0.552-0.448,1-1,1h-8c-0.552,0-1-0.448-1-1v-8c0-0.552,0.448-1,1-1h8c0.552,0,1,0.448,1,1V9.5z\n            M10.5,22.5 c0,0.552-0.448,1-1,1h-8c-0.552,0-1-0.448-1-1v-8c0-0.552,0.448-1,1-1h8c0.552,0,1,0.448,1,1V22.5z\n            M23.5,22.5c0,0.552-0.448,1-1,1 h-8c-0.552,0-1-0.448-1-1v-8c0-0.552,0.448-1,1-1h8c0.552,0,1,0.448,1,1V22.5z" }))); };

var TOOLTIP_OFFSET_LTR = { left: 8, top: 0 };
var TOOLTIP_OFFSET_RTL = { left: -8, top: 0 };
var Sidebar = function (_a) {
    var attachmentTabContent = _a.attachmentTabContent, bookmarkTabContent = _a.bookmarkTabContent, store = _a.store, thumbnailTabContent = _a.thumbnailTabContent, tabs = _a.tabs;
    var containerRef = React__namespace.useRef();
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var _b = React__namespace.useState(store.get('isCurrentTabOpened') || false), opened = _b[0], setOpened = _b[1];
    var _c = React__namespace.useState(Math.max(store.get('currentTab') || 0, 0)), currentTab = _c[0], setCurrentTab = _c[1];
    var direction = React__namespace.useContext(core.ThemeContext).direction;
    var isRtl = direction === core.TextDirection.RightToLeft;
    var resizeConstrain = function (size) { return size.firstHalfPercentage >= 20 && size.firstHalfPercentage <= 80; };
    var defaultTabs = [
        {
            content: thumbnailTabContent,
            icon: React__namespace.createElement(ThumbnailIcon, null),
            title: l10n && l10n.defaultLayout
                ? l10n.defaultLayout.thumbnail
                : 'Thumbnail',
        },
        {
            content: bookmarkTabContent,
            icon: React__namespace.createElement(BookmarkIcon, null),
            title: l10n && l10n.defaultLayout ? l10n.defaultLayout.bookmark : 'Bookmark',
        },
        {
            content: attachmentTabContent,
            icon: React__namespace.createElement(FileIcon, null),
            title: l10n && l10n.defaultLayout
                ? l10n.defaultLayout.attachment
                : 'Attachment',
        },
    ];
    var listTabs = tabs ? tabs(defaultTabs) : defaultTabs;
    var toggleTab = function (index) {
        if (currentTab === index) {
            store.update('isCurrentTabOpened', !store.get('isCurrentTabOpened'));
            var container = containerRef.current;
            if (container) {
                var width = container.style.width;
                if (width) {
                    container.style.removeProperty('width');
                }
            }
        }
        else {
            store.update('currentTab', index);
        }
    };
    var switchToTab = function (index) {
        if (index >= 0 && index <= listTabs.length - 1) {
            store.update('isCurrentTabOpened', true);
            setCurrentTab(index);
        }
    };
    var handleCurrentTabOpened = function (opened) {
        setOpened(opened);
    };
    React__namespace.useEffect(function () {
        store.subscribe('currentTab', switchToTab);
        store.subscribe('isCurrentTabOpened', handleCurrentTabOpened);
        return function () {
            store.unsubscribe('currentTab', switchToTab);
            store.unsubscribe('isCurrentTabOpened', handleCurrentTabOpened);
        };
    }, []);
    if (listTabs.length === 0) {
        return React__namespace.createElement(React__namespace.Fragment, null);
    }
    return (React__namespace.createElement(React__namespace.Fragment, null,
        React__namespace.createElement("div", { "data-testid": "default-layout__sidebar", className: core.classNames({
                'rpv-default-layout__sidebar': true,
                'rpv-default-layout__sidebar--opened': opened,
                'rpv-default-layout__sidebar--ltr': !isRtl,
                'rpv-default-layout__sidebar--rtl': isRtl,
            }), ref: containerRef },
            React__namespace.createElement("div", { className: "rpv-default-layout__sidebar-tabs" },
                React__namespace.createElement("div", { className: "rpv-default-layout__sidebar-headers", role: "tablist", "aria-orientation": "vertical" }, listTabs.map(function (tab, index) { return (React__namespace.createElement("div", { "aria-controls": "rpv-default-layout__sidebar-content", "aria-selected": currentTab === index, key: index, className: "rpv-default-layout__sidebar-header", id: "rpv-default-layout__sidebar-tab-".concat(index), role: "tab" },
                    React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "default-layout-sidebar-tab-".concat(index), position: isRtl ? core.Position.LeftCenter : core.Position.RightCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: tab.title, isSelected: currentTab === index, onClick: function () { return toggleTab(index); } }, tab.icon), content: function () { return tab.title; }, offset: isRtl ? TOOLTIP_OFFSET_RTL : TOOLTIP_OFFSET_LTR }))); })),
                React__namespace.createElement("div", { "aria-labelledby": "rpv-default-layout__sidebar-tab-".concat(currentTab), id: "rpv-default-layout__sidebar-content", className: core.classNames({
                        'rpv-default-layout__sidebar-content': true,
                        'rpv-default-layout__sidebar-content--opened': opened,
                        'rpv-default-layout__sidebar-content--ltr': !isRtl,
                        'rpv-default-layout__sidebar-content--rtl': isRtl,
                    }), role: "tabpanel", tabIndex: -1 }, listTabs[currentTab].content))),
        opened && React__namespace.createElement(core.Splitter, { constrain: resizeConstrain })));
};

var defaultLayoutPlugin = function (props) {
    var store = React__namespace.useMemo(function () {
        return core.createStore({
            isCurrentTabOpened: false,
            currentTab: 0,
        });
    }, []);
    var attachmentPluginInstance = attachment.attachmentPlugin();
    var bookmarkPluginInstance = bookmark.bookmarkPlugin();
    var thumbnailPluginInstance = thumbnail.thumbnailPlugin(props ? props.thumbnailPlugin : {});
    var toolbarPluginInstance = toolbar.toolbarPlugin(props ? props.toolbarPlugin : {});
    var Attachments = attachmentPluginInstance.Attachments;
    var Bookmarks = bookmarkPluginInstance.Bookmarks;
    var Thumbnails = thumbnailPluginInstance.Thumbnails;
    var Toolbar = toolbarPluginInstance.Toolbar;
    var sidebarTabs = props ? props.sidebarTabs : function (defaultTabs) { return defaultTabs; };
    var plugins = [attachmentPluginInstance, bookmarkPluginInstance, thumbnailPluginInstance, toolbarPluginInstance];
    return {
        attachmentPluginInstance: attachmentPluginInstance,
        bookmarkPluginInstance: bookmarkPluginInstance,
        thumbnailPluginInstance: thumbnailPluginInstance,
        toolbarPluginInstance: toolbarPluginInstance,
        activateTab: function (index) {
            store.update('currentTab', index);
        },
        toggleTab: function (index) {
            var currentTab = store.get('currentTab');
            store.update('isCurrentTabOpened', !store.get('isCurrentTabOpened'));
            if (currentTab !== index) {
                store.update('currentTab', index);
            }
        },
        install: function (pluginFunctions) {
            plugins.forEach(function (plugin) {
                if (plugin.install) {
                    plugin.install(pluginFunctions);
                }
            });
        },
        renderPageLayer: function (renderProps) { return (React__namespace.createElement(React__namespace.Fragment, null, plugins.map(function (plugin, idx) {
            return plugin.renderPageLayer ? (React__namespace.createElement(React__namespace.Fragment, { key: idx }, plugin.renderPageLayer(renderProps))) : (React__namespace.createElement(React__namespace.Fragment, { key: idx },
                React__namespace.createElement(React__namespace.Fragment, null)));
        }))); },
        renderViewer: function (renderProps) {
            var slot = renderProps.slot;
            plugins.forEach(function (plugin) {
                if (plugin.renderViewer) {
                    slot = plugin.renderViewer(__assign(__assign({}, renderProps), { slot: slot }));
                }
            });
            var mergeSubSlot = slot.subSlot && slot.subSlot.attrs
                ? {
                    className: slot.subSlot.attrs.className,
                    'data-testid': slot.subSlot.attrs['data-testid'],
                    ref: slot.subSlot.attrs.ref,
                    style: slot.subSlot.attrs.style,
                }
                : {};
            slot.children = (React__namespace.createElement("div", { className: "rpv-default-layout__container" },
                React__namespace.createElement("div", { "data-testid": "default-layout__main", className: core.classNames({
                        'rpv-default-layout__main': true,
                        'rpv-default-layout__main--rtl': renderProps.themeContext.direction === core.TextDirection.RightToLeft,
                    }) },
                    React__namespace.createElement(Sidebar, { attachmentTabContent: React__namespace.createElement(Attachments, null), bookmarkTabContent: React__namespace.createElement(Bookmarks, null), store: store, thumbnailTabContent: React__namespace.createElement(Thumbnails, null), tabs: sidebarTabs }),
                    React__namespace.createElement("div", { className: "rpv-default-layout__body", "data-testid": "default-layout__body" },
                        React__namespace.createElement("div", { className: "rpv-default-layout__toolbar" }, props && props.renderToolbar ? props.renderToolbar(Toolbar) : React__namespace.createElement(Toolbar, null)),
                        React__namespace.createElement("div", __assign({}, mergeSubSlot), slot.subSlot.children))),
                slot.children));
            slot.subSlot.attrs = {};
            slot.subSlot.children = React__namespace.createElement(React__namespace.Fragment, null);
            return slot;
        },
        uninstall: function (pluginFunctions) {
            plugins.forEach(function (plugin) {
                if (plugin.uninstall) {
                    plugin.uninstall(pluginFunctions);
                }
            });
        },
        onDocumentLoad: function (documentLoadProps) {
            plugins.forEach(function (plugin) {
                if (plugin.onDocumentLoad) {
                    plugin.onDocumentLoad(documentLoadProps);
                }
            });
            if (props && props.setInitialTab) {
                props.setInitialTab(documentLoadProps.doc).then(function (initialTab) {
                    store.update('currentTab', initialTab);
                    store.update('isCurrentTabOpened', true);
                });
            }
        },
        onAnnotationLayerRender: function (props) {
            plugins.forEach(function (plugin) {
                if (plugin.onAnnotationLayerRender) {
                    plugin.onAnnotationLayerRender(props);
                }
            });
        },
        onTextLayerRender: function (props) {
            plugins.forEach(function (plugin) {
                if (plugin.onTextLayerRender) {
                    plugin.onTextLayerRender(props);
                }
            });
        },
        onViewerStateChange: function (viewerState) {
            var newState = viewerState;
            plugins.forEach(function (plugin) {
                if (plugin.onViewerStateChange) {
                    newState = plugin.onViewerStateChange(newState);
                }
            });
            return newState;
        },
    };
};

var setInitialTabFromPageMode = function (doc) {
    return new Promise(function (resolve, _) {
        doc.getPageMode().then(function (pageMode) {
            if (!pageMode) {
                resolve(-1);
            }
            else {
                switch (pageMode) {
                    case core.PageMode.Attachments:
                        resolve(2);
                        break;
                    case core.PageMode.Bookmarks:
                        resolve(1);
                        break;
                    case core.PageMode.Thumbnails:
                        resolve(0);
                        break;
                    default:
                        resolve(-1);
                        break;
                }
            }
        });
    });
};

exports.BookmarkIcon = BookmarkIcon;
exports.FileIcon = FileIcon;
exports.ThumbnailIcon = ThumbnailIcon;
exports.defaultLayoutPlugin = defaultLayoutPlugin;
exports.setInitialTabFromPageMode = setInitialTabFromPageMode;
