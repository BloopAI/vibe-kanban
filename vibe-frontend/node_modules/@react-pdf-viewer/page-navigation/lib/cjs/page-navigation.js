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

var DownArrowIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M2.32,2.966h19.452c0.552,0.001,1,0.449,0.999,1.001c0,0.182-0.05,0.36-0.144,0.516L12.9,20.552\n            c-0.286,0.472-0.901,0.624-1.373,0.338c-0.138-0.084-0.254-0.2-0.338-0.338L1.465,4.483C1.179,4.01,1.331,3.396,1.804,3.11\n            C1.96,3.016,2.138,2.966,2.32,2.966z" }))); };

var NextIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M0.541,5.627L11.666,18.2c0.183,0.207,0.499,0.226,0.706,0.043c0.015-0.014,0.03-0.028,0.043-0.043\n            L23.541,5.627" }))); };

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

var useCurrentPage = function (store) {
    var _a = React__namespace.useState(store.get('currentPage') || 0), currentPage = _a[0], setCurrentPage = _a[1];
    var handleCurrentPageChanged = function (currentPageIndex) {
        setCurrentPage(currentPageIndex);
    };
    core.useIsomorphicLayoutEffect(function () {
        store.subscribe('currentPage', handleCurrentPageChanged);
        return function () {
            store.unsubscribe('currentPage', handleCurrentPageChanged);
        };
    }, []);
    return { currentPage: currentPage };
};

var useNumberOfPages = function (store) {
    var _a = React__namespace.useState(store.get('numberOfPages') || 0), numberOfPages = _a[0], setNumberOfPages = _a[1];
    var handleNumberOfPages = function (total) {
        setNumberOfPages(total);
    };
    React__namespace.useEffect(function () {
        store.subscribe('numberOfPages', handleNumberOfPages);
        return function () {
            store.unsubscribe('numberOfPages', handleNumberOfPages);
        };
    }, []);
    return { numberOfPages: numberOfPages };
};

var CurrentPageInput = function (_a) {
    var store = _a.store;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var _b = React__namespace.useState('1'), editingPage = _b[0], setEditingPage = _b[1];
    var currentPage = useCurrentPage(store).currentPage;
    var numberOfPages = useNumberOfPages(store).numberOfPages;
    React__namespace.useEffect(function () { return setEditingPage("".concat(currentPage + 1)); }, [currentPage]);
    var gotoNextPage = function () {
        var nextPage = currentPage + 1;
        if (nextPage < numberOfPages) {
            setEditingPage("".concat(nextPage + 1));
            jumpTo(nextPage);
        }
    };
    var gotoPreviousPage = function () {
        var previousPage = currentPage - 1;
        if (previousPage >= 0) {
            setEditingPage("".concat(previousPage + 1));
            jumpTo(previousPage);
        }
    };
    var jumpTo = function (page) {
        var jumpToPage = store.get('jumpToPage');
        if (jumpToPage) {
            jumpToPage(page);
        }
    };
    var jump = function () {
        var newPage = parseInt(editingPage, 10);
        editingPage === '' || newPage < 1 || newPage > numberOfPages
            ? setEditingPage("".concat(currentPage + 1))
            : jumpTo(newPage - 1);
    };
    var keydownPage = function (e) {
        switch (e.key) {
            case 'ArrowUp':
                gotoPreviousPage();
                break;
            case 'ArrowDown':
                gotoNextPage();
                break;
            case 'Enter':
                jump();
                break;
        }
    };
    var label = l10n && l10n.pageNavigation
        ? l10n.pageNavigation.enterPageNumber
        : 'Enter a page number';
    return (React__namespace.createElement("span", { className: "rpv-page-navigation__current-page-input" },
        React__namespace.createElement(core.TextBox, { ariaLabel: label, testId: "page-navigation__current-page-input", type: "text", value: editingPage, onChange: setEditingPage, onKeyDown: keydownPage })));
};

var FetchLabels = function (_a) {
    var children = _a.children, doc = _a.doc;
    var isMounted = core.useIsMounted();
    var _b = React__namespace.useState({
        loading: true,
        labels: [],
    }), status = _b[0], setStatus = _b[1];
    React__namespace.useEffect(function () {
        doc.getPageLabels().then(function (result) {
            isMounted.current && setStatus({ loading: false, labels: result || [] });
        });
    }, [doc.loadingTask.docId]);
    return status.loading ? React__namespace.createElement(React__namespace.Fragment, null) : children(status.labels);
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
    return currentDoc;
};

