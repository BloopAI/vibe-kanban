'use strict';

var core = require('@react-pdf-viewer/core');
var React = require('react');
var reactDom = require('react-dom');

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

var getAllPagesNumbers = function (doc) {
    return Array(doc.numPages)
        .fill(0)
        .map(function (_, i) { return i; });
};

var generateRange = function (min, max) {
    return Array(max - min + 1)
        .fill(0)
        .map(function (_, i) { return min + i; });
};
var removeDuplicate = function (arr) { return arr.filter(function (i) { return arr.indexOf(i) === arr.lastIndexOf(i); }); };
var getCustomPagesNumbers = function (customPages) {
    return function (doc) {
        var results = [];
        customPages
            .replace(/\s+/g, '')
            .split(',')
            .forEach(function (part) {
            var range = part
                .split('-')
                .map(function (c) { return parseInt(c, 10); })
                .filter(function (c) { return Number.isInteger(c); });
            if (range.length === 1) {
                results.push(range[0] - 1);
            }
            else if (range.length === 2) {
                results.push.apply(results, generateRange(range[0] - 1, range[1] - 1));
            }
        });
        return removeDuplicate(results).filter(function (i) { return i >= 0 && i < doc.numPages; });
    };
};

var getEvenPagesNumbers = function (doc) {
    return Array(doc.numPages)
        .fill(0)
        .map(function (_, i) { return i; })
        .filter(function (i) { return (i + 1) % 2 === 0; });
};

var getOddPagesNumbers = function (doc) {
    return Array(doc.numPages)
        .fill(0)
        .map(function (_, i) { return i; })
        .filter(function (i) { return (i + 1) % 2 === 1; });
};

var PrintIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M7.5,19.499h9 M7.5,16.499h9 M5.5,16.5h-3c-1.103-0.003-1.997-0.897-2-2v-6c0.003-1.103,0.897-1.997,2-2h19\n            c1.103,0.003,1.997,0.897,2,2v6c-0.003,1.103-0.897,1.997-2,2h-3\n            M5.5,4.5v-4h9.586c0.265,0,0.52,0.105,0.707,0.293l2.414,2.414\n            C18.395,3.394,18.5,3.649,18.5,3.914V4.5\n            M18.5,22.5c0,0.552-0.448,1-1,1h-11c-0.552,0-1-0.448-1-1v-9h13V22.5z\n            M3.5,8.499\n            c0.552,0,1,0.448,1,1s-0.448,1-1,1s-1-0.448-1-1S2.948,8.499,3.5,8.499z\n            M14.5,0.499v4h4" }))); };

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
var PrintButton = function (_a) {
    var enableShortcuts = _a.enableShortcuts, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.print ? l10n.print.print : 'Print';
    var ariaKeyShortcuts = enableShortcuts ? (core.isMac() ? 'Meta+P' : 'Ctrl+P') : '';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "print", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaKeyShortcuts: ariaKeyShortcuts, ariaLabel: label, testId: "print__button", onClick: onClick },
            React__namespace.createElement(PrintIcon, null)), content: function () { return label; }, offset: TOOLTIP_OFFSET }));
};

var PrintStatus;
(function (PrintStatus) {
    PrintStatus["CheckingPermission"] = "CheckingPermission";
    PrintStatus["Inactive"] = "Inactive";
    PrintStatus["Preparing"] = "Preparing";
    PrintStatus["Cancelled"] = "Cancelled";
    PrintStatus["Ready"] = "Ready";
})(PrintStatus || (PrintStatus = {}));

var Print = function (_a) {
    var children = _a.children, enableShortcuts = _a.enableShortcuts, store = _a.store;
    var print = function () {
        store.update('printStatus', PrintStatus.CheckingPermission);
    };
    var render = children || PrintButton;
    return render({
        enableShortcuts: enableShortcuts,
        onClick: print,
    });
};

