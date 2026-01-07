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

var InfoIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M12,1.001c6.075,0,11,4.925,11,11s-4.925,11-11,11s-11-4.925-11-11S5.925,1.001,12,1.001z\n            M14.5,17.005H13\n            c-0.552,0-1-0.448-1-1v-6.5c0-0.276-0.224-0.5-0.5-0.5H10\n            M11.745,6.504L11.745,6.504\n            M11.745,6.5c-0.138,0-0.25,0.112-0.25,0.25\n            S11.607,7,11.745,7s0.25-0.112,0.25-0.25S11.883,6.5,11.745,6.5" }))); };

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

var PropertiesLoader = function (_a) {
    var doc = _a.doc, render = _a.render;
    var _b = React__namespace.useState(), data = _b[0], setData = _b[1];
    React__namespace.useEffect(function () {
        doc.getMetadata()
            .then(function (meta) {
            return Promise.resolve(meta);
        })
            .then(function (meta) {
            return doc.getDownloadInfo().then(function (d) {
                return Promise.resolve({
                    fileName: meta.contentDispositionFilename || '',
                    info: meta.info,
                    length: d.length,
                });
            });
        })
            .then(function (response) {
            setData(response);
        });
    }, []);
    return data ? (render(data)) : (React__namespace.createElement("div", { className: "rpv-properties__loader" },
        React__namespace.createElement(core.Spinner, null)));
};

var PropertyItem = function (_a) {
    var label = _a.label, value = _a.value;
    var direction = React__namespace.useContext(core.ThemeContext).direction;
    var isRtl = direction === core.TextDirection.RightToLeft;
    return (React__namespace.createElement("dl", { className: core.classNames({
            'rpv-properties__item': true,
            'rpv-properties__item--rtl': isRtl,
        }) },
        React__namespace.createElement("dt", { className: "rpv-properties__item-label" },
            label,
            ":"),
        React__namespace.createElement("dd", { className: "rpv-properties__item-value" }, value || '-')));
};

var dateRegex = new RegExp('^D:' +
    '(\\d{4})' +
    '(\\d{2})?' +
    '(\\d{2})?' +
    '(\\d{2})?' +
    '(\\d{2})?' +
    '(\\d{2})?' +
    '([Z|+|-])?' +
    '(\\d{2})?' +
    "'?" +
    '(\\d{2})?' +
    "'?");
var parse = function (value, min, max, defaultValue) {
    var parsed = parseInt(value, 10);
    return parsed >= min && parsed <= max ? parsed : defaultValue;
};
var convertDate = function (input) {
    var matches = dateRegex.exec(input);
    if (!matches) {
        return null;
    }
    var year = parseInt(matches[1], 10);
    var month = parse(matches[2], 1, 12, 1) - 1;
    var day = parse(matches[3], 1, 31, 1);
    var hour = parse(matches[4], 0, 23, 0);
    var minute = parse(matches[5], 0, 59, 0);
    var second = parse(matches[6], 0, 59, 0);
    var universalTimeRelation = matches[7] || 'Z';
    var offsetHour = parse(matches[8], 0, 23, 0);
    var offsetMinute = parse(matches[9], 0, 59, 0);
    switch (universalTimeRelation) {
        case '-':
            hour += offsetHour;
            minute += offsetMinute;
            break;
        case '+':
            hour -= offsetHour;
            minute -= offsetMinute;
            break;
    }
    return new Date(Date.UTC(year, month, day, hour, minute, second));
};

var getFileName = function (url) {
    var str = url.split('/').pop();
    return str ? str.split('#')[0].split('?')[0] : url;
};

