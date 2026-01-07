'use strict';

var core = require('@react-pdf-viewer/core');
var selectionMode = require('@react-pdf-viewer/selection-mode');
var React = require('react');
var fullScreen = require('@react-pdf-viewer/full-screen');
var getFile = require('@react-pdf-viewer/get-file');
var open = require('@react-pdf-viewer/open');
var pageNavigation = require('@react-pdf-viewer/page-navigation');
var print = require('@react-pdf-viewer/print');
var properties = require('@react-pdf-viewer/properties');
var rotate = require('@react-pdf-viewer/rotate');
var scrollMode = require('@react-pdf-viewer/scroll-mode');
var search = require('@react-pdf-viewer/search');
var theme = require('@react-pdf-viewer/theme');
var zoom = require('@react-pdf-viewer/zoom');

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

var MoreIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M12,0.5c1.381,0,2.5,1.119,2.5,2.5S13.381,5.5,12,5.5S9.5,4.381,9.5,3S10.619,0.5,12,0.5z\n            M12,9.5\n            c1.381,0,2.5,1.119,2.5,2.5s-1.119,2.5-2.5,2.5S9.5,13.381,9.5,12S10.619,9.5,12,9.5z\n            M12,18.5c1.381,0,2.5,1.119,2.5,2.5\n            s-1.119,2.5-2.5,2.5S9.5,22.381,9.5,21S10.619,18.5,12,18.5z" }))); };

