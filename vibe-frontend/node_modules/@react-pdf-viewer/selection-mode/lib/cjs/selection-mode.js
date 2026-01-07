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

var HandToolIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M11.5,5.5v-2C11.5,2.672,12.172,2,13,2s1.5,0.672,1.5,1.5v2 M14.5,11.5v-6C14.5,4.672,15.172,4,16,4\n            c0.828,0,1.5,0.672,1.5,1.5v3 M17.5,13V8.5C17.5,7.672,18.172,7,19,7s1.5,0.672,1.5,1.5v10c0,2.761-2.239,5-5,5h-3.335\n            c-1.712-0.001-3.305-0.876-4.223-2.321C6.22,18.467,4.083,14,4.083,14c-0.378-0.545-0.242-1.292,0.303-1.67\n            c0.446-0.309,1.044-0.281,1.458,0.07L8.5,15.5v-10C8.5,4.672,9.172,4,10,4s1.5,0.672,1.5,1.5v6" }))); };

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

exports.SelectionMode = void 0;
(function (SelectionMode) {
    SelectionMode["Hand"] = "Hand";
    SelectionMode["Text"] = "Text";
})(exports.SelectionMode || (exports.SelectionMode = {}));

var TextSelectionIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M13.675,11.671l2.941-2.941c0.195-0.196,0.195-0.512-0.001-0.707C16.563,7.971,16.5,7.931,16.43,7.906\n            L4.168,3.527C3.908,3.434,3.622,3.57,3.529,3.83c-0.039,0.109-0.039,0.228,0,0.336l4.379,12.262\n            c0.093,0.26,0.379,0.396,0.639,0.303c0.07-0.025,0.133-0.065,0.185-0.117l2.943-2.943l6.146,6.146c0.195,0.195,0.512,0.195,0.707,0\n            l1.293-1.293c0.195-0.195,0.195-0.512,0-0.707L13.675,11.671z" }))); };

var SwitchSelectionModeDecorator = function (_a) {
    var children = _a.children, mode = _a.mode, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = '';
    var icon = React__namespace.createElement(TextSelectionIcon, null);
    switch (mode) {
        case exports.SelectionMode.Hand:
            label =
                l10n && l10n.selectionMode ? l10n.selectionMode.handTool : 'Hand tool';
            icon = React__namespace.createElement(HandToolIcon, null);
            break;
        case exports.SelectionMode.Text:
        default:
            label =
                l10n && l10n.selectionMode
                    ? l10n.selectionMode.textSelectionTool
                    : 'Text selection tool';
            icon = React__namespace.createElement(TextSelectionIcon, null);
            break;
    }
    return children({ icon: icon, label: label, onClick: onClick });
};

var TOOLTIP_OFFSET = { left: 0, top: 8 };
var SwitchSelectionModeButton = function (_a) {
    var isSelected = _a.isSelected, mode = _a.mode, onClick = _a.onClick;
    var testId = '';
    switch (mode) {
        case exports.SelectionMode.Hand:
            testId = 'selection-mode__hand-button';
            break;
        case exports.SelectionMode.Text:
        default:
            testId = 'selection-mode__text-button';
    }
    return (React__namespace.createElement(SwitchSelectionModeDecorator, { mode: mode, onClick: onClick }, function (props) { return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "selection-mode-switch", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: props.label, isSelected: isSelected, testId: testId, onClick: props.onClick }, props.icon), content: function () { return props.label; }, offset: TOOLTIP_OFFSET })); }));
};

var SwitchSelectionMode = function (_a) {
    var children = _a.children, mode = _a.mode, store = _a.store;
    var onClick = function () { return store.update('selectionMode', mode); };
    var isSelected = mode === store.get('selectionMode');
    var defaultChildren = function (props) { return (React__namespace.createElement(SwitchSelectionModeButton, { isSelected: isSelected, mode: props.mode, onClick: props.onClick })); };
    var render = children || defaultChildren;
    return render({
        isSelected: isSelected,
        mode: mode,
        onClick: onClick,
    });
};

var SwitchSelectionModeMenuItem = function (_a) {
    var isSelected = _a.isSelected, mode = _a.mode, onClick = _a.onClick;
    var testId = '';
    switch (mode) {
        case exports.SelectionMode.Hand:
            testId = 'selection-mode__hand-menu';
            break;
        case exports.SelectionMode.Text:
        default:
            testId = 'selection-mode__text-menu';
    }
    return (React__namespace.createElement(SwitchSelectionModeDecorator, { mode: mode, onClick: onClick }, function (props) { return (React__namespace.createElement(core.MenuItem, { checked: isSelected, icon: props.icon, testId: testId, onClick: props.onClick }, props.label)); }));
};