var PERMISSION_PRINT = 4;
var PERMISSION_PRINT_HIGHT_QUALITY = 2048;
var CheckPrintPermission = function (_a) {
    var doc = _a.doc, store = _a.store;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var _b = React__namespace.useState(true), isAllowed = _b[0], setIsAllowed = _b[1];
    React__namespace.useEffect(function () {
        doc.getPermissions().then(function (permissions) {
            var canPrint = permissions === null ||
                permissions.includes(PERMISSION_PRINT) ||
                permissions.includes(PERMISSION_PRINT_HIGHT_QUALITY);
            canPrint ? store.update('printStatus', PrintStatus.Preparing) : setIsAllowed(false);
        });
    }, []);
    return isAllowed ? (React__namespace.createElement(React__namespace.Fragment, null)) : (React__namespace.createElement(core.Modal, { ariaControlsSuffix: "print-permission", closeOnClickOutside: false, closeOnEscape: false, content: function (toggle) {
            var close = function () {
                toggle();
                store.update('printStatus', PrintStatus.Cancelled);
            };
            return (React__namespace.createElement(React__namespace.Fragment, null,
                React__namespace.createElement("div", { className: "rpv-print__permission-body" }, l10n && l10n.print
                    ? l10n.print.disallowPrint
                    : 'The document does not allow to print'),
                React__namespace.createElement("div", { className: "rpv-print__permission-footer" },
                    React__namespace.createElement(core.Button, { onClick: close }, l10n && l10n.print ? l10n.print.close : 'Close'))));
        }, isOpened: true }));
};

var PrintProgress = function (_a) {
    var numLoadedPages = _a.numLoadedPages, numPages = _a.numPages, onCancel = _a.onCancel;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var direction = React__namespace.useContext(core.ThemeContext).direction;
    var isRtl = direction === core.TextDirection.RightToLeft;
    var progress = Math.floor((numLoadedPages * 100) / numPages);
    return (React__namespace.createElement("div", { className: "rpv-print__progress" },
        React__namespace.createElement("div", { className: core.classNames({
                'rpv-print__progress-body': true,
                'rpv-print__progress-body--rtl': isRtl,
            }) },
            React__namespace.createElement("div", { className: "rpv-print__progress-message" }, l10n && l10n.print
                ? l10n.print.preparingDocument
                : 'Preparing document ...'),
            React__namespace.createElement("div", { className: "rpv-print__progress-bar" },
                React__namespace.createElement(core.ProgressBar, { progress: progress })),
            React__namespace.createElement(core.Button, { onClick: onCancel }, l10n && l10n.print ? l10n.print.cancel : 'Cancel'))));
};

var isRunningInJest = function () { return typeof process !== 'undefined' && process.env.JEST_WORKER_ID !== undefined; };

var PageThumbnail = function (_a) {
    var canvas = _a.canvas, page = _a.page, pageHeight = _a.pageHeight, pageIndex = _a.pageIndex, pageWidth = _a.pageWidth, rotation = _a.rotation, onLoad = _a.onLoad;
    var isMounted = core.useIsMounted();
    var renderTask = React__namespace.useRef();
    var _b = React__namespace.useState(''), src = _b[0], setSrc = _b[1];
    var testWithJest = React__namespace.useMemo(function () { return isRunningInJest(); }, []);
    var handleImageLoad = function () {
        if (!testWithJest) {
            onLoad();
        }
    };
    React__namespace.useEffect(function () {
        var task = renderTask.current;
        if (task) {
            task.cancel();
        }
        var printUnit = 150 / 72;
        canvas.height = Math.floor(pageHeight * printUnit);
        canvas.width = Math.floor(pageWidth * printUnit);
        var canvasContext = canvas.getContext('2d');
        canvasContext.save();
        canvasContext.fillStyle = 'rgb(255, 255, 255)';
        canvasContext.fillRect(0, 0, canvas.width, canvas.height);
        canvasContext.restore();
        var viewport = page.getViewport({ rotation: rotation, scale: 1 });
        renderTask.current = page.render({
            canvasContext: canvasContext,
            intent: 'print',
            transform: [printUnit, 0, 0, printUnit, 0, 0],
            viewport: viewport,
        });
        renderTask.current.promise.then(function () {
            if ('toBlob' in canvas && 'createObjectURL' in URL) {
                canvas.toBlob(function (blob) {
                    isMounted.current && setSrc(URL.createObjectURL(blob));
                    testWithJest && onLoad();
                });
            }
            else {
                isMounted.current && setSrc(canvas.toDataURL());
                testWithJest && onLoad();
            }
        }, function () {
        });
    }, []);
    return (src && (React__namespace.createElement("div", { className: "rpv-print__page" },
        React__namespace.createElement("img", { "data-testid": "print__thumbnail-".concat(pageIndex), src: src, onLoad: handleImageLoad }))));
};