var PORTAL_OFFSET = { left: 0, top: 8 };
var MoreActionsPopover = function (_a) {
    var toolbarSlot = _a.toolbarSlot;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var direction = React__namespace.useContext(core.ThemeContext).direction;
    var portalPosition = direction === core.TextDirection.RightToLeft ? core.Position.BottomLeft : core.Position.BottomRight;
    var DownloadMenuItem = toolbarSlot.DownloadMenuItem, EnterFullScreenMenuItem = toolbarSlot.EnterFullScreenMenuItem, GoToFirstPageMenuItem = toolbarSlot.GoToFirstPageMenuItem, GoToLastPageMenuItem = toolbarSlot.GoToLastPageMenuItem, GoToNextPageMenuItem = toolbarSlot.GoToNextPageMenuItem, GoToPreviousPageMenuItem = toolbarSlot.GoToPreviousPageMenuItem, OpenMenuItem = toolbarSlot.OpenMenuItem, PrintMenuItem = toolbarSlot.PrintMenuItem, RotateBackwardMenuItem = toolbarSlot.RotateBackwardMenuItem, RotateForwardMenuItem = toolbarSlot.RotateForwardMenuItem, ShowPropertiesMenuItem = toolbarSlot.ShowPropertiesMenuItem, SwitchScrollModeMenuItem = toolbarSlot.SwitchScrollModeMenuItem, SwitchSelectionModeMenuItem = toolbarSlot.SwitchSelectionModeMenuItem, SwitchViewModeMenuItem = toolbarSlot.SwitchViewModeMenuItem, SwitchThemeMenuItem = toolbarSlot.SwitchThemeMenuItem;
    var renderTarget = function (toggle, opened) {
        var label = l10n && l10n.toolbar ? l10n.toolbar.moreActions : 'More actions';
        return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "toolbar-more-actions", position: portalPosition, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: label, isSelected: opened, testId: "toolbar__more-actions-popover-target", onClick: toggle },
                React__namespace.createElement(MoreIcon, null)), content: function () { return label; }, offset: PORTAL_OFFSET }));
    };
    var renderContent = function (toggle) {
        return (React__namespace.createElement(core.Menu, null,
            React__namespace.createElement("div", { className: "rpv-core__display--block rpv-core__display--hidden-medium" },
                React__namespace.createElement(SwitchThemeMenuItem, { onClick: toggle })),
            React__namespace.createElement("div", { className: "rpv-core__display--block rpv-core__display--hidden-medium" },
                React__namespace.createElement(EnterFullScreenMenuItem, { onClick: toggle })),
            React__namespace.createElement("div", { className: "rpv-core__display--block rpv-core__display--hidden-medium" },
                React__namespace.createElement(OpenMenuItem, null)),
            React__namespace.createElement("div", { className: "rpv-core__display--block rpv-core__display--hidden-medium" },
                React__namespace.createElement(PrintMenuItem, { onClick: toggle })),
            React__namespace.createElement("div", { className: "rpv-core__display--block rpv-core__display--hidden-medium" },
                React__namespace.createElement(DownloadMenuItem, { onClick: toggle })),
            React__namespace.createElement("div", { className: "rpv-core__display--block rpv-core__display--hidden-medium" },
                React__namespace.createElement(core.MenuDivider, null)),
            React__namespace.createElement(GoToFirstPageMenuItem, { onClick: toggle }),
            React__namespace.createElement("div", { className: "rpv-core__display--block rpv-core__display--hidden-medium" },
                React__namespace.createElement(GoToPreviousPageMenuItem, { onClick: toggle })),
            React__namespace.createElement("div", { className: "rpv-core__display--block rpv-core__display--hidden-medium" },
                React__namespace.createElement(GoToNextPageMenuItem, { onClick: toggle })),
            React__namespace.createElement(GoToLastPageMenuItem, { onClick: toggle }),
            React__namespace.createElement(core.MenuDivider, null),
            React__namespace.createElement(RotateForwardMenuItem, { onClick: toggle }),
            React__namespace.createElement(RotateBackwardMenuItem, { onClick: toggle }),
            React__namespace.createElement(core.MenuDivider, null),
            React__namespace.createElement(SwitchSelectionModeMenuItem, { mode: selectionMode.SelectionMode.Text, onClick: toggle }),
            React__namespace.createElement(SwitchSelectionModeMenuItem, { mode: selectionMode.SelectionMode.Hand, onClick: toggle }),
            React__namespace.createElement(core.MenuDivider, null),
            React__namespace.createElement(SwitchScrollModeMenuItem, { mode: core.ScrollMode.Page, onClick: toggle }),
            React__namespace.createElement(SwitchScrollModeMenuItem, { mode: core.ScrollMode.Vertical, onClick: toggle }),
            React__namespace.createElement(SwitchScrollModeMenuItem, { mode: core.ScrollMode.Horizontal, onClick: toggle }),
            React__namespace.createElement(SwitchScrollModeMenuItem, { mode: core.ScrollMode.Wrapped, onClick: toggle }),
            React__namespace.createElement(core.MenuDivider, null),
            React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-small" },
                React__namespace.createElement(SwitchViewModeMenuItem, { mode: core.ViewMode.SinglePage, onClick: toggle })),
            React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-small" },
                React__namespace.createElement(SwitchViewModeMenuItem, { mode: core.ViewMode.DualPage, onClick: toggle })),
            React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-small" },
                React__namespace.createElement(SwitchViewModeMenuItem, { mode: core.ViewMode.DualPageWithCover, onClick: toggle })),
            React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-small" },
                React__namespace.createElement(core.MenuDivider, null)),
            React__namespace.createElement(ShowPropertiesMenuItem, { onClick: toggle })));
    };
    return (React__namespace.createElement(core.Popover, { ariaControlsSuffix: "toolbar-more-actions", ariaHasPopup: "menu", position: portalPosition, target: renderTarget, content: renderContent, offset: PORTAL_OFFSET, closeOnClickOutside: true, closeOnEscape: true }));
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