var CurrentPageLabel = function (_a) {
    var children = _a.children, store = _a.store;
    var currentDoc = useDocument(store);
    var currentPage = useCurrentPage(store).currentPage;
    var numberOfPages = useNumberOfPages(store).numberOfPages;
    var defaultChildren = function (props) { return React__namespace.createElement(React__namespace.Fragment, null, props.currentPage + 1); };
    var render = children || defaultChildren;
    return currentDoc ? (React__namespace.createElement(FetchLabels, { doc: currentDoc }, function (labels) {
        var pageLabel = labels.length === numberOfPages && numberOfPages > 0 ? labels[currentPage] : '';
        return render({
            currentPage: currentPage,
            numberOfPages: numberOfPages,
            pageLabel: pageLabel,
        });
    })) : (React__namespace.createElement(React__namespace.Fragment, null));
};

var UpArrowIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M21.783,21.034H2.332c-0.552,0-1-0.448-1-1c0-0.182,0.05-0.361,0.144-0.517L11.2,3.448\n            c0.286-0.472,0.901-0.624,1.373-0.338c0.138,0.084,0.254,0.2,0.338,0.338l9.726,16.069c0.286,0.473,0.134,1.087-0.339,1.373\n            C22.143,20.984,21.965,21.034,21.783,21.034z" }))); };

var TOOLTIP_OFFSET$3 = { left: 0, top: 8 };
var GoToFirstPageButton = function (_a) {
    var isDisabled = _a.isDisabled, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.pageNavigation ? l10n.pageNavigation.goToFirstPage : 'First page';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "page-navigation-first", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: label, isDisabled: isDisabled, testId: "page-navigation__first-button", onClick: onClick },
            React__namespace.createElement(UpArrowIcon, null)), content: function () { return label; }, offset: TOOLTIP_OFFSET$3 }));
};

var GoToFirstPage = function (_a) {
    var children = _a.children, store = _a.store;
    var currentPage = useCurrentPage(store).currentPage;
    var goToFirstPage = function () {
        var jumpToPage = store.get('jumpToPage');
        if (jumpToPage) {
            jumpToPage(0);
        }
    };
    var defaultChildren = function (props) { return (React__namespace.createElement(GoToFirstPageButton, { isDisabled: props.isDisabled, onClick: props.onClick })); };
    var render = children || defaultChildren;
    return render({
        isDisabled: currentPage === 0,
        onClick: goToFirstPage,
    });
};

var GoToFirstPageMenuItem = function (_a) {
    var isDisabled = _a.isDisabled, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.pageNavigation ? l10n.pageNavigation.goToFirstPage : 'First page';
    return (React__namespace.createElement(core.MenuItem, { icon: React__namespace.createElement(UpArrowIcon, null), isDisabled: isDisabled, testId: "page-navigation__first-menu", onClick: onClick }, label));
};

var TOOLTIP_OFFSET$2 = { left: 0, top: 8 };
var GoToLastPageButton = function (_a) {
    var isDisabled = _a.isDisabled, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.pageNavigation ? l10n.pageNavigation.goToLastPage : 'Last page';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "page-navigation-last", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: label, isDisabled: isDisabled, testId: "page-navigation__last-button", onClick: onClick },
            React__namespace.createElement(DownArrowIcon, null)), content: function () { return label; }, offset: TOOLTIP_OFFSET$2 }));
};

var GoToLastPage = function (_a) {
    var children = _a.children, store = _a.store;
    var currentPage = useCurrentPage(store).currentPage;
    var numberOfPages = useNumberOfPages(store).numberOfPages;
    var goToLastPage = function () {
        var jumpToPage = store.get('jumpToPage');
        if (jumpToPage) {
            jumpToPage(numberOfPages - 1);
        }
    };
    var defaultChildren = function (props) { return (React__namespace.createElement(GoToLastPageButton, { isDisabled: props.isDisabled, onClick: props.onClick })); };
    var render = children || defaultChildren;
    return render({
        isDisabled: currentPage + 1 >= numberOfPages,
        onClick: goToLastPage,
    });
};

var GoToLastPageMenuItem = function (_a) {
    var isDisabled = _a.isDisabled, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.pageNavigation ? l10n.pageNavigation.goToLastPage : 'Last page';
    return (React__namespace.createElement(core.MenuItem, { icon: React__namespace.createElement(DownArrowIcon, null), isDisabled: isDisabled, testId: "page-navigation__last-menu", onClick: onClick }, label));
};

