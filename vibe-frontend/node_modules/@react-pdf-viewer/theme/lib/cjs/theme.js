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

var DarkIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M19.5,15.106l2.4-2.4a1,1,0,0,0,0-1.414l-2.4-2.4V5.5a1,1,0,0,0-1-1H15.106l-2.4-2.4a1,1,0,0,0-1.414,0l-2.4,2.4H5.5a1,1,0,0,0-1,1V8.894l-2.4,2.4a1,1,0,0,0,0,1.414l2.4,2.4V18.5a1,1,0,0,0,1,1H8.894l2.4,2.4a1,1,0,0,0,1.414,0l2.4-2.4H18.5a1,1,0,0,0,1-1Z" }),
    React__namespace.createElement("path", { d: "M10,6.349a6,6,0,0,1,0,11.3,6,6,0,1,0,0-11.3Z" }))); };

var LightIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M19.491,15.106l2.4-2.4a1,1,0,0,0,0-1.414l-2.4-2.4V5.5a1,1,0,0,0-1-1H15.1L12.7,2.1a1,1,0,0,0-1.414,0l-2.4,2.4H5.491a1,1,0,0,0-1,1V8.894l-2.4,2.4a1,1,0,0,0,0,1.414l2.4,2.4V18.5a1,1,0,0,0,1,1H8.885l2.4,2.4a1,1,0,0,0,1.414,0l2.4-2.4h3.394a1,1,0,0,0,1-1Z" }),
    React__namespace.createElement("path", { d: "M11.491,6c4,0,6,2.686,6,6s-2,6-6,6Z" }))); };

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

var TOOLTIP_OFFSET = { left: 0, top: 8 };
var SwitchThemeButton = function (_a) {
    var onClick = _a.onClick;
    var theme = React__namespace.useContext(core.ThemeContext);
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var isDarkTheme = theme.currentTheme === 'dark';
    var label = l10n && l10n.theme
        ? isDarkTheme
            ? l10n.theme.switchLightTheme
            : l10n.theme.switchDarkTheme
        : isDarkTheme
            ? 'Switch to the light theme'
            : 'Switch to the dark theme';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "theme-switch", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: label, testId: "theme__switch-button", onClick: onClick }, isDarkTheme ? React__namespace.createElement(LightIcon, null) : React__namespace.createElement(DarkIcon, null)), content: function () { return label; }, offset: TOOLTIP_OFFSET }));
};

var SwitchTheme = function (_a) {
    var children = _a.children;
    var theme = React__namespace.useContext(core.ThemeContext);
    var defaultChildern = function (props) { return React__namespace.createElement(SwitchThemeButton, { onClick: props.onClick }); };
    var render = children || defaultChildern;
    return render({
        onClick: function () { return theme.setCurrentTheme(theme.currentTheme === 'dark' ? 'light' : 'dark'); },
    });
};

var SwitchThemeMenuItem = function (_a) {
    var onClick = _a.onClick;
    var theme = React__namespace.useContext(core.ThemeContext);
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var isDarkTheme = theme.currentTheme === 'dark';
    var label = l10n && l10n.theme
        ? isDarkTheme
            ? l10n.theme.switchLightTheme
            : l10n.theme.switchDarkTheme
        : isDarkTheme
            ? 'Switch to the light theme'
            : 'Switch to the dark theme';
    return (React__namespace.createElement(core.MenuItem, { icon: isDarkTheme ? React__namespace.createElement(LightIcon, null) : React__namespace.createElement(DarkIcon, null), testId: "theme__switch-menu", onClick: onClick }, label));
};

var themePlugin = function () {
    var SwitchThemeDecorator = function (props) { return React__namespace.createElement(SwitchTheme, __assign({}, props)); };
    var SwitchThemeButtonDecorator = function () { return (React__namespace.createElement(SwitchThemeDecorator, null, function (props) { return React__namespace.createElement(SwitchThemeButton, __assign({}, props)); })); };
    var SwitchThemeMenuItemDecorator = function (props) { return (React__namespace.createElement(SwitchThemeDecorator, null, function (p) { return (React__namespace.createElement(SwitchThemeMenuItem, { onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    return {
        SwitchTheme: SwitchThemeDecorator,
        SwitchThemeButton: SwitchThemeButtonDecorator,
        SwitchThemeMenuItem: SwitchThemeMenuItemDecorator,
    };
};

exports.DarkIcon = DarkIcon;
exports.LightIcon = LightIcon;
exports.themePlugin = themePlugin;
