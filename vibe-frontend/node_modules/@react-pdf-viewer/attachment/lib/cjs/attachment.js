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

var getFileName = function (url) {
    var str = url.split('/').pop();
    return str ? str.split('#')[0].split('?')[0] : url;
};

var downloadFile = function (url, data) {
    var blobUrl = typeof data === 'string' ? '' : URL.createObjectURL(new Blob([data], { type: '' }));
    var link = document.createElement('a');
    link.style.display = 'none';
    link.href = blobUrl || url;
    link.setAttribute('download', getFileName(url));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
    }
};

var AttachmentList = function (_a) {
    var files = _a.files;
    var containerRef = React__namespace.useRef();
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var direction = React__namespace.useContext(core.ThemeContext).direction;
    var isRtl = direction === core.TextDirection.RightToLeft;
    var attachmentItemsRef = React__namespace.useRef([]);
    var clickDownloadLabel = l10n && l10n.attachment
        ? l10n.attachment.clickToDownload
        : 'Click to download';
    var handleKeyDown = function (e) {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                moveToItem(function (items, activeEle) { return items.indexOf(activeEle) + 1; });
                break;
            case 'ArrowUp':
                e.preventDefault();
                moveToItem(function (items, activeEle) { return items.indexOf(activeEle) - 1; });
                break;
            case 'End':
                e.preventDefault();
                moveToItem(function (items, _) { return items.length - 1; });
                break;
            case 'Home':
                e.preventDefault();
                moveToItem(function (_, __) { return 0; });
                break;
        }
    };
    var moveToItem = function (getItemIndex) {
        var container = containerRef.current;
        var attachmentItems = [].slice.call(container.getElementsByClassName('rpv-attachment__item'));
        if (attachmentItems.length === 0) {
            return;
        }
        attachmentItems.forEach(function (item) { return item.setAttribute('tabindex', '-1'); });
        var activeEle = document.activeElement;
        var targetIndex = Math.min(attachmentItems.length - 1, Math.max(0, getItemIndex(attachmentItems, activeEle)));
        var targetEle = attachmentItems[targetIndex];
        targetEle.setAttribute('tabindex', '0');
        targetEle.focus();
    };
    core.useIsomorphicLayoutEffect(function () {
        var container = containerRef.current;
        if (!container) {
            return;
        }
        var attachmentItems = [].slice.call(container.getElementsByClassName('rpv-attachment__item'));
        attachmentItemsRef.current = attachmentItems;
        if (attachmentItems.length > 0) {
            var firstItem = attachmentItems[0];
            firstItem.focus();
            firstItem.setAttribute('tabindex', '0');
        }
    }, []);
    return (React__namespace.createElement("div", { "data-testid": "attachment__list", className: core.classNames({
            'rpv-attachment__list': true,
            'rpv-attachment__list--rtl': isRtl,
        }), ref: containerRef, tabIndex: -1, onKeyDown: handleKeyDown }, files.map(function (file) { return (React__namespace.createElement("button", { className: "rpv-attachment__item", key: file.fileName, tabIndex: -1, title: clickDownloadLabel, type: "button", onClick: function () { return downloadFile(file.fileName, file.data); } }, file.fileName)); })));
};

var AttachmentLoader = function (_a) {
    var doc = _a.doc;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var direction = React__namespace.useContext(core.ThemeContext).direction;
    var isRtl = direction === core.TextDirection.RightToLeft;
    var noAttachmentLabel = l10n && l10n.attachment
        ? l10n.attachment.noAttachment
        : 'There is no attachment';
    var _b = React__namespace.useState({
        files: [],
        isLoaded: false,
    }), attachments = _b[0], setAttachments = _b[1];
    React__namespace.useEffect(function () {
        doc.getAttachments().then(function (response) {
            var files = response
                ? Object.keys(response).map(function (file) {
                    return {
                        data: response[file].content,
                        fileName: response[file].filename,
                    };
                })
                : [];
            setAttachments({
                files: files,
                isLoaded: true,
            });
        });
    }, [doc]);
    return !attachments.isLoaded ? (React__namespace.createElement(core.Spinner, null)) : attachments.files.length === 0 ? (React__namespace.createElement("div", { "data-testid": "attachment__empty", className: core.classNames({
            'rpv-attachment__empty': true,
            'rpv-attachment__empty--rtl': isRtl,
        }) }, noAttachmentLabel)) : (React__namespace.createElement(AttachmentList, { files: attachments.files }));
};

var AttachmentListWithStore = function (_a) {
    var store = _a.store;
    var _b = React__namespace.useState(store.get('doc')), currentDoc = _b[0], setCurrentDoc = _b[1];
    var handleDocumentChanged = function (doc) {
        setCurrentDoc(doc);
    };
    React__namespace.useEffect(function () {
        store.subscribe('doc', handleDocumentChanged);
        return function () {
            store.unsubscribe('doc', handleDocumentChanged);
        };
    }, []);
    return currentDoc ? (React__namespace.createElement(AttachmentLoader, { doc: currentDoc })) : (React__namespace.createElement("div", { className: "rpv-attachment__loader" },
        React__namespace.createElement(core.Spinner, null)));
};

var attachmentPlugin = function () {
    var store = React__namespace.useMemo(function () { return core.createStore({}); }, []);
    var AttachmentsDecorator = function () { return React__namespace.createElement(AttachmentListWithStore, { store: store }); };
    return {
        onDocumentLoad: function (props) {
            store.update('doc', props.doc);
        },
        Attachments: AttachmentsDecorator,
    };
};

exports.attachmentPlugin = attachmentPlugin;