var TOOLTIP_OFFSET$1 = { left: 0, top: 8 };
var GoToNextPageButton = function (_a) {
    var isDisabled = _a.isDisabled, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.pageNavigation ? l10n.pageNavigation.goToNextPage : 'Next page';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "page-navigation-next", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: label, isDisabled: isDisabled, testId: "page-navigation__next-button", onClick: onClick },
            React__namespace.createElement(NextIcon, null)), content: function () { return label; }, offset: TOOLTIP_OFFSET$1 }));
};

var GoToNextPage = function (_a) {
    var children = _a.children, store = _a.store;
    var currentPage = useCurrentPage(store).currentPage;
    var numberOfPages = useNumberOfPages(store).numberOfPages;
    var goToNextPage = function () {
        var jumpToNextPage = store.get('jumpToNextPage');
        if (jumpToNextPage) {
            jumpToNextPage();
        }
    };
    var defaultChildren = function (props) { return (React__namespace.createElement(GoToNextPageButton, { onClick: props.onClick, isDisabled: props.isDisabled })); };
    var render = children || defaultChildren;
    return render({
        isDisabled: currentPage + 1 >= numberOfPages,
        onClick: goToNextPage,
    });
};

var GoToNextPageMenuItem = function (_a) {
    var isDisabled = _a.isDisabled, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.pageNavigation ? l10n.pageNavigation.goToNextPage : 'Next page';
    return (React__namespace.createElement(core.MenuItem, { icon: React__namespace.createElement(NextIcon, null), isDisabled: isDisabled, testId: "page-navigation__next-menu", onClick: onClick }, label));
};

var PreviousIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M23.535,18.373L12.409,5.8c-0.183-0.207-0.499-0.226-0.706-0.043C11.688,5.77,11.674,5.785,11.66,5.8\n            L0.535,18.373" }))); };

var TOOLTIP_OFFSET = { left: 0, top: 8 };
var GoToPreviousPageButton = function (_a) {
    var isDisabled = _a.isDisabled, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.pageNavigation
        ? l10n.pageNavigation.goToPreviousPage
        : 'Previous page';
    return (React__namespace.createElement(core.Tooltip, { ariaControlsSuffix: "page-navigation-previous", position: core.Position.BottomCenter, target: React__namespace.createElement(core.MinimalButton, { ariaLabel: label, isDisabled: isDisabled, testId: "page-navigation__previous-button", onClick: onClick },
            React__namespace.createElement(PreviousIcon, null)), content: function () { return label; }, offset: TOOLTIP_OFFSET }));
};

var GoToPreviousPage = function (_a) {
    var store = _a.store, children = _a.children;
    var currentPage = useCurrentPage(store).currentPage;
    var goToPreviousPage = function () {
        var jumpToPreviousPage = store.get('jumpToPreviousPage');
        if (jumpToPreviousPage) {
            jumpToPreviousPage();
        }
    };
    var defaultChildren = function (props) { return (React__namespace.createElement(GoToPreviousPageButton, { isDisabled: props.isDisabled, onClick: props.onClick })); };
    var render = children || defaultChildren;
    return render({
        isDisabled: currentPage <= 0,
        onClick: goToPreviousPage,
    });
};

var GoToPreviousPageMenuItem = function (_a) {
    var isDisabled = _a.isDisabled, onClick = _a.onClick;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var label = l10n && l10n.pageNavigation
        ? l10n.pageNavigation.goToPreviousPage
        : 'Previous page';
    return (React__namespace.createElement(core.MenuItem, { icon: React__namespace.createElement(PreviousIcon, null), isDisabled: isDisabled, testId: "page-navigation__previous-menu", onClick: onClick }, label));
};

var NumberOfPages = function (_a) {
    var children = _a.children, store = _a.store;
    var numberOfPages = useNumberOfPages(store).numberOfPages;
    return children ? children({ numberOfPages: numberOfPages }) : React__namespace.createElement(React__namespace.Fragment, null, numberOfPages);
};