var renderDefaultToolbar = function (transformToolbarSlot) {
    return function (defaultToolbarSlot) {
        var toolbarSlot = React__namespace.useMemo(function () { return transformToolbarSlot(defaultToolbarSlot); }, []);
        var direction = React__namespace.useContext(core.ThemeContext).direction;
        var isRtl = direction === core.TextDirection.RightToLeft;
        var CurrentPageInput = toolbarSlot.CurrentPageInput, Download = toolbarSlot.Download, EnterFullScreen = toolbarSlot.EnterFullScreen, GoToNextPage = toolbarSlot.GoToNextPage, GoToPreviousPage = toolbarSlot.GoToPreviousPage, NumberOfPages = toolbarSlot.NumberOfPages, Open = toolbarSlot.Open, Print = toolbarSlot.Print, ShowSearchPopover = toolbarSlot.ShowSearchPopover, SwitchTheme = toolbarSlot.SwitchTheme, Zoom = toolbarSlot.Zoom, ZoomIn = toolbarSlot.ZoomIn, ZoomOut = toolbarSlot.ZoomOut;
        return (React__namespace.createElement("div", { "data-testid": "toolbar", className: core.classNames({
                'rpv-toolbar': true,
                'rpv-toolbar--rtl': isRtl,
            }), role: "toolbar", "aria-orientation": "horizontal" },
            React__namespace.createElement("div", { className: "rpv-toolbar__left" },
                React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                    React__namespace.createElement(ShowSearchPopover, null)),
                React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-small" },
                    React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                        React__namespace.createElement(GoToPreviousPage, null))),
                React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                    React__namespace.createElement(CurrentPageInput, null),
                    React__namespace.createElement("span", { className: "rpv-toolbar__label" },
                        React__namespace.createElement(NumberOfPages, null))),
                React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-small" },
                    React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                        React__namespace.createElement(GoToNextPage, null)))),
            React__namespace.createElement("div", { className: "rpv-toolbar__center" },
                React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                    React__namespace.createElement(ZoomOut, null)),
                React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-small" },
                    React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                        React__namespace.createElement(Zoom, null))),
                React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                    React__namespace.createElement(ZoomIn, null))),
            React__namespace.createElement("div", { className: "rpv-toolbar__right" },
                React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-medium" },
                    React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                        React__namespace.createElement(SwitchTheme, null))),
                React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-medium" },
                    React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                        React__namespace.createElement(EnterFullScreen, null))),
                React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-medium" },
                    React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                        React__namespace.createElement(Open, null))),
                React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-medium" },
                    React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                        React__namespace.createElement(Download, null))),
                React__namespace.createElement("div", { className: "rpv-core__display--hidden rpv-core__display--block-medium" },
                    React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                        React__namespace.createElement(Print, null))),
                React__namespace.createElement("div", { className: "rpv-toolbar__item" },
                    React__namespace.createElement(MoreActionsPopover, { toolbarSlot: toolbarSlot })))));
    };
};

var defaultTransform = function (slot) {
    var NumberOfPages = slot.NumberOfPages;
    return Object.assign({}, slot, {
        NumberOfPages: function () { return (React__namespace.createElement(React__namespace.Fragment, null,
            "/ ",
            React__namespace.createElement(NumberOfPages, null))); },
    });
};
var DefaultToobar = function (toolbarSlot) {
    return renderDefaultToolbar(defaultTransform)(toolbarSlot);
};

var Toolbar = function (_a) {
    var children = _a.children, slot = _a.slot;
    var render = children || DefaultToobar;
    return render(slot);
};