var getFileSize = function (bytes) {
    var sufixes = ['B', 'kB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return "".concat((bytes / Math.pow(1024, i)).toFixed(2), " ").concat(sufixes[i]);
};

var PropertiesModal = function (_a) {
    var doc = _a.doc, fileName = _a.fileName, onToggle = _a.onToggle;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var formatDate = function (input) {
        var date = convertDate(input);
        return date ? "".concat(date.toLocaleDateString(), ", ").concat(date.toLocaleTimeString()) : '';
    };
    var renderData = function (data) { return (React__namespace.createElement(React__namespace.Fragment, null,
        React__namespace.createElement("div", { className: "rpv-properties__modal-section" },
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties
                    ? l10n.properties.fileName
                    : 'File name', value: data.fileName || getFileName(fileName) }),
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties
                    ? l10n.properties.fileSize
                    : 'File size', value: getFileSize(data.length) })),
        React__namespace.createElement(core.Separator, null),
        React__namespace.createElement("div", { className: "rpv-properties__modal-section" },
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties ? l10n.properties.title : 'Title', value: data.info.Title }),
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties ? l10n.properties.author : 'Author', value: data.info.Author }),
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties ? l10n.properties.subject : 'Subject', value: data.info.Subject }),
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties ? l10n.properties.keywords : 'Keywords', value: data.info.Keywords }),
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties ? l10n.properties.creator : 'Creator', value: data.info.Creator }),
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties
                    ? l10n.properties.creationDate
                    : 'Creation date', value: formatDate(data.info.CreationDate) }),
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties
                    ? l10n.properties.modificationDate
                    : 'Modification date', value: formatDate(data.info.ModDate) })),
        React__namespace.createElement(core.Separator, null),
        React__namespace.createElement("div", { className: "rpv-properties__modal-section" },
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties
                    ? l10n.properties.pdfProducer
                    : 'PDF producer', value: data.info.Producer }),
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties
                    ? l10n.properties.pdfVersion
                    : 'PDF version', value: data.info.PDFFormatVersion }),
            React__namespace.createElement(PropertyItem, { label: l10n && l10n.properties
                    ? l10n.properties.pageCount
                    : 'Page count', value: "".concat(doc.numPages) })))); };
    return (React__namespace.createElement("div", { className: "rpv-properties__modal" },
        React__namespace.createElement(PropertiesLoader, { doc: doc, render: renderData }),
        React__namespace.createElement("div", { className: "rpv-properties__modal-footer" },
            React__namespace.createElement(core.Button, { onClick: onToggle }, l10n && l10n.properties ? l10n.properties.close : 'Close'))));
};

var TOOLTIP_OFFSET = { left: 0, top: 8 };
var ShowPropertiesButton = function (_a) {
    var onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.properties ? l10n.properties.showProperties : 'Show properties';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "properties", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: label, testId: "properties__button", onClick: onClick },
            React__namespace.createElement(InfoIcon, null)), content: function () { return label; }, offset: TOOLTIP_OFFSET }));
};

var useDocument = function (store) {
    var _a = React__namespace.useState(store.get('doc')), currentDoc = _a[0], setCurrentDoc = _a[1];
    var handleDocumentChanged = function (doc) {
        setCurrentDoc(doc);
    };
    React__namespace.useEffect(function () {
        store.subscribe('doc', handleDocumentChanged);
        return function () {
            store.unsubscribe('doc', handleDocumentChanged);
        };
    }, []);
    return { currentDoc: currentDoc };
};

var ShowProperties = function (_a) {
    var children = _a.children, store = _a.store;
    var currentDoc = useDocument(store).currentDoc;
    var fileName = store.get('fileName') || '';
    var defaultChildren = function (props) { return React__namespace.createElement(ShowPropertiesButton, __assign({}, props)); };
    var render = children || defaultChildren;
    return currentDoc ? (React__namespace.createElement(core.Modal, { ariaControlsSuffix: "properties", target: function (toggle) {
            return render({
                onClick: toggle,
            });
        }, content: function (toggle) { return React__namespace.createElement(PropertiesModal, { doc: currentDoc, fileName: fileName, onToggle: toggle }); }, closeOnClickOutside: true, closeOnEscape: true })) : (React__namespace.createElement(React__namespace.Fragment, null));
};

var ShowPropertiesMenuItem = function (_a) {
    var onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.properties ? l10n.properties.showProperties : 'Show properties';
    return (React__namespace.createElement(core.MenuItem, { icon: React__namespace.createElement(InfoIcon, null), testId: "properties__menu", onClick: onClick }, label));
};

var propertiesPlugin = function () {
    var store = React__namespace.useMemo(function () {
        return core.createStore({
            fileName: '',
        });
    }, []);
    var ShowPropertiesDecorator = function (props) { return React__namespace.createElement(ShowProperties, __assign({}, props, { store: store })); };
    var ShowPropertiesButtonDecorator = function () { return React__namespace.createElement(ShowProperties, { store: store }); };
    var ShowPropertiesMenuItemDecorator = function (props) { return (React__namespace.createElement(ShowPropertiesDecorator, null, function (p) { return React__namespace.createElement(ShowPropertiesMenuItem, __assign({}, p)); })); };
    return {
        onDocumentLoad: function (props) {
            store.update('doc', props.doc);
        },
        onViewerStateChange: function (viewerState) {
            store.update('fileName', viewerState.file.name);
            return viewerState;
        },
        ShowProperties: ShowPropertiesDecorator,
        ShowPropertiesButton: ShowPropertiesButtonDecorator,
        ShowPropertiesMenuItem: ShowPropertiesMenuItemDecorator,
    };
};

exports.InfoIcon = InfoIcon;
exports.propertiesPlugin = propertiesPlugin;