var Tracker = function (_a) {
    var store = _a.store;
    var pagesRef = React__namespace.useRef(null);
    var _b = React__namespace.useState(exports.SelectionMode.Text), selectionMode = _b[0], setSelectionMode = _b[1];
    var pos = React__namespace.useRef({ top: 0, left: 0, x: 0, y: 0 });
    var onMouseMoveHandler = function (e) {
        var ele = pagesRef.current;
        if (!ele) {
            return;
        }
        ele.scrollTop = pos.current.top - (e.clientY - pos.current.y);
        ele.scrollLeft = pos.current.left - (e.clientX - pos.current.x);
    };
    var onMouseUpHandler = function () {
        var ele = pagesRef.current;
        if (!ele) {
            return;
        }
        ele.classList.add('rpv-selection-mode__grab');
        ele.classList.remove('rpv-selection-mode__grabbing');
        document.removeEventListener('mousemove', onMouseMoveHandler);
        document.removeEventListener('mouseup', onMouseUpHandler);
    };
    var onMouseDownHandler = function (e) {
        var ele = pagesRef.current;
        if (!ele || selectionMode === exports.SelectionMode.Text) {
            return;
        }
        ele.classList.remove('rpv-selection-mode__grab');
        ele.classList.add('rpv-selection-mode__grabbing');
        e.preventDefault();
        e.stopPropagation();
        pos.current = {
            left: ele.scrollLeft,
            top: ele.scrollTop,
            x: e.clientX,
            y: e.clientY,
        };
        document.addEventListener('mousemove', onMouseMoveHandler);
        document.addEventListener('mouseup', onMouseUpHandler);
    };
    var handlePagesContainer = function (getPagesContainer) {
        pagesRef.current = getPagesContainer();
    };
    var handleSelectionModeChanged = function (mode) {
        setSelectionMode(mode);
    };
    React__namespace.useEffect(function () {
        var ele = pagesRef.current;
        if (!ele) {
            return;
        }
        selectionMode === exports.SelectionMode.Hand
            ? ele.classList.add('rpv-selection-mode__grab')
            : ele.classList.remove('rpv-selection-mode__grab');
        ele.addEventListener('mousedown', onMouseDownHandler);
        return function () {
            ele.removeEventListener('mousedown', onMouseDownHandler);
        };
    }, [selectionMode]);
    React__namespace.useEffect(function () {
        store.subscribe('getPagesContainer', handlePagesContainer);
        store.subscribe('selectionMode', handleSelectionModeChanged);
        return function () {
            store.unsubscribe('getPagesContainer', handlePagesContainer);
            store.unsubscribe('selectionMode', handleSelectionModeChanged);
        };
    }, []);
    return React__namespace.createElement(React__namespace.Fragment, null);
};

var selectionModePlugin = function (props) {
    var store = React__namespace.useMemo(function () { return core.createStore(); }, []);
    var SwitchSelectionModeDecorator = function (props) { return (React__namespace.createElement(SwitchSelectionMode, __assign({}, props, { store: store }))); };
    var SwitchSelectionModeButtonDecorator = function (props) { return (React__namespace.createElement(SwitchSelectionModeDecorator, { mode: props.mode }, function (p) { return (React__namespace.createElement(SwitchSelectionModeButton, { isSelected: p.isSelected, mode: p.mode, onClick: function () {
            p.onClick();
        } })); })); };
    var SwitchSelectionModeMenuItemDecorator = function (props) { return (React__namespace.createElement(SwitchSelectionModeDecorator, { mode: props.mode }, function (p) { return (React__namespace.createElement(SwitchSelectionModeMenuItem, { isSelected: p.isSelected, mode: p.mode, onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var renderViewer = function (props) {
        var currentSlot = props.slot;
        if (currentSlot.subSlot && currentSlot.subSlot.children) {
            currentSlot.subSlot.children = (React__namespace.createElement(React__namespace.Fragment, null,
                React__namespace.createElement(Tracker, { store: store }),
                currentSlot.subSlot.children));
        }
        return currentSlot;
    };
    return {
        install: function (pluginFunctions) {
            store.update('selectionMode', props && props.selectionMode ? props.selectionMode : exports.SelectionMode.Text);
            store.update('getPagesContainer', pluginFunctions.getPagesContainer);
        },
        renderViewer: renderViewer,
        SwitchSelectionMode: SwitchSelectionModeDecorator,
        SwitchSelectionModeButton: SwitchSelectionModeButtonDecorator,
        SwitchSelectionModeMenuItem: SwitchSelectionModeMenuItemDecorator,
    };
};

exports.HandToolIcon = HandToolIcon;
exports.TextSelectionIcon = TextSelectionIcon;
exports.selectionModePlugin = selectionModePlugin;