var ShortcutHandler = function (_a) {
    var containerRef = _a.containerRef, numPages = _a.numPages, store = _a.store;
    var currentPage = useCurrentPage(store).currentPage;
    var currentPageRef = React__namespace.useRef(currentPage);
    currentPageRef.current = currentPage;
    var isMouseInsideRef = React__namespace.useRef(false);
    var handleMouseEnter = function () {
        isMouseInsideRef.current = true;
    };
    var handleMouseLeave = function () {
        isMouseInsideRef.current = false;
    };
    var goToNextPage = function () {
        var jumpToPage = store.get('jumpToPage');
        var targetPage = currentPageRef.current + 1;
        if (jumpToPage && targetPage < numPages) {
            jumpToPage(targetPage);
        }
    };
    var goToPreviousPage = function () {
        var jumpToPage = store.get('jumpToPage');
        var targetPage = currentPageRef.current - 1;
        if (jumpToPage && targetPage >= 0) {
            jumpToPage(targetPage);
        }
    };
    var jumpToNextDestination = function () {
        var jumpToNextDestination = store.get('jumpToNextDestination');
        if (jumpToNextDestination) {
            jumpToNextDestination();
        }
    };
    var jumpToPreviousDestination = function () {
        var jumpToPreviousDestination = store.get('jumpToPreviousDestination');
        if (jumpToPreviousDestination) {
            jumpToPreviousDestination();
        }
    };
    var handleKeydown = function (e) {
        var containerEle = containerRef.current;
        var shouldHandleShortcuts = isMouseInsideRef.current || (document.activeElement && containerEle.contains(document.activeElement));
        if (!containerEle || !shouldHandleShortcuts) {
            return;
        }
        var shouldGoToNextPage = (e.altKey && e.key === 'ArrowDown') || (!e.shiftKey && !e.altKey && e.key === 'PageDown');
        var shouldGoToPreviousPage = (e.altKey && e.key === 'ArrowUp') || (!e.shiftKey && !e.altKey && e.key === 'PageUp');
        if (shouldGoToNextPage) {
            e.preventDefault();
            goToNextPage();
            return;
        }
        if (shouldGoToPreviousPage) {
            e.preventDefault();
            goToPreviousPage();
            return;
        }
        var isCommandPressed = core.isMac() ? e.metaKey && !e.ctrlKey : e.altKey;
        if (isCommandPressed) {
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    jumpToPreviousDestination();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    jumpToNextDestination();
                    break;
            }
        }
    };
    React__namespace.useEffect(function () {
        var containerEle = containerRef.current;
        if (!containerEle) {
            return;
        }
        document.addEventListener('keydown', handleKeydown);
        containerEle.addEventListener('mouseenter', handleMouseEnter);
        containerEle.addEventListener('mouseleave', handleMouseLeave);
        return function () {
            document.removeEventListener('keydown', handleKeydown);
            containerEle.removeEventListener('mouseenter', handleMouseEnter);
            containerEle.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [containerRef.current]);
    return React__namespace.createElement(React__namespace.Fragment, null);
};

var pageNavigationPlugin = function (props) {
    var pageNavigationPluginProps = React__namespace.useMemo(function () { return Object.assign({}, { enableShortcuts: true }, props); }, []);
    var store = React__namespace.useMemo(function () { return core.createStore(); }, []);
    var CurrentPageInputDecorator = function () { return React__namespace.createElement(CurrentPageInput, { store: store }); };
    var CurrentPageLabelDecorator = function (props) { return React__namespace.createElement(CurrentPageLabel, __assign({}, props, { store: store })); };
    var GoToFirstPageDecorator = function (props) { return React__namespace.createElement(GoToFirstPage, __assign({}, props, { store: store })); };
    var GoToFirstPageButtonDecorator = function () { return (React__namespace.createElement(GoToFirstPageDecorator, null, function (props) { return React__namespace.createElement(GoToFirstPageButton, __assign({}, props)); })); };
    var GoToFirstPageMenuItemDecorator = function (props) { return (React__namespace.createElement(GoToFirstPageDecorator, null, function (p) { return (React__namespace.createElement(GoToFirstPageMenuItem, { isDisabled: p.isDisabled, onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var GoToLastPageDecorator = function (props) { return React__namespace.createElement(GoToLastPage, __assign({}, props, { store: store })); };
    var GoToLastPageButtonDecorator = function () { return (React__namespace.createElement(GoToLastPageDecorator, null, function (props) { return React__namespace.createElement(GoToLastPageButton, __assign({}, props)); })); };
    var GoToLastPageMenuItemDecorator = function (props) { return (React__namespace.createElement(GoToLastPageDecorator, null, function (p) { return (React__namespace.createElement(GoToLastPageMenuItem, { isDisabled: p.isDisabled, onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var GoToNextPageDecorator = function (props) { return React__namespace.createElement(GoToNextPage, __assign({}, props, { store: store })); };
    var GoToNextPageButtonDecorator = function () { return (React__namespace.createElement(GoToNextPageDecorator, null, function (props) { return React__namespace.createElement(GoToNextPageButton, __assign({}, props)); })); };
    var GoToNextPageMenuItemDecorator = function (props) { return (React__namespace.createElement(GoToNextPageDecorator, null, function (p) { return (React__namespace.createElement(GoToNextPageMenuItem, { isDisabled: p.isDisabled, onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var GoToPreviousPageDecorator = function (props) { return React__namespace.createElement(GoToPreviousPage, __assign({}, props, { store: store })); };
    var GoToPreviousPageButtonDecorator = function () { return (React__namespace.createElement(GoToPreviousPageDecorator, null, function (props) { return React__namespace.createElement(GoToPreviousPageButton, __assign({}, props)); })); };
    var GoToPreviousPageMenuItemDecorator = function (props) { return (React__namespace.createElement(GoToPreviousPageDecorator, null, function (p) { return (React__namespace.createElement(GoToPreviousPageMenuItem, { isDisabled: p.isDisabled, onClick: function () {
            p.onClick();
            props.onClick();
        } })); })); };
    var NumberOfPagesDecorator = function (props) { return React__namespace.createElement(NumberOfPages, __assign({}, props, { store: store })); };
    var renderViewer = function (props) {
        var slot = props.slot;
        if (!pageNavigationPluginProps.enableShortcuts) {
            return slot;
        }
        var updateSlot = {
            children: (React__namespace.createElement(React__namespace.Fragment, null,
                React__namespace.createElement(ShortcutHandler, { containerRef: props.containerRef, numPages: props.doc.numPages, store: store }),
                slot.children)),
        };
        return __assign(__assign({}, slot), updateSlot);
    };
    return {
        install: function (pluginFunctions) {
            store.update('jumpToDestination', pluginFunctions.jumpToDestination);
            store.update('jumpToNextDestination', pluginFunctions.jumpToNextDestination);
            store.update('jumpToNextPage', pluginFunctions.jumpToNextPage);
            store.update('jumpToPage', pluginFunctions.jumpToPage);
            store.update('jumpToPreviousDestination', pluginFunctions.jumpToPreviousDestination);
            store.update('jumpToPreviousPage', pluginFunctions.jumpToPreviousPage);
        },
        renderViewer: renderViewer,
        onDocumentLoad: function (props) {
            store.update('doc', props.doc);
            store.update('numberOfPages', props.doc.numPages);
        },
        onViewerStateChange: function (viewerState) {
            store.update('currentPage', viewerState.pageIndex);
            return viewerState;
        },
        jumpToNextPage: function () {
            var jump = store.get('jumpToNextPage');
            if (jump) {
                jump();
            }
        },
        jumpToPage: function (pageIndex) {
            var jumpTo = store.get('jumpToPage');
            if (jumpTo) {
                jumpTo(pageIndex);
            }
        },
        jumpToPreviousPage: function () {
            var jump = store.get('jumpToPreviousPage');
            if (jump) {
                jump();
            }
        },
        CurrentPageInput: CurrentPageInputDecorator,
        CurrentPageLabel: CurrentPageLabelDecorator,
        GoToFirstPage: GoToFirstPageDecorator,
        GoToFirstPageButton: GoToFirstPageButtonDecorator,
        GoToFirstPageMenuItem: GoToFirstPageMenuItemDecorator,
        GoToLastPage: GoToLastPageDecorator,
        GoToLastPageButton: GoToLastPageButtonDecorator,
        GoToLastPageMenuItem: GoToLastPageMenuItemDecorator,
        GoToNextPage: GoToNextPageDecorator,
        GoToNextPageButton: GoToNextPageButtonDecorator,
        GoToNextPageMenuItem: GoToNextPageMenuItemDecorator,
        GoToPreviousPage: GoToPreviousPageDecorator,
        GoToPreviousPageButton: GoToPreviousPageButtonDecorator,
        GoToPreviousPageMenuItem: GoToPreviousPageMenuItemDecorator,
        NumberOfPages: NumberOfPagesDecorator,
    };
};

exports.DownArrowIcon = DownArrowIcon;
exports.NextIcon = NextIcon;
exports.PreviousIcon = PreviousIcon;
exports.UpArrowIcon = UpArrowIcon;
exports.pageNavigationPlugin = pageNavigationPlugin;