var toolbarPlugin = function (props) {
    var fullScreenPluginInstance = fullScreen.fullScreenPlugin(props ? props.fullScreenPlugin : {});
    var getFilePluginInstance = getFile.getFilePlugin(props ? props.getFilePlugin : {});
    var openPluginInstance = open.openPlugin(props ? props.openPlugin : {});
    var pageNavigationPluginInstance = pageNavigation.pageNavigationPlugin(props ? props.pageNavigationPlugin : {});
    var printPluginInstance = print.printPlugin(props ? props.printPlugin : {});
    var propertiesPluginInstance = properties.propertiesPlugin();
    var rotatePluginInstance = rotate.rotatePlugin();
    var scrollModePluginInstance = scrollMode.scrollModePlugin();
    var searchPluginInstance = search.searchPlugin(props ? props.searchPlugin : {});
    var selectionModePluginInstance = selectionMode.selectionModePlugin(props ? props.selectionModePlugin : {});
    var themePluginInstance = theme.themePlugin();
    var zoomPluginInstance = zoom.zoomPlugin(props ? props.zoomPlugin : {});
    var plugins = [
        fullScreenPluginInstance,
        getFilePluginInstance,
        openPluginInstance,
        pageNavigationPluginInstance,
        printPluginInstance,
        propertiesPluginInstance,
        rotatePluginInstance,
        scrollModePluginInstance,
        searchPluginInstance,
        selectionModePluginInstance,
        themePluginInstance,
        zoomPluginInstance,
    ];
    var ToolbarDecorator = React__namespace.useCallback(function (props) {
        var EnterFullScreen = fullScreenPluginInstance.EnterFullScreen, EnterFullScreenMenuItem = fullScreenPluginInstance.EnterFullScreenMenuItem;
        var Download = getFilePluginInstance.Download, DownloadMenuItem = getFilePluginInstance.DownloadMenuItem;
        var Open = openPluginInstance.Open, OpenMenuItem = openPluginInstance.OpenMenuItem;
        var CurrentPageInput = pageNavigationPluginInstance.CurrentPageInput, CurrentPageLabel = pageNavigationPluginInstance.CurrentPageLabel, GoToFirstPage = pageNavigationPluginInstance.GoToFirstPage, GoToFirstPageMenuItem = pageNavigationPluginInstance.GoToFirstPageMenuItem, GoToLastPage = pageNavigationPluginInstance.GoToLastPage, GoToLastPageMenuItem = pageNavigationPluginInstance.GoToLastPageMenuItem, GoToNextPage = pageNavigationPluginInstance.GoToNextPage, GoToNextPageMenuItem = pageNavigationPluginInstance.GoToNextPageMenuItem, GoToPreviousPage = pageNavigationPluginInstance.GoToPreviousPage, GoToPreviousPageMenuItem = pageNavigationPluginInstance.GoToPreviousPageMenuItem, NumberOfPages = pageNavigationPluginInstance.NumberOfPages;
        var Print = printPluginInstance.Print, PrintMenuItem = printPluginInstance.PrintMenuItem;
        var ShowProperties = propertiesPluginInstance.ShowProperties, ShowPropertiesMenuItem = propertiesPluginInstance.ShowPropertiesMenuItem;
        var Rotate = rotatePluginInstance.Rotate, RotateBackwardMenuItem = rotatePluginInstance.RotateBackwardMenuItem, RotateForwardMenuItem = rotatePluginInstance.RotateForwardMenuItem;
        var SwitchScrollMode = scrollModePluginInstance.SwitchScrollMode, SwitchScrollModeMenuItem = scrollModePluginInstance.SwitchScrollModeMenuItem, SwitchViewMode = scrollModePluginInstance.SwitchViewMode, SwitchViewModeMenuItem = scrollModePluginInstance.SwitchViewModeMenuItem;
        var Search = searchPluginInstance.Search, ShowSearchPopover = searchPluginInstance.ShowSearchPopover;
        var SwitchSelectionMode = selectionModePluginInstance.SwitchSelectionMode, SwitchSelectionModeMenuItem = selectionModePluginInstance.SwitchSelectionModeMenuItem;
        var SwitchTheme = themePluginInstance.SwitchTheme, SwitchThemeMenuItem = themePluginInstance.SwitchThemeMenuItem;
        var CurrentScale = zoomPluginInstance.CurrentScale, Zoom = zoomPluginInstance.Zoom, ZoomIn = zoomPluginInstance.ZoomIn, ZoomInMenuItem = zoomPluginInstance.ZoomInMenuItem, ZoomOut = zoomPluginInstance.ZoomOut, ZoomOutMenuItem = zoomPluginInstance.ZoomOutMenuItem;
        return (React__namespace.createElement(Toolbar, __assign({}, props, { slot: {
                CurrentPageInput: CurrentPageInput,
                CurrentPageLabel: CurrentPageLabel,
                CurrentScale: CurrentScale,
                Download: Download,
                DownloadMenuItem: DownloadMenuItem,
                EnterFullScreen: EnterFullScreen,
                EnterFullScreenMenuItem: EnterFullScreenMenuItem,
                GoToFirstPage: GoToFirstPage,
                GoToFirstPageMenuItem: GoToFirstPageMenuItem,
                GoToLastPage: GoToLastPage,
                GoToLastPageMenuItem: GoToLastPageMenuItem,
                GoToNextPage: GoToNextPage,
                GoToNextPageMenuItem: GoToNextPageMenuItem,
                GoToPreviousPage: GoToPreviousPage,
                GoToPreviousPageMenuItem: GoToPreviousPageMenuItem,
                NumberOfPages: NumberOfPages,
                Open: Open,
                OpenMenuItem: OpenMenuItem,
                Print: Print,
                PrintMenuItem: PrintMenuItem,
                Rotate: Rotate,
                RotateBackwardMenuItem: RotateBackwardMenuItem,
                RotateForwardMenuItem: RotateForwardMenuItem,
                Search: Search,
                ShowProperties: ShowProperties,
                ShowPropertiesMenuItem: ShowPropertiesMenuItem,
                ShowSearchPopover: ShowSearchPopover,
                SwitchScrollMode: SwitchScrollMode,
                SwitchScrollModeMenuItem: SwitchScrollModeMenuItem,
                SwitchSelectionMode: SwitchSelectionMode,
                SwitchSelectionModeMenuItem: SwitchSelectionModeMenuItem,
                SwitchViewMode: SwitchViewMode,
                SwitchViewModeMenuItem: SwitchViewModeMenuItem,
                SwitchTheme: SwitchTheme,
                SwitchThemeMenuItem: SwitchThemeMenuItem,
                Zoom: Zoom,
                ZoomIn: ZoomIn,
                ZoomInMenuItem: ZoomInMenuItem,
                ZoomOut: ZoomOut,
                ZoomOutMenuItem: ZoomOutMenuItem,
            } })));
    }, []);
    return {
        fullScreenPluginInstance: fullScreenPluginInstance,
        getFilePluginInstance: getFilePluginInstance,
        openPluginInstance: openPluginInstance,
        pageNavigationPluginInstance: pageNavigationPluginInstance,
        printPluginInstance: printPluginInstance,
        propertiesPluginInstance: propertiesPluginInstance,
        rotatePluginInstance: rotatePluginInstance,
        scrollModePluginInstance: scrollModePluginInstance,
        searchPluginInstance: searchPluginInstance,
        selectionModePluginInstance: selectionModePluginInstance,
        themePluginInstance: themePluginInstance,
        zoomPluginInstance: zoomPluginInstance,
        install: function (pluginFunctions) {
            plugins.forEach(function (plugin) {
                if (plugin.install) {
                    plugin.install(pluginFunctions);
                }
            });
        },
        renderPageLayer: function (renderProps) { return (React__namespace.createElement(React__namespace.Fragment, null, plugins.map(function (plugin, idx) {
            return plugin.renderPageLayer ? (React__namespace.createElement(React__namespace.Fragment, { key: idx }, plugin.renderPageLayer(renderProps))) : (React__namespace.createElement(React__namespace.Fragment, { key: idx }));
        }))); },
        renderViewer: function (props) {
            var slot = props.slot;
            plugins.forEach(function (plugin) {
                if (plugin.renderViewer) {
                    slot = plugin.renderViewer(__assign(__assign({}, props), { slot: slot }));
                }
            });
            return slot;
        },
        uninstall: function (pluginFunctions) {
            plugins.forEach(function (plugin) {
                if (plugin.uninstall) {
                    plugin.uninstall(pluginFunctions);
                }
            });
        },
        onDocumentLoad: function (props) {
            plugins.forEach(function (plugin) {
                if (plugin.onDocumentLoad) {
                    plugin.onDocumentLoad(props);
                }
            });
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
        renderDefaultToolbar: renderDefaultToolbar,
        Toolbar: ToolbarDecorator,
    };
};

exports.MoreActionsPopover = MoreActionsPopover;
exports.MoreIcon = MoreIcon;
exports.toolbarPlugin = toolbarPlugin;