var PageThumbnailContainer = function (_a) {
    var canvas = _a.canvas, doc = _a.doc, pageIndex = _a.pageIndex, pageRotation = _a.pageRotation, pageSize = _a.pageSize, rotation = _a.rotation, shouldRender = _a.shouldRender, onLoad = _a.onLoad;
    var isMounted = core.useIsMounted();
    var _b = React__namespace.useState(null), page = _b[0], setPage = _b[1];
    var isVertical = Math.abs(rotation + pageRotation) % 180 === 0;
    React__namespace.useEffect(function () {
        if (shouldRender) {
            core.getPage(doc, pageIndex).then(function (pdfPage) {
                isMounted.current && setPage(pdfPage);
            });
        }
    }, [shouldRender]);
    var rotationNumber = (pageSize.rotation + rotation + pageRotation) % 360;
    return (page && (React__namespace.createElement(PageThumbnail, { canvas: canvas, page: page, pageHeight: isVertical ? pageSize.pageHeight : pageSize.pageWidth, pageIndex: pageIndex, pageWidth: isVertical ? pageSize.pageWidth : pageSize.pageHeight, rotation: rotationNumber, onLoad: onLoad })));
};

var PrintZone = function (_a) {
    var doc = _a.doc, numLoadedPages = _a.numLoadedPages, pagesRotation = _a.pagesRotation, pageSizes = _a.pageSizes, printPages = _a.printPages, printStatus = _a.printStatus, rotation = _a.rotation, onCancel = _a.onCancel, onLoad = _a.onLoad;
    var canvas = React__namespace.useMemo(function () { return document.createElement('canvas'); }, []);
    var container = React__namespace.useMemo(function () {
        var zoneEle = document.querySelector('.rpv-print__zone');
        if (zoneEle) {
            return zoneEle;
        }
        var div = document.createElement('div');
        div.classList.add('rpv-print__zone');
        div.setAttribute('data-testid', 'print__zone');
        document.body.appendChild(div);
        return div;
    }, []);
    React__namespace.useEffect(function () {
        if (printStatus === PrintStatus.Ready) {
            document.documentElement.classList.add('rpv-print__html-printing');
            document.body.classList.add('rpv-print__body-printing');
            window.print();
        }
        var handler = function () {
            if (printStatus === PrintStatus.Ready) {
                document.documentElement.classList.remove('rpv-print__html-printing');
                document.body.classList.remove('rpv-print__body-printing');
                var zones = document.querySelectorAll('.rpv-print__zone');
                if (zones) {
                    zones.forEach(function (zoneEle) {
                        zoneEle.parentElement.removeChild(zoneEle);
                    });
                }
                canvas.height = 0;
                canvas.width = 0;
                document.removeEventListener('mousemove', handler);
                onCancel();
            }
        };
        document.addEventListener('mousemove', handler);
        return function () { return document.removeEventListener('mousemove', handler); };
    }, [printStatus]);
    var pageHeight = pageSizes[0].pageHeight;
    var pageWidth = pageSizes[0].pageWidth;
    return reactDom.createPortal(React__namespace.createElement(React__namespace.Fragment, null,
        printPages.map(function (pageIndex, loopIndex) { return (React__namespace.createElement(PageThumbnailContainer, { key: pageIndex, canvas: canvas, doc: doc, pageIndex: pageIndex, pageRotation: pagesRotation.has(pageIndex) ? pagesRotation.get(pageIndex) : 0, pageSize: pageSizes[pageIndex], rotation: rotation, shouldRender: loopIndex === numLoadedPages, onLoad: onLoad })); }),
        React__namespace.createElement("style", { dangerouslySetInnerHTML: {
                __html: "@page { size: ".concat(pageWidth, "pt ").concat(pageHeight, "pt }"),
            } })), container);
};

