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

var DownArrowIcon = function () {
    return (React__namespace.createElement(core.Icon, { size: 16 },
        React__namespace.createElement("path", { d: "M6.427,8.245A.5.5,0,0,1,6.862,7.5H17.138a.5.5,0,0,1,.435.749l-5.139,9a.5.5,0,0,1-.868,0Z" })));
};

var RightArrowIcon = function () { return (React__namespace.createElement(core.Icon, { size: 16 },
    React__namespace.createElement("path", { d: "M9.248,17.572a.5.5,0,0,1-.748-.434V6.862a.5.5,0,0,1,.748-.434l8.992,5.138a.5.5,0,0,1,0,.868Z" }))); };

var shouldBeCollapsed = function (bookmark) {
    var count = bookmark.count, items = bookmark.items;
    if (count >= 0) {
        return false;
    }
    var numSubItems = items.length;
    if (numSubItems === 0) {
        return false;
    }
    var subItems = items.concat([]);
    while (subItems.length > 0) {
        var firstChild = subItems.shift();
        var children = firstChild.items;
        if (firstChild.count && children && firstChild.count > 0 && children.length > 0) {
            numSubItems += children.length;
            subItems = subItems.concat(children);
        }
    }
    return Math.abs(count) === numSubItems;
};

var BookmarkItem = function (_a) {
    var bookmark = _a.bookmark, depth = _a.depth, doc = _a.doc, index = _a.index, isBookmarkExpanded = _a.isBookmarkExpanded, numberOfSiblings = _a.numberOfSiblings, pathFromRoot = _a.pathFromRoot, renderBookmarkItem = _a.renderBookmarkItem, store = _a.store;
    var path = pathFromRoot ? "".concat(pathFromRoot, ".").concat(index) : "".concat(index);
    var defaultIsCollapsed = React__namespace.useMemo(function () { return shouldBeCollapsed(bookmark); }, [bookmark]);
    var bookmarkExpandedMap = store.get('bookmarkExpandedMap');
    var defaultExpanded = isBookmarkExpanded
        ? isBookmarkExpanded({ bookmark: bookmark, doc: doc, depth: depth, index: index })
        : bookmarkExpandedMap.has(path)
            ? bookmarkExpandedMap.get(path)
            : !defaultIsCollapsed;
    var _b = React__namespace.useState(defaultExpanded), expanded = _b[0], setExpanded = _b[1];
    var hasSubItems = bookmark.items && bookmark.items.length > 0;
    var toggleSubItems = function () {
        var newState = !expanded;
        store.updateCurrentValue('bookmarkExpandedMap', function (currentValue) { return currentValue.set(path, newState); });
        setExpanded(newState);
    };
    var jumpToDest = function () {
        var dest = bookmark.dest;
        var jumpToDestination = store.get('jumpToDestination');
        core.getDestination(doc, dest).then(function (target) {
            if (jumpToDestination) {
                jumpToDestination(__assign({ label: bookmark.title }, target));
            }
        });
    };
    var clickBookmark = function () {
        if (hasSubItems && bookmark.dest) {
            jumpToDest();
        }
    };
    var clickItem = function () {
        if (!hasSubItems && bookmark.dest) {
            jumpToDest();
        }
    };
    var defaultRenderItem = function (onClickItem, children) { return (React__namespace.createElement("div", { className: "rpv-bookmark__item", style: {
            paddingLeft: "".concat(depth * 1.25, "rem"),
        }, onClick: onClickItem }, children)); };
    var defaultRenderToggle = function (expandIcon, collapseIcon) {
        return hasSubItems ? (React__namespace.createElement("span", { className: "rpv-bookmark__toggle", "data-testid": "bookmark__toggle-".concat(depth, "-").concat(index), onClick: toggleSubItems }, expanded ? expandIcon : collapseIcon)) : (React__namespace.createElement("span", { className: "rpv-bookmark__toggle" }));
    };
    var defaultRenderTitle = function (onClickBookmark) {
        return bookmark.url ? (React__namespace.createElement("a", { className: "rpv-bookmark__title", href: bookmark.url, rel: "noopener noreferrer nofollow", target: bookmark.newWindow ? '_blank' : '' }, bookmark.title)) : (React__namespace.createElement("div", { className: "rpv-bookmark__title", "aria-label": bookmark.title, onClick: onClickBookmark }, bookmark.title));
    };
    return (React__namespace.createElement("li", { "aria-expanded": expanded ? 'true' : 'false', "aria-label": bookmark.title, "aria-level": depth + 1, "aria-posinset": index + 1, "aria-setsize": numberOfSiblings, role: "treeitem", tabIndex: -1 },
        renderBookmarkItem
            ? renderBookmarkItem({
                bookmark: bookmark,
                depth: depth,
                hasSubItems: hasSubItems,
                index: index,
                isExpanded: expanded,
                path: path,
                defaultRenderItem: defaultRenderItem,
                defaultRenderTitle: defaultRenderTitle,
                defaultRenderToggle: defaultRenderToggle,
                onClickItem: clickItem,
                onClickTitle: clickBookmark,
                onToggleSubItems: toggleSubItems,
            })
            : defaultRenderItem(clickItem, React__namespace.createElement(React__namespace.Fragment, null,
                defaultRenderToggle(React__namespace.createElement(DownArrowIcon, null), React__namespace.createElement(RightArrowIcon, null)),
                defaultRenderTitle(clickBookmark))),
        hasSubItems && expanded && (React__namespace.createElement(BookmarkList, { bookmarks: bookmark.items, depth: depth + 1, doc: doc, isBookmarkExpanded: isBookmarkExpanded, isRoot: false, pathFromRoot: path, renderBookmarkItem: renderBookmarkItem, store: store }))));
};

