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

var OpenFileIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M18.5,7.5c.275,0,.341-.159.146-.354L12.354.854a.5.5,0,0,0-.708,0L5.354,7.147c-.2.195-.129.354.146.354h3v10a1,1,0,0,0,1,1h5a1,1,0,0,0,1-1V7.5Z" }),
    React__namespace.createElement("path", { d: "M23.5,18.5v4a1,1,0,0,1-1,1H1.5a1,1,0,0,1-1-1v-4" }))); };

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

var useTriggerOpen = function (store) {
    var inputRef = React__namespace.useRef();
    var openFile = function () {
        var inputEle = inputRef.current;
        if (inputEle) {
            inputEle.click();
            if (store.get('triggerOpenFile')) {
                store.update('triggerOpenFile', false);
            }
        }
    };
    var handleOpenFileTriggered = function (trigger) {
        if (trigger) {
            openFile();
        }
    };
    React__namespace.useEffect(function () {
        store.subscribe('triggerOpenFile', handleOpenFileTriggered);
        return function () {
            store.unsubscribe('triggerOpenFile', handleOpenFileTriggered);
        };
    }, []);
    return {
        inputRef: inputRef,
        openFile: openFile,
    };
};

var TOOLTIP_OFFSET = { left: 0, top: 8 };
var OpenButton = function (_a) {
    var enableShortcuts = _a.enableShortcuts, store = _a.store, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.open ? l10n.open.openFile : 'Open file';
    var _b = useTriggerOpen(store), inputRef = _b.inputRef, openFile = _b.openFile;
    var ariaKeyShortcuts = enableShortcuts ? (core.isMac() ? 'Meta+O' : 'Ctrl+O') : '';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "open", position: core.Position.BottomCenter, target: React__namespace.createElement("div", { className: "rpv-open__input-wrapper" },
            React__namespace.createElement("input", { accept: ".pdf", ref: inputRef, className: "rpv-open__input", multiple: false, tabIndex: -1, title: "", type: "file", onChange: onClick }),
            React__namespace.createElement(core.MinimalButton, { ariaKeyShortcuts: ariaKeyShortcuts, ariaLabel: label, testId: "open__button", onClick: openFile },
                React__namespace.createElement(OpenFileIcon, null))), content: function () { return label; }, offset: TOOLTIP_OFFSET }));
};

var Open = function (_a) {
    var children = _a.children, enableShortcuts = _a.enableShortcuts, store = _a.store;
    var handleOpenFiles = function (e) {
        var files = e.target.files;
        if (!files || !files.length) {
            return;
        }
        var openFile = store.get('openFile');
        if (openFile) {
            openFile(files[0]);
        }
    };
    var defaultChildren = function (props) { return (React__namespace.createElement(OpenButton, { enableShortcuts: enableShortcuts, store: store, onClick: props.onClick })); };
    var render = children || defaultChildren;
    return render({
        onClick: handleOpenFiles,
    });
};

var OpenMenuItem = function (_a) {
    var store = _a.store, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.open ? l10n.open.openFile : 'Open file';
    var _b = useTriggerOpen(store), inputRef = _b.inputRef, openFile = _b.openFile;
    return (React__namespace.createElement(core.MenuItem, { icon: React__namespace.createElement(OpenFileIcon, null), testId: "open__menu", onClick: openFile },
        React__namespace.createElement("div", { className: "rpv-open__input-wrapper" },
            React__namespace.createElement("input", { accept: ".pdf", ref: inputRef, className: "rpv-open__input", multiple: false, tabIndex: -1, title: "", type: "file", onChange: onClick }),
            label)));
};

var ShortcutHandler = function (_a) {
    var containerRef = _a.containerRef, store = _a.store;
    var keydownHandler = function (e) {
        if (e.shiftKey || e.altKey || e.key !== 'o') {
            return;
        }
        var isCommandPressed = core.isMac() ? e.metaKey : e.ctrlKey;
        if (!isCommandPressed) {
            return;
        }
        var containerEle = containerRef.current;
        if (!containerEle || !document.activeElement || !containerEle.contains(document.activeElement)) {
            return;
        }
        e.preventDefault();
        store.update('triggerOpenFile', true);
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

var openPlugin = function (props) {
    var openPluginProps = React__namespace.useMemo(function () { return Object.assign({}, { enableShortcuts: true }, props); }, []);
    var store = React__namespace.useMemo(function () { return core.createStore({}); }, []);
    var OpenDecorator = function (props) { return (React__namespace.createElement(Open, __assign({ enableShortcuts: openPluginProps.enableShortcuts }, props, { store: store }))); };
    var OpenButtonDecorator = function () { return React__namespace.createElement(OpenDecorator, null); };
    var OpenMenuItemDecorator = function () { return (React__namespace.createElement(OpenDecorator, null, function (p) { return React__namespace.createElement(OpenMenuItem, { store: store, onClick: p.onClick }); })); };
    var renderViewer = function (props) {
        var slot = props.slot;
        var updateSlot = {
            children: (React__namespace.createElement(React__namespace.Fragment, null,
                openPluginProps.enableShortcuts && (React__namespace.createElement(ShortcutHandler, { containerRef: props.containerRef, store: store })),
                slot.children)),
        };
        return __assign(__assign({}, slot), updateSlot);
    };
    return {
        install: function (pluginFunctions) {
            store.update('openFile', pluginFunctions.openFile);
        },
        renderViewer: renderViewer,
        Open: OpenDecorator,
        OpenButton: OpenButtonDecorator,
        OpenMenuItem: OpenMenuItemDecorator,
    };
};

exports.OpenFileIcon = OpenFileIcon;
exports.openPlugin = openPlugin;