var PrintContainer = function (_a) {
    var doc = _a.doc, pagesRotation = _a.pagesRotation, pageSizes = _a.pageSizes, renderProgressBar = _a.renderProgressBar, rotation = _a.rotation, setPages = _a.setPages, store = _a.store;
    var _b = React__namespace.useState(PrintStatus.Inactive), printStatus = _b[0], setPrintStatus = _b[1];
    var _c = React__namespace.useState(0), numLoadedPagesForPrint = _c[0], setNumLoadedPagesForPrint = _c[1];
    var printPages = React__namespace.useMemo(function () {
        var numPages = doc.numPages;
        return setPages(doc).filter(function (index) { return index >= 0 && index < numPages; });
    }, [doc, setPages]);
    var numPrintPages = printPages.length;
    var cancelPrinting = function () {
        setNumLoadedPagesForPrint(0);
        setPrintStatus(PrintStatus.Inactive);
    };
    var handlePrintStatus = function (status) { return setPrintStatus(status); };
    var onLoadPage = function () {
        var total = numLoadedPagesForPrint + 1;
        if (total <= numPrintPages) {
            setNumLoadedPagesForPrint(total);
            total === numPrintPages && setPrintStatus(PrintStatus.Ready);
        }
    };
    React__namespace.useEffect(function () {
        store.subscribe('printStatus', handlePrintStatus);
        return function () {
            store.unsubscribe('printStatus', handlePrintStatus);
        };
    }, []);
    return (React__namespace.createElement(React__namespace.Fragment, null,
        printStatus === PrintStatus.CheckingPermission && React__namespace.createElement(CheckPrintPermission, { doc: doc, store: store }),
        printStatus === PrintStatus.Preparing &&
            (renderProgressBar ? (renderProgressBar(numLoadedPagesForPrint, numPrintPages, cancelPrinting)) : (React__namespace.createElement(PrintProgress, { numLoadedPages: numLoadedPagesForPrint, numPages: numPrintPages, onCancel: cancelPrinting }))),
        (printStatus === PrintStatus.Preparing || printStatus === PrintStatus.Ready) &&
            numLoadedPagesForPrint <= numPrintPages && (React__namespace.createElement(PrintZone, { doc: doc, numLoadedPages: numLoadedPagesForPrint, pagesRotation: pagesRotation, pageSizes: pageSizes, printPages: printPages, printStatus: printStatus, rotation: rotation, onCancel: cancelPrinting, onLoad: onLoadPage }))));
};

var PrintMenuItem = function (_a) {
    var onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.print ? l10n.print.print : 'Print';
    return (React__namespace.createElement(core.MenuItem, { icon: React__namespace.createElement(PrintIcon, null), testId: "print__menu", onClick: onClick }, label));
};

var ShortcutHandler = function (_a) {
    var containerRef = _a.containerRef, store = _a.store;
    var keydownHandler = function (e) {
        if (e.shiftKey || e.altKey || e.key !== 'p') {
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
        store.update('printStatus', PrintStatus.Preparing);
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

var printPlugin = function (props) {
    var printPluginProps = React__namespace.useMemo(function () {
        return Object.assign({}, {
            enableShortcuts: true,
            setPages: function (doc) {
                return Array(doc.numPages)
                    .fill(0)
                    .map(function (_, i) { return i; });
            },
        }, props);
    }, []);
    var store = React__namespace.useMemo(function () {
        return core.createStore({
            printStatus: PrintStatus.Inactive,
        });
    }, []);
    var print = function () {
        store.update('printStatus', PrintStatus.CheckingPermission);
    };
    var PrintDecorator = function (props) { return (React__namespace.createElement(Print, __assign({ enableShortcuts: printPluginProps.enableShortcuts }, props, { store: store }))); };
    var PrintButtonDecorator = function () { return React__namespace.createElement(PrintDecorator, null, function (props) { return React__namespace.createElement(PrintButton, __assign({}, props)); }); };
    var PrintMenuItemDecorator = function (props) { return (React__namespace.createElement(PrintDecorator, null, function (p) { return (React__namespace.createElement(PrintMenuItem, { onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var renderViewer = function (renderViewerProps) {
        var slot = renderViewerProps.slot;
        var updateSlot = {
            children: (React__namespace.createElement(React__namespace.Fragment, null,
                printPluginProps.enableShortcuts && (React__namespace.createElement(ShortcutHandler, { containerRef: renderViewerProps.containerRef, store: store })),
                React__namespace.createElement(PrintContainer, { doc: renderViewerProps.doc, pagesRotation: renderViewerProps.pagesRotation, pageSizes: renderViewerProps.pageSizes, renderProgressBar: props === null || props === void 0 ? void 0 : props.renderProgressBar, rotation: renderViewerProps.rotation, setPages: printPluginProps.setPages, store: store }),
                slot.children)),
        };
        return __assign(__assign({}, slot), updateSlot);
    };
    var setPages = function (printPages) {
        printPluginProps.setPages = printPages;
    };
    return {
        print: print,
        renderViewer: renderViewer,
        Print: PrintDecorator,
        PrintButton: PrintButtonDecorator,
        PrintMenuItem: PrintMenuItemDecorator,
        setPages: setPages,
    };
};

exports.PrintIcon = PrintIcon;
exports.getAllPagesNumbers = getAllPagesNumbers;
exports.getCustomPagesNumbers = getCustomPagesNumbers;
exports.getEvenPagesNumbers = getEvenPagesNumbers;
exports.getOddPagesNumbers = getOddPagesNumbers;
exports.printPlugin = printPlugin;