var BookmarkList = function (_a) {
    var bookmarks = _a.bookmarks, _b = _a.depth, depth = _b === void 0 ? 0 : _b, doc = _a.doc, isBookmarkExpanded = _a.isBookmarkExpanded, isRoot = _a.isRoot, pathFromRoot = _a.pathFromRoot, renderBookmarkItem = _a.renderBookmarkItem, store = _a.store;
    return (React__namespace.createElement("ul", { className: "rpv-bookmark__list", role: isRoot ? 'tree' : 'group', tabIndex: -1 }, bookmarks.map(function (bookmark, index) { return (React__namespace.createElement(BookmarkItem, { bookmark: bookmark, depth: depth, doc: doc, index: index, isBookmarkExpanded: isBookmarkExpanded, key: index, numberOfSiblings: bookmarks.length, pathFromRoot: pathFromRoot, renderBookmarkItem: renderBookmarkItem, store: store })); })));
};

var Toggle;
(function (Toggle) {
    Toggle[Toggle["Collapse"] = 0] = "Collapse";
    Toggle[Toggle["Expand"] = 1] = "Expand";
})(Toggle || (Toggle = {}));
var BookmarkListRoot = function (_a) {
    var bookmarks = _a.bookmarks, doc = _a.doc, isBookmarkExpanded = _a.isBookmarkExpanded, renderBookmarkItem = _a.renderBookmarkItem, store = _a.store;
    var containerRef = React__namespace.useRef();
    var handleKeyDown = function (e) {
        var container = containerRef.current;
        if (!container || !(e.target instanceof HTMLElement) || !container.contains(e.target)) {
            return;
        }
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                moveToItem(function (bookmarkElements, activeEle) { return bookmarkElements.indexOf(activeEle) + 1; });
                break;
            case 'ArrowLeft':
                e.preventDefault();
                toggle(Toggle.Collapse);
                break;
            case 'ArrowRight':
                e.preventDefault();
                toggle(Toggle.Expand);
                break;
            case 'ArrowUp':
                e.preventDefault;
                moveToItem(function (bookmarkElements, activeEle) { return bookmarkElements.indexOf(activeEle) - 1; });
                break;
            case 'End':
                e.preventDefault();
                moveToItem(function (bookmarkElements, _) { return bookmarkElements.length - 1; });
                break;
            case ' ':
            case 'Enter':
            case 'Space':
                e.preventDefault();
                clickBookmark();
                break;
            case 'Home':
                e.preventDefault();
                moveToItem(function (_, __) { return 0; });
                break;
        }
    };
    var clickBookmark = function () {
        var closestItem = document.activeElement.closest('.rpv-bookmark__item');
        var titleEle = closestItem.querySelector('.rpv-bookmark__title');
        if (titleEle) {
            titleEle.click();
        }
    };
    var moveToItem = function (getItemIndex) {
        var container = containerRef.current;
        var bookmarkElements = [].slice.call(container.getElementsByClassName('rpv-bookmark__item'));
        if (bookmarkElements.length === 0) {
            return;
        }
        var activeEle = document.activeElement;
        var targetIndex = Math.min(bookmarkElements.length - 1, Math.max(0, getItemIndex(bookmarkElements, activeEle)));
        var targetEle = bookmarkElements[targetIndex];
        activeEle.setAttribute('tabindex', '-1');
        targetEle.setAttribute('tabindex', '0');
        targetEle.focus();
    };
    var toggle = function (toggle) {
        var container = containerRef.current;
        var bookmarkElements = [].slice.call(container.getElementsByClassName('rpv-bookmark__item'));
        if (bookmarkElements.length === 0) {
            return;
        }
        var closestItem = document.activeElement.closest('.rpv-bookmark__item');
        var expanedAttribute = toggle === Toggle.Collapse ? 'true' : 'false';
        if (closestItem && closestItem.parentElement.getAttribute('aria-expanded') === expanedAttribute) {
            var toggleEle = closestItem.querySelector('.rpv-bookmark__toggle');
            if (toggleEle) {
                toggleEle.click();
            }
        }
    };
    React__namespace.useEffect(function () {
        document.addEventListener('keydown', handleKeyDown);
        return function () {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);
    React__namespace.useEffect(function () {
        var container = containerRef.current;
        if (!container) {
            return;
        }
        var bookmarkElements = [].slice.call(container.getElementsByClassName('rpv-bookmark__item'));
        if (bookmarkElements.length > 0) {
            bookmarkElements[0].focus();
            bookmarkElements[0].setAttribute('tabindex', '0');
        }
    }, []);
    return (React__namespace.createElement("div", { ref: containerRef },
        React__namespace.createElement(BookmarkList, { bookmarks: bookmarks, depth: 0, doc: doc, isBookmarkExpanded: isBookmarkExpanded, isRoot: true, pathFromRoot: "", renderBookmarkItem: renderBookmarkItem, store: store })));
};

var BookmarkLoader = function (_a) {
    var doc = _a.doc, isBookmarkExpanded = _a.isBookmarkExpanded, renderBookmarkItem = _a.renderBookmarkItem, store = _a.store;
    var l10n = React__namespace.useContext(core.LocalizationContext).l10n;
    var direction = React__namespace.useContext(core.ThemeContext).direction;
    var isRtl = direction === core.TextDirection.RightToLeft;
    var _b = React__namespace.useState({
        isLoaded: false,
        items: [],
    }), bookmarks = _b[0], setBookmarks = _b[1];
    React__namespace.useEffect(function () {
        setBookmarks({
            isLoaded: false,
            items: [],
        });
        doc.getOutline().then(function (outline) {
            setBookmarks({
                isLoaded: true,
                items: outline || [],
            });
        });
    }, [doc]);
    return !bookmarks.isLoaded ? (React__namespace.createElement("div", { className: "rpv-bookmark__loader" },
        React__namespace.createElement(core.Spinner, null))) : bookmarks.items.length === 0 ? (React__namespace.createElement("div", { "data-testid": "bookmark__empty", className: core.classNames({
            'rpv-bookmark__empty': true,
            'rpv-bookmark__empty--rtl': isRtl,
        }) }, l10n && l10n.bookmark ? l10n.bookmark.noBookmark : 'There is no bookmark')) : (React__namespace.createElement("div", { "data-testid": "bookmark__container", className: core.classNames({
            'rpv-bookmark__container': true,
            'rpv-bookmark__container--rtl': isRtl,
        }) },
        React__namespace.createElement(BookmarkListRoot, { bookmarks: bookmarks.items, doc: doc, isBookmarkExpanded: isBookmarkExpanded, renderBookmarkItem: renderBookmarkItem, store: store })));
};

var BookmarkListWithStore = function (_a) {
    var isBookmarkExpanded = _a.isBookmarkExpanded, renderBookmarkItem = _a.renderBookmarkItem, store = _a.store;
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
    return currentDoc ? (React__namespace.createElement(BookmarkLoader, { doc: currentDoc, isBookmarkExpanded: isBookmarkExpanded, renderBookmarkItem: renderBookmarkItem, store: store })) : (React__namespace.createElement("div", { className: "rpv-bookmark__loader" },
        React__namespace.createElement(core.Spinner, null)));
};

var bookmarkPlugin = function () {
    var store = React__namespace.useMemo(function () {
        return core.createStore({
            bookmarkExpandedMap: new Map(),
        });
    }, []);
    var BookmarksDecorator = function (props) { return (React__namespace.createElement(BookmarkListWithStore, { isBookmarkExpanded: props === null || props === void 0 ? void 0 : props.isBookmarkExpanded, renderBookmarkItem: props === null || props === void 0 ? void 0 : props.renderBookmarkItem, store: store })); };
    return {
        install: function (pluginFunctions) {
            store.update('jumpToDestination', pluginFunctions.jumpToDestination);
        },
        onDocumentLoad: function (props) {
            store.update('doc', props.doc);
        },
        Bookmarks: BookmarksDecorator,
    };
};

exports.DownArrowIcon = DownArrowIcon;
exports.RightArrowIcon = RightArrowIcon;
exports.bookmarkPlugin = bookmarkPlugin;
