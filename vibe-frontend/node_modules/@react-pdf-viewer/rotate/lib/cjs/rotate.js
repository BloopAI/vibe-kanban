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

var RotateBackwardIcon = function () { return (React__namespace.createElement(core.Icon, { ignoreDirection: true, size: 16 },
    React__namespace.createElement("path", { d: "M3.434,10.537c0.141-0.438,0.316-0.864,0.523-1.274\n            M3.069,14.425C3.023,14.053,3,13.679,3,13.305 c0-0.291,0.014-0.579,0.041-0.863\n            M4.389,18.111c-0.341-0.539-0.623-1.112-0.843-1.711\n            M7.163,20.9 c-0.543-0.345-1.048-0.747-1.506-1.2\n            M10.98,22.248c-0.65-0.074-1.29-0.218-1.909-0.431\n            M10,4.25h2 c4.987,0.015,9.017,4.069,9.003,9.055c-0.013,4.581-3.456,8.426-8.008,8.945\n            M13.5,1.75L10,4.25l3.5,2.5" }))); };

var RotateForwardIcon = function () { return (React__namespace.createElement(core.Icon, { ignoreDirection: true, size: 16 },
    React__namespace.createElement("path", { d: "M20.566,10.537c-0.141-0.438-0.316-0.864-0.523-1.274\n            M20.931,14.425C20.977,14.053,21,13.679,21,13.305 c0-0.291-0.014-0.579-0.041-0.863\n            M19.611,18.111c0.341-0.539,0.624-1.114,0.843-1.713\n            M16.837,20.9 c0.543-0.345,1.048-0.747,1.506-1.2\n            M13.02,22.248c0.65-0.074,1.29-0.218,1.909-0.431\n            M14,4.25h-2 c-4.987,0.015-9.017,4.069-9.003,9.055c0.013,4.581,3.456,8.426,8.008,8.945\n            M10.5,1.75l3.5,2.5l-3.5,2.5" }))); };

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
var RotateButton = function (_a) {
    var direction = _a.direction, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var backwardLabel = l10n && l10n.rotate ? l10n.rotate.rotateBackward : 'Rotate counterclockwise';
    var forwardLabel = l10n && l10n.rotate ? l10n.rotate.rotateForward : 'Rotate clockwise';
    var label = direction === core.RotateDirection.Backward ? backwardLabel : forwardLabel;
    var icon = direction === core.RotateDirection.Backward ? React__namespace.createElement(RotateBackwardIcon, null) : React__namespace.createElement(RotateForwardIcon, null);
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "rotate", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: label, testId: direction === core.RotateDirection.Backward ? 'rotate__backward-button' : 'rotate__forward-button', onClick: onClick }, icon), content: function () { return label; }, offset: TOOLTIP_OFFSET }));
};

var Rotate = function (_a) {
    var children = _a.children, direction = _a.direction, store = _a.store;
    var onClick = function () {
        var rotate = store.get('rotate');
        if (rotate) {
            rotate(direction);
        }
    };
    var defaultChildren = function (props) { return (React__namespace.createElement(RotateButton, { direction: props.direction, onClick: props.onClick })); };
    var render = children || defaultChildren;
    return render({
        direction: direction,
        onClick: onClick,
    });
};

var RotateMenuItem = function (_a) {
    var direction = _a.direction, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var backwardLabel = l10n && l10n.rotate ? l10n.rotate.rotateBackward : 'Rotate counterclockwise';
    var forwardLabel = l10n && l10n.rotate ? l10n.rotate.rotateForward : 'Rotate clockwise';
    var label = direction === core.RotateDirection.Backward ? backwardLabel : forwardLabel;
    var icon = direction === core.RotateDirection.Backward ? React__namespace.createElement(RotateBackwardIcon, null) : React__namespace.createElement(RotateForwardIcon, null);
    return (React__namespace.createElement(core.MenuItem, { icon: icon, testId: direction === core.RotateDirection.Backward ? 'rotate__backward-menu' : 'rotate__forward-menu', onClick: onClick }, label));
};

var RotatePage = function (_a) {
    var children = _a.children, store = _a.store;
    var onRotatePage = function (pageIndex, direction) {
        var rotatePage = store.get('rotatePage');
        if (rotatePage) {
            rotatePage(pageIndex, direction);
        }
    };
    return children({
        onRotatePage: onRotatePage,
    });
};

var rotatePlugin = function () {
    var store = React__namespace.useMemo(function () { return core.createStore(); }, []);
    var RotateDecorator = function (props) { return React__namespace.createElement(Rotate, __assign({}, props, { store: store })); };
    var RotateBackwardButtonDecorator = function () { return (React__namespace.createElement(RotateDecorator, { direction: core.RotateDirection.Backward }, function (props) { return React__namespace.createElement(RotateButton, __assign({}, props)); })); };
    var RotateBackwardMenuItemDecorator = function (props) { return (React__namespace.createElement(RotateDecorator, { direction: core.RotateDirection.Backward }, function (p) { return (React__namespace.createElement(RotateMenuItem, { direction: p.direction, onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var RotateForwardButtonDecorator = function () { return (React__namespace.createElement(RotateDecorator, { direction: core.RotateDirection.Forward }, function (props) { return React__namespace.createElement(RotateButton, __assign({}, props)); })); };
    var RotateForwardMenuItemDecorator = function (props) { return (React__namespace.createElement(RotateDecorator, { direction: core.RotateDirection.Forward }, function (p) { return (React__namespace.createElement(RotateMenuItem, { direction: p.direction, onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var RotatePageDecorator = function (props) { return React__namespace.createElement(RotatePage, __assign({}, props, { store: store })); };
    return {
        install: function (pluginFunctions) {
            store.update('rotate', pluginFunctions.rotate);
            store.update('rotatePage', pluginFunctions.rotatePage);
        },
        Rotate: RotateDecorator,
        RotateBackwardButton: RotateBackwardButtonDecorator,
        RotateBackwardMenuItem: RotateBackwardMenuItemDecorator,
        RotateForwardButton: RotateForwardButtonDecorator,
        RotateForwardMenuItem: RotateForwardMenuItemDecorator,
        RotatePage: RotatePageDecorator,
    };
};

exports.RotateBackwardIcon = RotateBackwardIcon;
exports.RotateForwardIcon = RotateForwardIcon;
exports.rotatePlugin = rotatePlugin;
