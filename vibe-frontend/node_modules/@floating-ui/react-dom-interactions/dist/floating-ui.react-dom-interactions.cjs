'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var React = require('react');
var reactDom = require('@floating-ui/react-dom');
var pointInPolygon = require('point-in-polygon');
var reactDom$1 = require('react-dom');
var ariaHidden = require('aria-hidden');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
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
  n["default"] = e;
  return Object.freeze(n);
}

var React__namespace = /*#__PURE__*/_interopNamespace(React);
var React__default = /*#__PURE__*/_interopDefaultLegacy(React);
var pointInPolygon__default = /*#__PURE__*/_interopDefaultLegacy(pointInPolygon);

var index = typeof document !== 'undefined' ? React.useLayoutEffect : React.useEffect;

function createPubSub() {
  const map = new Map();
  return {
    emit(event, data) {
      var _map$get;

      (_map$get = map.get(event)) == null ? void 0 : _map$get.forEach(handler => handler(data));
    },

    on(event, listener) {
      map.set(event, [...(map.get(event) || []), listener]);
    },

    off(event, listener) {
      map.set(event, (map.get(event) || []).filter(l => l !== listener));
    }

  };
}

let serverHandoffComplete = false;
let count = 0;

const genId = () => "floating-ui-" + count++;

function useFloatingId() {
  const [id, setId] = React__namespace.useState(() => serverHandoffComplete ? genId() : undefined);
  index(() => {
    if (id == null) {
      setId(genId());
    } // eslint-disable-next-line react-hooks/exhaustive-deps

  }, []);
  React__namespace.useEffect(() => {
    if (!serverHandoffComplete) {
      serverHandoffComplete = true;
    }
  }, []);
  return id;
} // `toString()` prevents bundlers from trying to `import { useId } from 'react'`


const useReactId = React__namespace[/*#__PURE__*/'useId'.toString()];
/**
 * Uses React 18's built-in `useId()` when available, or falls back to a
 * slightly less performant (requiring a double render) implementation for
 * earlier React versions.
 * @see https://floating-ui.com/docs/useId
 */

const useId = useReactId != null ? useReactId : useFloatingId;

const FloatingNodeContext = /*#__PURE__*/React.createContext(null);
const FloatingTreeContext = /*#__PURE__*/React.createContext(null);
const useFloatingParentNodeId = () => {
  var _useContext$id, _useContext;

  return (_useContext$id = (_useContext = React.useContext(FloatingNodeContext)) == null ? void 0 : _useContext.id) != null ? _useContext$id : null;
};
const useFloatingTree = () => React.useContext(FloatingTreeContext);
/**
 * Registers a node into the floating tree, returning its id.
 */

const useFloatingNodeId = () => {
  const id = useId();
  const tree = useFloatingTree();
  const parentId = useFloatingParentNodeId();
  index(() => {
    const node = {
      id,
      parentId
    };
    tree == null ? void 0 : tree.addNode(node);
    return () => {
      tree == null ? void 0 : tree.removeNode(node);
    };
  }, [tree, id, parentId]);
  return id;
};
/**
 * Provides parent node context for nested floating elements.
 * @see https://floating-ui.com/docs/FloatingTree
 */

const FloatingNode = _ref => {
  let {
    children,
    id
  } = _ref;
  const parentId = useFloatingParentNodeId();
  return /*#__PURE__*/React__default["default"].createElement(FloatingNodeContext.Provider, {
    value: React.useMemo(() => ({
      id,
      parentId
    }), [id, parentId])
  }, children);
};
/**
 * Provides context for nested floating elements when they are not children of
 * each other on the DOM (i.e. portalled to a common node, rather than their
 * respective parent).
 * @see https://floating-ui.com/docs/FloatingTree
 */

const FloatingTree = _ref2 => {
  let {
    children
  } = _ref2;
  const nodesRef = React.useRef([]);
  const addNode = React.useCallback(node => {
    nodesRef.current = [...nodesRef.current, node];
  }, []);
  const removeNode = React.useCallback(node => {
    nodesRef.current = nodesRef.current.filter(n => n !== node);
  }, []);
  const events = React.useState(() => createPubSub())[0];
  return /*#__PURE__*/React__default["default"].createElement(FloatingTreeContext.Provider, {
    value: React.useMemo(() => ({
      nodesRef,
      addNode,
      removeNode,
      events
    }), [nodesRef, addNode, removeNode, events])
  }, children);
};

function mergeProps(userProps, propsList, elementKey) {
  const fnsMap = {};
  return { ...(elementKey === 'floating' && {
      tabIndex: -1
    }),
    ...userProps,
    ...propsList.map(value => value ? value[elementKey] : null).concat(userProps).reduce((acc, props) => {
      if (!props) {
        return acc;
      }

      Object.entries(props).forEach(_ref => {
        let [key, value] = _ref;

        if (key.indexOf('on') === 0) {
          if (!fnsMap[key]) {
            fnsMap[key] = [];
          }

          if (typeof value === 'function') {
            fnsMap[key].push(value);
          }

          acc[key] = function () {
            for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
              args[_key] = arguments[_key];
            }

            fnsMap[key].forEach(fn => fn(...args));
          };
        } else {
          acc[key] = value;
        }
      });
      return acc;
    }, {})
  };
}

const useInteractions = function (propsList) {
  if (propsList === void 0) {
    propsList = [];
  }

  return {
    getReferenceProps: userProps => mergeProps(userProps, propsList, 'reference'),
    getFloatingProps: userProps => mergeProps(userProps, propsList, 'floating'),
    getItemProps: userProps => mergeProps(userProps, propsList, 'item')
  };
};

function getDocument(floating) {
  var _floating$ownerDocume;

  return (_floating$ownerDocume = floating == null ? void 0 : floating.ownerDocument) != null ? _floating$ownerDocume : document;
}

function getWindow(value) {
  var _getDocument$defaultV;

  return (_getDocument$defaultV = getDocument(value).defaultView) != null ? _getDocument$defaultV : window;
}

function isElement(value) {
  return value ? value instanceof getWindow(value).Element : false;
}
function isHTMLElement(value) {
  return value ? value instanceof getWindow(value).HTMLElement : false;
}

function getChildren(tree, id) {
  var _tree$nodesRef$curren;

  let allChildren = (_tree$nodesRef$curren = tree == null ? void 0 : tree.nodesRef.current.filter(node => {
    var _node$context;

    return node.parentId === id && ((_node$context = node.context) == null ? void 0 : _node$context.open);
  })) != null ? _tree$nodesRef$curren : [];
  let currentChildren = allChildren;

  while (currentChildren.length) {
    var _tree$nodesRef$curren2;

    currentChildren = (_tree$nodesRef$curren2 = tree == null ? void 0 : tree.nodesRef.current.filter(node => {
      var _currentChildren;

      return (_currentChildren = currentChildren) == null ? void 0 : _currentChildren.some(n => {
        var _node$context2;

        return node.parentId === n.id && ((_node$context2 = node.context) == null ? void 0 : _node$context2.open);
      });
    })) != null ? _tree$nodesRef$curren2 : [];
    allChildren = allChildren.concat(currentChildren);
  }

  return allChildren;
}

function safePolygon(_temp) {
  let {
    restMs = 0,
    buffer = 1,
    debug = null
  } = _temp === void 0 ? {} : _temp;
  let timeoutId;
  return _ref => {
    let {
      x,
      y,
      placement,
      refs,
      onClose,
      nodeId,
      tree
    } = _ref;
    return function onPointerMove(event) {
      var _refs$floating$curren;

      clearTimeout(timeoutId);

      if (event.pointerType && event.pointerType !== 'mouse') {
        return;
      }

      const {
        target,
        clientX,
        clientY
      } = event;
      const targetNode = target;

      if (event.type === 'pointermove' && isElement(refs.reference.current) && refs.reference.current.contains(targetNode) || (_refs$floating$curren = refs.floating.current) != null && _refs$floating$curren.contains(targetNode)) {
        return;
      } // If any child has a menu open, abort


      if (tree && getChildren(tree, nodeId).some(_ref2 => {
        let {
          context
        } = _ref2;
        return context == null ? void 0 : context.open;
      })) {
        return;
      }

      if (!refs.reference.current || !refs.floating.current || placement == null || x == null || y == null) {
        return;
      }

      const refRect = refs.reference.current.getBoundingClientRect();
      const rect = refs.floating.current.getBoundingClientRect();
      const side = placement.split('-')[0];
      const cursorLeaveFromRight = x > rect.right - rect.width / 2;
      const cursorLeaveFromBottom = y > rect.bottom - rect.height / 2; // Within the rectangular trough between the two elements

      switch (side) {
        case 'top':
          if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.bottom && clientY <= refRect.top) {
            return;
          }

          break;

        case 'bottom':
          if (clientX >= rect.left && clientX <= rect.right && clientY >= refRect.bottom && clientY <= rect.top) {
            return;
          }

          break;

        case 'left':
          if (clientX >= rect.right && clientX <= refRect.left && clientY >= rect.left && clientY <= rect.right) {
            return;
          }

          break;

        case 'right':
          if (clientX >= rect.right && clientX <= refRect.left && clientY >= rect.right && clientY <= refRect.left) {
            return;
          }

          break;
      }

      function getPolygon(_ref3) {
        let [x, y] = _ref3;
        const isFloatingWider = rect.width > refRect.width;
        const isFloatingTaller = rect.height > refRect.height;

        switch (side) {
          case 'top':
            {
              const cursorPointOne = [isFloatingWider ? x : cursorLeaveFromRight ? x + buffer : x - buffer, y + buffer];
              const cursorPointTwo = [isFloatingWider ? x : cursorLeaveFromRight ? x - buffer : x + buffer, y + buffer];
              const commonPoints = [[rect.left, cursorLeaveFromRight ? rect.bottom - buffer : isFloatingWider ? rect.bottom - buffer : rect.top], [rect.right, cursorLeaveFromRight ? isFloatingWider ? rect.bottom - buffer : rect.top : rect.bottom - buffer]];

              if (cursorLeaveFromRight) {
                return [cursorPointOne, cursorPointTwo, ...commonPoints];
              }

              return [cursorPointOne, ...commonPoints, cursorPointTwo];
            }

          case 'bottom':
            {
              const cursorPointOne = [isFloatingWider ? x : cursorLeaveFromRight ? x + buffer : x - buffer, y - buffer];
              const cursorPointTwo = [isFloatingWider ? x : cursorLeaveFromRight ? x - buffer : x + buffer, y - buffer];
              const commonPoints = [[rect.left, cursorLeaveFromRight ? rect.top + buffer : isFloatingWider ? rect.top + buffer : rect.bottom], [rect.right, cursorLeaveFromRight ? isFloatingWider ? rect.top + buffer : rect.bottom : rect.top + buffer]];

              if (cursorLeaveFromRight) {
                return [cursorPointOne, cursorPointTwo, ...commonPoints];
              }

              return [cursorPointOne, ...commonPoints, cursorPointTwo];
            }

          case 'left':
            {
              const cursorPointOne = [x + buffer, isFloatingTaller ? y : cursorLeaveFromBottom ? y - buffer : y + buffer];
              const cursorPointTwo = [x + buffer, isFloatingTaller ? y : cursorLeaveFromBottom ? y + buffer : y - buffer];
              const commonPoints = [[cursorLeaveFromBottom ? rect.right - buffer : isFloatingTaller ? rect.right - buffer : rect.left, rect.top], [cursorLeaveFromBottom ? isFloatingTaller ? rect.right - buffer : rect.left : rect.right - buffer, rect.bottom]];

              if (cursorLeaveFromBottom) {
                return [cursorPointOne, ...commonPoints, cursorPointTwo];
              }

              return [...commonPoints, cursorPointOne, cursorPointTwo];
            }

          case 'right':
            {
              const cursorPointOne = [x - buffer, isFloatingTaller ? y : cursorLeaveFromBottom ? y + buffer : y - buffer];
              const cursorPointTwo = [x - buffer, isFloatingTaller ? y : cursorLeaveFromBottom ? y - buffer : y + buffer];
              const commonPoints = [[cursorLeaveFromBottom ? rect.left + buffer : isFloatingTaller ? rect.left + buffer : rect.right, rect.top], [cursorLeaveFromBottom ? isFloatingTaller ? rect.left + buffer : rect.right : rect.left + buffer, rect.bottom]];

              if (cursorLeaveFromBottom) {
                return [cursorPointOne, cursorPointTwo, ...commonPoints];
              }

              return [cursorPointOne, ...commonPoints, cursorPointTwo];
            }
        }
      }

      const poly = getPolygon([x, y]);

      if (process.env.NODE_ENV !== "production") {
        debug == null ? void 0 : debug(poly.slice(0, 4).join(', '));
      }

      if (!pointInPolygon__default["default"]([clientX, clientY], poly)) {
        clearTimeout(timeoutId);
        onClose();
      } else if (restMs) {
        timeoutId = setTimeout(onClose, restMs);
      }
    };
  };
}

const DEFAULT_ID = 'floating-ui-root';
/**
 * Portals your floating element outside of the main app node.
 * @see https://floating-ui.com/docs/FloatingPortal
 */

const FloatingPortal = _ref => {
  let {
    children,
    id = DEFAULT_ID
  } = _ref;
  const [mounted, setMounted] = React.useState(false);
  const portalRef = React.useRef(null);
  index(() => {
    const root = document.getElementById(id);

    if (root) {
      portalRef.current = root;
    } else {
      portalRef.current = document.createElement('div');
      portalRef.current.id = id;
    }

    const el = portalRef.current;

    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }

    setMounted(true);
  }, [id]);

  if (mounted && portalRef.current) {
    return /*#__PURE__*/reactDom$1.createPortal(children, portalRef.current);
  }

  return null;
};

function _extends() {
  _extends = Object.assign || function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];

      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }

    return target;
  };

  return _extends.apply(this, arguments);
}

const identifier = 'data-floating-ui-scroll-lock';
/**
 * Provides base styling for a fixed overlay element to dim content or block
 * pointer events behind a floating element.
 * It's a regular `<div>`, so it can be styled via any CSS solution you prefer.
 * @see https://floating-ui.com/docs/FloatingOverlay
 */

const FloatingOverlay = /*#__PURE__*/React.forwardRef(function FloatingOverlay(_ref, ref) {
  let {
    lockScroll = false,
    ...rest
  } = _ref;
  index(() => {
    if (!lockScroll) {
      return;
    }

    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset; // RTL <body> scrollbar

    const scrollbarX = Math.round(document.documentElement.getBoundingClientRect().left) + document.documentElement.scrollLeft;
    const paddingProp = scrollbarX ? 'paddingLeft' : 'paddingRight';
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const alreadyLocked = document.body.hasAttribute(identifier);

    if (alreadyLocked) {
      return;
    }

    Object.assign(document.body.style, {
      position: 'fixed',
      overflow: 'hidden',
      top: "-" + scrollY + "px",
      left: "-" + scrollX + "px",
      right: '0',
      [paddingProp]: scrollbarWidth + "px"
    });
    document.body.setAttribute(identifier, '');
    return () => {
      Object.assign(document.body.style, {
        position: '',
        overflow: '',
        top: '',
        left: '',
        right: '',
        [paddingProp]: ''
      });
      document.body.removeAttribute(identifier);
      window.scrollTo(scrollX, scrollY);
    };
  }, [lockScroll]);
  return /*#__PURE__*/React__default["default"].createElement("div", _extends({
    ref: ref
  }, rest, {
    style: {
      position: 'fixed',
      overflow: 'auto',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...rest.style
    }
  }));
});

function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function useLatestRef(value) {
  const ref = React.useRef(value);
  index(() => {
    ref.current = value;
  });
  return ref;
}

function focus$1(el) {
  requestAnimationFrame(() => {
    el == null ? void 0 : el.focus();
  });
}

const SELECTOR = "input:not([type='hidden']):not([disabled]),select:not([disabled])," + 'textarea:not([disabled]),a[href],button:not([disabled]),[tabindex],' + 'iframe,object,embed,area[href],audio[controls],video[controls],' + "[contenteditable]:not([contenteditable='false'])";
const FocusGuard = /*#__PURE__*/React.forwardRef(function FocusGuard(props, ref) {
  return /*#__PURE__*/React__default["default"].createElement("span", _extends({}, props, {
    ref: ref,
    tabIndex: 0,
    style: {
      position: 'fixed',
      opacity: '0',
      pointerEvents: 'none',
      outline: '0'
    }
  }));
});

/**
 * Provides focus management for the floating element.
 * @see https://floating-ui.com/docs/FloatingFocusManager
 */
function FloatingFocusManager(_ref) {
  let {
    context: {
      refs,
      nodeId,
      onOpenChange
    },
    children,
    order = ['content'],
    endGuard = true,
    preventTabbing = false,
    initialFocus = 0,
    returnFocus = true,
    modal = true
  } = _ref;
  const orderRef = useLatestRef(order);
  const onOpenChangeRef = useLatestRef(onOpenChange);
  const tree = useFloatingTree();
  const getTabbableElements = React.useCallback(() => {
    return orderRef.current.map(type => {
      if (isHTMLElement(refs.reference.current) && type === 'reference') {
        return refs.reference.current;
      }

      if (refs.floating.current && type === 'floating') {
        return refs.floating.current;
      }

      if (type === 'content') {
        var _refs$floating$curren, _refs$floating$curren2;

        return Array.from((_refs$floating$curren = (_refs$floating$curren2 = refs.floating.current) == null ? void 0 : _refs$floating$curren2.querySelectorAll(SELECTOR)) != null ? _refs$floating$curren : []);
      }

      return null;
    }).flat().filter(el => {
      if (el === refs.floating.current || el === refs.reference.current) {
        return true;
      }

      if (isHTMLElement(el)) {
        var _el$getAttribute;

        const tabIndex = (_el$getAttribute = el.getAttribute('tabindex')) != null ? _el$getAttribute : '0';
        return tabIndex[0].trim() !== '-';
      }
    });
  }, [orderRef, refs.floating, refs.reference]);
  React.useEffect(() => {
    // If the floating element has no focusable elements inside it, fallback
    // to focusing the floating element and preventing tab navigation
    const noTabbableContentElements = getTabbableElements().filter(el => el !== refs.floating.current && // @ts-expect-error
    el !== refs.reference.current).length === 0;

    function onKeyDown(event) {
      if (event.key === 'Tab') {
        if (preventTabbing || noTabbableContentElements) {
          stopEvent(event);
        }

        const els = getTabbableElements();

        if (orderRef.current[0] === 'reference' && event.target === refs.reference.current) {
          stopEvent(event);

          if (event.shiftKey) {
            focus$1(els[els.length - 1]);
          } else {
            focus$1(els[1]);
          }
        }

        if (orderRef.current[1] === 'floating' && event.target === refs.floating.current && event.shiftKey) {
          stopEvent(event);
          focus$1(els[0]);
        }
      }
    }

    const doc = getDocument(refs.floating.current);
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('keydown', onKeyDown);
    };
  }, [preventTabbing, getTabbableElements, orderRef, refs.floating, refs.reference]);
  React.useEffect(() => {
    function onFloatingFocusOut(event) {
      var _refs$floating$curren3;

      const target = event.relatedTarget;

      if (!((_refs$floating$curren3 = refs.floating.current) != null && _refs$floating$curren3.contains(target)) && isElement(refs.reference.current) && !refs.reference.current.contains(target) && !(tree && getChildren(tree, nodeId).some(child => {
        var _child$context, _child$context$refs$f;

        return (_child$context = child.context) == null ? void 0 : (_child$context$refs$f = _child$context.refs.floating.current) == null ? void 0 : _child$context$refs$f.contains(target);
      }))) {
        onOpenChangeRef.current(false);
      }
    }

    const floating = refs.floating.current;
    const reference = refs.reference.current;

    if (floating && isHTMLElement(reference)) {
      !modal && floating.addEventListener('focusout', onFloatingFocusOut);
      const cleanup = modal ? ariaHidden.hideOthers(floating) : null;
      return () => {
        !modal && floating.removeEventListener('focusout', onFloatingFocusOut);
        cleanup == null ? void 0 : cleanup();
      };
    }
  }, [nodeId, tree, modal, onOpenChangeRef, getTabbableElements, initialFocus, refs.floating, refs.reference]);
  React.useEffect(() => {
    var _getDocument$activeEl;

    if (preventTabbing) {
      return;
    }

    const floating = refs.floating.current;
    const previouslyFocusedElement = (_getDocument$activeEl = getDocument(floating).activeElement) != null ? _getDocument$activeEl : document.activeElement;

    if (typeof initialFocus === 'number') {
      var _getTabbableElements$;

      focus$1((_getTabbableElements$ = getTabbableElements()[initialFocus]) != null ? _getTabbableElements$ : floating);
    } else if (isHTMLElement(initialFocus == null ? void 0 : initialFocus.current)) {
      var _initialFocus$current;

      focus$1((_initialFocus$current = initialFocus.current) != null ? _initialFocus$current : floating);
    }

    return () => {
      if (returnFocus && isHTMLElement(previouslyFocusedElement)) {
        focus$1(previouslyFocusedElement);
      }
    };
  }, [preventTabbing, getTabbableElements, initialFocus, modal, returnFocus, refs.floating]);
  return /*#__PURE__*/React__default["default"].createElement(React__default["default"].Fragment, null, modal && /*#__PURE__*/React__default["default"].createElement(FocusGuard, {
    onFocus: event => {
      stopEvent(event);
      const els = getTabbableElements();

      if (order[0] === 'reference') {
        focus$1(els[0]);
      } else {
        focus$1(els[els.length - 1]);
      }
    }
  }), /*#__PURE__*/React.cloneElement(children, order.includes('floating') ? {
    tabIndex: 0
  } : {}), modal && endGuard && /*#__PURE__*/React__default["default"].createElement(FocusGuard, {
    onFocus: event => {
      stopEvent(event);
      focus$1(getTabbableElements()[0]);
    }
  }));
}

function getDelay(value, prop, pointerType) {
  if (pointerType && pointerType !== 'mouse') {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  return value == null ? void 0 : value[prop];
}

/**
 * Adds hover event listeners that change the open state, like CSS :hover.
 * @see https://floating-ui.com/docs/useHover
 */
const useHover = function (context, _temp) {
  let {
    enabled = true,
    delay = 0,
    handleClose = null,
    mouseOnly = false,
    restMs = 0
  } = _temp === void 0 ? {} : _temp;
  const {
    open,
    onOpenChange,
    dataRef,
    events,
    refs
  } = context;
  const tree = useFloatingTree();
  const onOpenChangeRef = useLatestRef(onOpenChange);
  const handleCloseRef = useLatestRef(handleClose);
  const pointerTypeRef = React.useRef();
  const timeoutRef = React.useRef();
  const handlerRef = React.useRef();
  const restTimeoutRef = React.useRef();
  const blockMouseMoveRef = React.useRef(true);
  index(() => {
    if (!enabled) {
      return;
    }

    if (!open) {
      pointerTypeRef.current = undefined;
    }
  });
  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    function onDismiss() {
      clearTimeout(timeoutRef.current);
      clearTimeout(restTimeoutRef.current);
      blockMouseMoveRef.current = true;
    }

    events.on('dismiss', onDismiss);
    return () => {
      events.off('dismiss', onDismiss);
    };
  }, [enabled, events, refs.floating]);
  React.useEffect(() => {
    if (!enabled || !handleCloseRef.current) {
      return;
    }

    function onLeave() {
      var _dataRef$current$open;

      if ((_dataRef$current$open = dataRef.current.openEvent) != null && _dataRef$current$open.type.includes('mouse')) {
        onOpenChangeRef.current(false);
      }
    }

    const html = getDocument(refs.floating.current).documentElement;
    html.addEventListener('mouseleave', onLeave);
    return () => {
      html.removeEventListener('mouseleave', onLeave);
    };
  }, [refs.floating, onOpenChangeRef, enabled, handleCloseRef, dataRef]);
  const closeWithDelay = React.useCallback(function (runElseBranch) {
    if (runElseBranch === void 0) {
      runElseBranch = true;
    }

    if (delay && !handlerRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => onOpenChangeRef.current(false), getDelay(delay, 'close', pointerTypeRef.current));
    } else if (runElseBranch) {
      onOpenChangeRef.current(false);
    }
  }, [delay, onOpenChangeRef]);
  const cleanupPointerMoveHandler = React.useCallback(() => {
    if (handlerRef.current) {
      getDocument(refs.floating.current).removeEventListener('pointermove', handlerRef.current);
      handlerRef.current = undefined;
    }
  }, [refs.floating]);
  React.useEffect(() => {
    if (!open) {
      cleanupPointerMoveHandler();
    }
  }, [open, enabled, cleanupPointerMoveHandler]); // Registering the mouse events on the reference directly to bypass React's
  // delegation system. If the cursor was on a disabled element and then entered
  // the reference (no gap), `mouseenter` doesn't fire in the delegation system.

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    function onMouseEnter(event) {
      clearTimeout(timeoutRef.current);
      blockMouseMoveRef.current = false;

      if (open || mouseOnly && pointerTypeRef.current !== 'mouse' || restMs > 0 && getDelay(delay, 'open') === 0) {
        return;
      }

      dataRef.current.openEvent = event;

      if (delay) {
        timeoutRef.current = setTimeout(() => {
          onOpenChangeRef.current(true);
        }, getDelay(delay, 'open', pointerTypeRef.current));
      } else {
        onOpenChangeRef.current(true);
      }
    }

    function onMouseLeave(event) {
      var _dataRef$current$open2, _dataRef$current$open3;

      if (((_dataRef$current$open2 = dataRef.current.openEvent) == null ? void 0 : _dataRef$current$open2.type) === 'click' || ((_dataRef$current$open3 = dataRef.current.openEvent) == null ? void 0 : _dataRef$current$open3.type) === 'pointerdown') {
        return;
      }

      const doc = getDocument(refs.floating.current);
      clearTimeout(restTimeoutRef.current);

      if (handleCloseRef.current) {
        clearTimeout(timeoutRef.current);
        handlerRef.current && doc.removeEventListener('pointermove', handlerRef.current);
        handlerRef.current = handleCloseRef.current({ ...context,
          tree,
          x: event.clientX,
          y: event.clientY,

          onClose() {
            cleanupPointerMoveHandler();
            closeWithDelay();
          }

        });
        doc.addEventListener('pointermove', handlerRef.current);
        return;
      }

      closeWithDelay();
    }

    const reference = refs.reference.current;

    if (isElement(reference)) {
      reference.addEventListener('mouseenter', onMouseEnter);
      reference.addEventListener('mouseleave', onMouseLeave);
      return () => {
        reference.removeEventListener('mouseenter', onMouseEnter);
        reference.removeEventListener('mouseleave', onMouseLeave);
      };
    }
  }, [enabled, closeWithDelay, context, delay, handleCloseRef, dataRef, mouseOnly, onOpenChangeRef, open, tree, restMs, cleanupPointerMoveHandler, refs.reference, refs.floating]);

  if (!enabled) {
    return {};
  }

  function setPointerRef(event) {
    pointerTypeRef.current = event.pointerType;
  }

  return {
    reference: {
      onPointerDown: setPointerRef,
      onPointerEnter: setPointerRef,

      onMouseMove() {
        if (open || restMs === 0) {
          return;
        }

        clearTimeout(restTimeoutRef.current);
        restTimeoutRef.current = setTimeout(() => {
          if (!blockMouseMoveRef.current) {
            onOpenChange(true);
          }
        }, restMs);
      }

    },
    floating: {
      onMouseEnter() {
        clearTimeout(timeoutRef.current);
      },

      onMouseLeave: () => closeWithDelay(false)
    }
  };
};

const FloatingDelayGroupContext = /*#__PURE__*/React.createContext({
  delay: 1000,
  initialDelay: 1000,
  currentId: null,
  setCurrentId: () => {},
  setState: () => {}
});
const useDelayGroupContext = () => React.useContext(FloatingDelayGroupContext);
/**
 * Provides context for a group of floating elements that should share a
 * `delay`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */

const FloatingDelayGroup = _ref => {
  let {
    children,
    delay
  } = _ref;
  const [state, setState] = React.useState({
    delay,
    initialDelay: delay,
    currentId: null
  });
  const setCurrentId = React.useCallback(currentId => {
    setState(state => ({ ...state,
      currentId
    }));
  }, []);
  return /*#__PURE__*/React__default["default"].createElement(FloatingDelayGroupContext.Provider, {
    value: React.useMemo(() => ({ ...state,
      setState,
      setCurrentId
    }), [state, setState, setCurrentId])
  }, children);
};
const useDelayGroup = (_ref2, _ref3) => {
  let {
    open,
    onOpenChange
  } = _ref2;
  let {
    id
  } = _ref3;
  const {
    currentId,
    initialDelay,
    setState
  } = useDelayGroupContext();
  const onOpenChangeRef = useLatestRef(onOpenChange);
  React.useEffect(() => {
    if (currentId && onOpenChangeRef.current) {
      setState(state => ({ ...state,
        delay: {
          open: 1,
          close: getDelay(initialDelay, 'close')
        }
      }));

      if (currentId !== id) {
        onOpenChangeRef.current(false);
      }
    }
  }, [id, onOpenChangeRef, setState, currentId, initialDelay]);
  React.useEffect(() => {
    if (!open && currentId === id && onOpenChangeRef.current) {
      onOpenChangeRef.current(false);
      setState(state => ({ ...state,
        delay: initialDelay,
        currentId: null
      }));
    }
  }, [open, setState, currentId, id, onOpenChangeRef, initialDelay]);
};

/**
 * Adds relevant screen reader props for a given element `role`.
 * @see https://floating-ui.com/docs/useRole
 */
const useRole = function (_ref, _temp) {
  let {
    open
  } = _ref;
  let {
    enabled = true,
    role = 'dialog'
  } = _temp === void 0 ? {} : _temp;
  const rootId = useId();
  const referenceId = useId();
  const floatingProps = {
    id: rootId,
    role
  };

  if (!enabled) {
    return {};
  }

  if (role === 'tooltip') {
    return {
      reference: {
        'aria-describedby': open ? rootId : undefined
      },
      floating: floatingProps
    };
  }

  return {
    reference: {
      'aria-expanded': open ? 'true' : 'false',
      'aria-haspopup': role,
      'aria-controls': open ? rootId : undefined,
      ...(role === 'listbox' && {
        role: 'combobox'
      }),
      ...(role === 'menu' && {
        id: referenceId
      })
    },
    floating: { ...floatingProps,
      ...(role === 'menu' && {
        'aria-labelledby': referenceId
      })
    }
  };
};

/**
 * Adds click event listeners that change the open state (toggle behavior).
 * @see https://floating-ui.com/docs/useClick
 */
const useClick = function (_ref, _temp) {
  let {
    open,
    onOpenChange,
    dataRef
  } = _ref;
  let {
    enabled = true,
    pointerDown = false,
    toggle = true
  } = _temp === void 0 ? {} : _temp;
  const pointerTypeRef = React.useRef();

  if (!enabled) {
    return {};
  }

  return {
    reference: { ...(pointerDown && {
        onPointerDown(event) {
          pointerTypeRef.current = event.pointerType;

          if (open) {
            var _dataRef$current$open;

            if (toggle && ((_dataRef$current$open = dataRef.current.openEvent) == null ? void 0 : _dataRef$current$open.type) === 'pointerdown') {
              onOpenChange(false);
            }
          } else {
            onOpenChange(true);
          }

          dataRef.current.openEvent = event.nativeEvent;
        }

      }),

      onClick(event) {
        if (pointerDown && pointerTypeRef.current) {
          pointerTypeRef.current = undefined;
          return;
        }

        if (open) {
          var _dataRef$current$open2;

          if (toggle && ((_dataRef$current$open2 = dataRef.current.openEvent) == null ? void 0 : _dataRef$current$open2.type) === 'click') {
            onOpenChange(false);
          }
        } else {
          onOpenChange(true);
        }

        dataRef.current.openEvent = event.nativeEvent;
      }

    }
  };
};

/**
 * Adds listeners that dismiss (close) the floating element.
 * @see https://floating-ui.com/docs/useDismiss
 */
const useDismiss = function (_ref, _temp) {
  let {
    open,
    onOpenChange,
    refs,
    events,
    nodeId
  } = _ref;
  let {
    enabled = true,
    escapeKey = true,
    outsidePointerDown = true,
    referencePointerDown = false,
    ancestorScroll = false,
    bubbles = true
  } = _temp === void 0 ? {} : _temp;
  const tree = useFloatingTree();
  const onOpenChangeRef = useLatestRef(onOpenChange);
  const isFocusInsideFloating = React.useCallback(() => {
    var _refs$floating$curren;

    return (_refs$floating$curren = refs.floating.current) == null ? void 0 : _refs$floating$curren.contains(getDocument(refs.floating.current).activeElement);
  }, [refs.floating]);
  const focusReference = React.useCallback(() => {
    if (isHTMLElement(refs.reference.current)) {
      refs.reference.current.focus();
    }
  }, [refs.reference]);
  React.useEffect(() => {
    if (!open || !enabled) {
      return;
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (!bubbles && !isFocusInsideFloating()) {
          return;
        }

        events.emit('dismiss');
        onOpenChangeRef.current(false);
        focusReference();
      }
    }

    function onPointerDown(event) {
      var _refs$floating$curren2;

      const targetIsInsideChildren = tree && getChildren(tree, nodeId).some(node => {
        var _node$context, _node$context$refs$fl;

        return (_node$context = node.context) == null ? void 0 : (_node$context$refs$fl = _node$context.refs.floating.current) == null ? void 0 : _node$context$refs$fl.contains(event.target);
      });

      if ((_refs$floating$curren2 = refs.floating.current) != null && _refs$floating$curren2.contains(event.target) || isElement(refs.reference.current) && refs.reference.current.contains(event.target) || targetIsInsideChildren) {
        return;
      }

      if (!bubbles && !isFocusInsideFloating()) {
        return;
      }

      events.emit('dismiss');
      onOpenChangeRef.current(false);
      focusReference();
    }

    function onScroll() {
      onOpenChangeRef.current(false);
    }

    const doc = getDocument(refs.floating.current);
    escapeKey && doc.addEventListener('keydown', onKeyDown); // Use `mousedown` instead of `pointerdown` as it acts more like a click
    // on touch devices than a `touchstart` (which can result in accidental
    // dismissals too easily.)

    outsidePointerDown && doc.addEventListener('mousedown', onPointerDown);
    const ancestors = (ancestorScroll ? [...(isElement(refs.reference.current) ? reactDom.getOverflowAncestors(refs.reference.current) : []), ...(isElement(refs.floating.current) ? reactDom.getOverflowAncestors(refs.floating.current) : [])] : []).filter(ancestor => {
      var _doc$defaultView;

      return (// Ignore the visual viewport for scrolling dismissal (allow pinch-zoom)
        ancestor !== ((_doc$defaultView = doc.defaultView) == null ? void 0 : _doc$defaultView.visualViewport)
      );
    });
    ancestors.forEach(ancestor => ancestor.addEventListener('scroll', onScroll, {
      passive: true
    }));
    return () => {
      escapeKey && doc.removeEventListener('keydown', onKeyDown);
      outsidePointerDown && doc.removeEventListener('mousedown', onPointerDown);
      ancestors.forEach(ancestor => ancestor.removeEventListener('scroll', onScroll));
    };
  }, [escapeKey, outsidePointerDown, events, tree, nodeId, open, onOpenChangeRef, focusReference, ancestorScroll, enabled, bubbles, isFocusInsideFloating, refs.floating, refs.reference]);

  if (!enabled) {
    return {};
  }

  return {
    reference: {
      onPointerDown() {
        if (referencePointerDown) {
          events.emit('dismiss');
          onOpenChange(false);
        }
      }

    }
  };
};

/**
 * Adds focus event listeners that change the open state, like CSS :focus.
 * @see https://floating-ui.com/docs/useFocus
 */
const useFocus = function (_ref, _temp) {
  let {
    open,
    onOpenChange,
    dataRef,
    refs,
    events
  } = _ref;
  let {
    enabled = true,
    keyboardOnly = true
  } = _temp === void 0 ? {} : _temp;
  const blockFocusRef = React.useRef(false);
  React.useEffect(() => {
    var _doc$defaultView;

    if (!enabled) {
      return;
    }

    const doc = getDocument(refs.floating.current);
    const win = (_doc$defaultView = doc.defaultView) != null ? _doc$defaultView : window;

    function onBlur() {
      blockFocusRef.current = !open;
    }

    function onFocus() {
      setTimeout(() => {
        blockFocusRef.current = false;
      });
    }

    win.addEventListener('focus', onFocus);
    win.addEventListener('blur', onBlur);
    return () => {
      win.removeEventListener('focus', onFocus);
      win.removeEventListener('blur', onBlur);
    };
  }, [refs.floating, open, enabled]);
  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    function onDismiss() {
      blockFocusRef.current = true;
    }

    events.on('dismiss', onDismiss);
    return () => {
      events.off('dismiss', onDismiss);
    };
  }, [events, enabled]);

  if (!enabled) {
    return {};
  }

  return {
    reference: {
      onPointerDown(_ref2) {
        let {
          pointerType
        } = _ref2;
        blockFocusRef.current = !!(pointerType && keyboardOnly);
      },

      onFocus(event) {
        var _dataRef$current$open, _refs$reference$curre, _dataRef$current$open2;

        // Note: due to the `window` focus/blur listeners, switching between
        // DevTools touch/normal mode may cause this to fail on the first
        // focus of the window/touch of the element as it gets set to `false`.
        if (blockFocusRef.current) {
          return;
        } // Dismiss with click should ignore the subsequent `focus` trigger, but
        // only if the click originated inside the reference element.


        if (event.type === 'focus' && ((_dataRef$current$open = dataRef.current.openEvent) == null ? void 0 : _dataRef$current$open.type) === 'mousedown' && isElement(refs.reference.current) && (_refs$reference$curre = refs.reference.current) != null && _refs$reference$curre.contains((_dataRef$current$open2 = dataRef.current.openEvent) == null ? void 0 : _dataRef$current$open2.target)) {
          return;
        }

        dataRef.current.openEvent = event.nativeEvent;
        onOpenChange(true);
      },

      onBlur(event) {
        var _refs$floating$curren;

        const target = event.relatedTarget; // When focusing the reference element (e.g. regular click), then
        // clicking into the floating element, prevent it from hiding.
        // Note: it must be focusable, e.g. `tabindex="-1"`.

        if ((_refs$floating$curren = refs.floating.current) != null && _refs$floating$curren.contains(target) || isElement(refs.reference.current) && refs.reference.current.contains(target)) {
          return;
        }

        blockFocusRef.current = false;
        onOpenChange(false);
      }

    }
  };
};

const FOCUSABLE_ELEMENT_SELECTOR = 'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,object,embed,*[tabindex],*[contenteditable]';
const DEFAULT_ORDER = ['content'];

// When working with nested elements, we need to let the rendering occur before
// attempting focus. This fixes unwanted scrolling to the bottom of the document
function focus(el) {
  requestAnimationFrame(() => {
    el == null ? void 0 : el.focus();
  });
}
/**
 * @deprecated Use `<FloatingFocusManager />` instead.
 */


const useFocusTrap = function (_ref, _temp) {
  let {
    open,
    onOpenChange,
    refs,
    nodeId
  } = _ref;
  let {
    enabled = true,
    initialContentFocus = 0,
    order = DEFAULT_ORDER,
    modal = true,
    inert = false
  } = _temp === void 0 ? {} : _temp;
  const initializedRef = React.useRef(false);
  const beforeRef = React.useRef(null);
  const afterRef = React.useRef(null);
  const modalRef = useLatestRef(modal);
  const orderRef = useLatestRef(order);

  if (process.env.NODE_ENV !== "production") {
    if (modal && order.includes('reference')) {
      console.warn(['Floating UI: useFocusTrap() `order` array cannot contain', '"reference" while in `modal` mode.'].join(' '));
    }
  }

  const getFocusableElements = React.useCallback(() => {
    return orderRef.current.map(type => {
      if (isHTMLElement(refs.reference.current) && type === 'reference') {
        return refs.reference.current;
      }

      if (refs.floating.current && type === 'floating') {
        return refs.floating.current;
      }

      if (type === 'content') {
        var _refs$floating$curren, _refs$floating$curren2;

        return Array.from((_refs$floating$curren = (_refs$floating$curren2 = refs.floating.current) == null ? void 0 : _refs$floating$curren2.querySelectorAll(FOCUSABLE_ELEMENT_SELECTOR)) != null ? _refs$floating$curren : []);
      }

      return null;
    }).filter(Boolean).flat(); // Ignore `order` dep; only respond to changes on `open`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs.floating, refs.reference]); // Focus guard elements
  // https://github.com/w3c/aria-practices/issues/545

  index(() => {
    const floating = refs.floating.current;

    if (!enabled || !open || !floating || !modal) {
      return;
    }

    function createFocusGuardElement() {
      const doc = getDocument(floating);
      const el = doc.createElement('div');
      el.tabIndex = 0;
      Object.assign(el.style, {
        position: 'fixed',
        outline: '0',
        pointerEvents: 'none'
      });
      el.setAttribute('aria-hidden', 'true');
      return el;
    }

    if (!beforeRef.current) {
      beforeRef.current = createFocusGuardElement();
    }

    if (!afterRef.current) {
      afterRef.current = createFocusGuardElement();
    }

    const before = beforeRef.current;
    const after = afterRef.current;
    floating.insertAdjacentElement('beforebegin', before);
    floating.insertAdjacentElement('afterend', after);

    function onFocus(event) {
      var _focusableElements;

      stopEvent(event);
      const focusableElements = getFocusableElements();
      (_focusableElements = focusableElements[event.target === after ? 0 : focusableElements.length - 1]) == null ? void 0 : _focusableElements.focus();
    }

    before.addEventListener('focus', onFocus);
    after.addEventListener('focus', onFocus);
    return () => {
      var _before$parentNode, _after$parentNode;

      before.removeEventListener('focus', onFocus);
      after.removeEventListener('focus', onFocus);

      if ((_before$parentNode = before.parentNode) != null && _before$parentNode.contains(before)) {
        before.parentNode.removeChild(before);
      }

      if ((_after$parentNode = after.parentNode) != null && _after$parentNode.contains(after)) {
        after.parentNode.removeChild(after);
      }
    };
  }, [enabled, open, modal, inert, getFocusableElements, refs.floating]); // Inert

  React.useEffect(() => {
    if (!enabled || !open || !inert) {
      return;
    }

    function onKeyDown(event) {
      if (event.key === 'Tab') {
        stopEvent(event);
      }
    }

    const doc = getDocument(refs.floating.current);
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, open, inert, refs.floating]); // Initial focus

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    const focusableElements = getFocusableElements();

    if (inert) {
      if (open) {
        const first = focusableElements[0];

        if (first === refs.floating.current && !first.contains(first.ownerDocument.activeElement)) {
          focus(first);
        }
      }

      return;
    }

    if (open) {
      if (typeof initialContentFocus === 'number') {
        focus(focusableElements[initialContentFocus]);
      } else if (initialContentFocus.current) {
        focus(focusableElements.find(element => element === initialContentFocus.current));
      }
    }
  }, [getFocusableElements, open, inert, modal, initialContentFocus, enabled, refs.reference, refs.floating]); // Return focus to reference

  React.useEffect(() => {
    if (!enabled || inert) {
      return;
    }

    if (!open && modalRef.current && initializedRef.current && isHTMLElement(refs.reference.current)) {
      focus(refs.reference.current);
    }
  }, [open, enabled, inert, modalRef, refs.reference]); // Hide all outside nodes from screen readers

  React.useEffect(() => {
    if (!open || !modal || !enabled || !refs.floating.current) {
      return;
    }

    return ariaHidden.hideOthers(refs.floating.current);
  }, [open, modal, enabled, refs.floating]);
  React.useEffect(() => {
    initializedRef.current = true;
    return () => {
      initializedRef.current = false;
    };
  }, []);
  const tree = useFloatingTree();

  function onBlur(event) {
    var _refs$floating$curren3;

    const target = event.relatedTarget;

    if (!((_refs$floating$curren3 = refs.floating.current) != null && _refs$floating$curren3.contains(target)) && isElement(refs.reference.current) && !refs.reference.current.contains(target) && !(tree && getChildren(tree, nodeId).some(child => {
      var _child$context, _child$context$refs$f, _child$context$refs$f2;

      return (_child$context = child.context) == null ? void 0 : (_child$context$refs$f = _child$context.refs.floating) == null ? void 0 : (_child$context$refs$f2 = _child$context$refs$f.current) == null ? void 0 : _child$context$refs$f2.contains(target);
    }))) {
      onOpenChange(false);
    }
  }

  if (!enabled) {
    return {};
  }

  if (modal) {
    return {
      floating: {
        'aria-modal': 'true'
      }
    };
  }

  return {
    reference: {
      onBlur
    },
    floating: {
      onBlur
    }
  };
};

function usePrevious(value) {
  const ref = React.useRef();
  index(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

const ARROW_UP = 'ArrowUp';
const ARROW_DOWN = 'ArrowDown';
const ARROW_LEFT = 'ArrowLeft';
const ARROW_RIGHT = 'ArrowRight';

function findNonDisabledIndex(listRef, _temp) {
  let {
    startingIndex = -1,
    decrement = false
  } = _temp === void 0 ? {} : _temp;
  const list = listRef.current;
  let index = startingIndex;

  do {
    var _list$index, _list$index2;

    index = index + (decrement ? -1 : 1);
  } while (index >= 0 && index <= list.length - 1 && (list[index] == null || (_list$index = list[index]) != null && _list$index.hasAttribute('disabled') || ((_list$index2 = list[index]) == null ? void 0 : _list$index2.getAttribute('aria-disabled')) === 'true'));

  return index;
}

function doSwitch(orientation, vertical, horizontal) {
  switch (orientation) {
    case 'vertical':
      return vertical;

    case 'horizontal':
      return horizontal;

    default:
      return vertical || horizontal;
  }
}

function isMainOrientationKey(key, orientation) {
  const vertical = key === ARROW_UP || key === ARROW_DOWN;
  const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal);
}

function isMainOrientationToStartKey(key, orientation, rtl) {
  const vertical = key === ARROW_UP;
  const horizontal = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
  return doSwitch(orientation, vertical, horizontal);
}

function isMainOrientationToEndKey(key, orientation, rtl) {
  const vertical = key === ARROW_DOWN;
  const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal);
}

function isCrossOrientationOpenKey(key, orientation, rtl) {
  const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  const horizontal = key === ARROW_DOWN;
  return doSwitch(orientation, vertical, horizontal);
}

function isCrossOrientationCloseKey(key, orientation, rtl) {
  const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
  const horizontal = key === ARROW_UP;
  return doSwitch(orientation, vertical, horizontal);
}

function getMinIndex(listRef) {
  return findNonDisabledIndex(listRef);
}

function getMaxIndex(listRef) {
  return findNonDisabledIndex(listRef, {
    decrement: true,
    startingIndex: listRef.current.length
  });
}

/**
 * Adds focus-managed indexed navigation via arrow keys to a list of items
 * within the floating element.
 * @see https://floating-ui.com/docs/useListNavigation
 */
const useListNavigation = function (_ref, _temp2) {
  let {
    open,
    onOpenChange,
    refs
  } = _ref;
  let {
    listRef,
    activeIndex,
    onNavigate,
    enabled = true,
    selectedIndex = null,
    allowEscape = false,
    loop = false,
    nested = false,
    rtl = false,
    virtual = false,
    focusItemOnOpen = 'auto',
    focusItemOnHover = true,
    orientation = 'vertical'
  } = _temp2 === void 0 ? {
    listRef: {
      current: []
    },
    activeIndex: null,
    onNavigate: () => {}
  } : _temp2;

  if (process.env.NODE_ENV !== "production") {
    if (!loop && allowEscape) {
      console.warn(['Floating UI: `useListNavigation` looping must be enabled to allow', 'escaping.'].join(' '));
    }
  }

  const parentId = useFloatingParentNodeId();
  const tree = useFloatingTree();
  const previousOpen = usePrevious(open);
  const focusOnOpenRef = React.useRef(focusItemOnOpen);
  const indexRef = React.useRef(selectedIndex != null ? selectedIndex : -1);
  const keyRef = React.useRef('');
  const initializedRef = React.useRef(false);
  const onNavigateRef = useLatestRef(onNavigate);
  const blockPointerLeaveRef = React.useRef(false);
  const [activeId, setActiveId] = React.useState();
  const focusItem = React.useCallback((listRef, indexRef) => {
    if (virtual) {
      var _listRef$current$inde;

      setActiveId((_listRef$current$inde = listRef.current[indexRef.current]) == null ? void 0 : _listRef$current$inde.id);
    } else {
      var _listRef$current$inde2;

      (_listRef$current$inde2 = listRef.current[indexRef.current]) == null ? void 0 : _listRef$current$inde2.focus({
        preventScroll: true
      });
    }
  }, [virtual]);
  index(() => {
    if (!enabled) {
      return;
    }

    if (selectedIndex != null) {
      indexRef.current = selectedIndex;
    }

    if (!previousOpen && open && focusOnOpenRef.current) {
      onNavigateRef.current(indexRef.current);
      focusItem(listRef, indexRef);
    }
  }, [open, previousOpen, selectedIndex, listRef, onNavigateRef, focusItem, enabled]);
  index(() => {
    if (!enabled) {
      return;
    }

    if (open) {
      if (activeIndex === null) {
        if (!previousOpen && focusOnOpenRef.current && selectedIndex == null || allowEscape) {
          indexRef.current = allowEscape ? -1 : getMinIndex(listRef);
          onNavigateRef.current(activeIndex);
          focusItem(listRef, indexRef);
        }
      } else {
        indexRef.current = activeIndex;
        onNavigateRef.current(activeIndex);
        focusItem(listRef, indexRef);
      }
    }
  }, [open, previousOpen, activeIndex, selectedIndex, nested, listRef, onNavigateRef, focusItem, enabled, parentId, allowEscape, refs.floating, tree == null ? void 0 : tree.nodesRef]);
  index(() => {
    if (selectedIndex != null || !enabled) {
      return;
    }

    if (open) {
      if (isMainOrientationKey(keyRef.current, orientation) || focusOnOpenRef.current && (keyRef.current === ' ' || keyRef.current === 'Enter')) {
        const minIndex = getMinIndex(listRef);
        const maxIndex = getMaxIndex(listRef);
        indexRef.current = isMainOrientationToStartKey(keyRef.current, orientation, rtl) ? allowEscape ? listRef.current.length : maxIndex : allowEscape ? -1 : minIndex;
        onNavigateRef.current(indexRef.current);
        focusItem(listRef, indexRef);
      }
    }

    keyRef.current = '';
  }, [open, listRef, selectedIndex, onNavigateRef, focusItem, enabled, orientation, rtl, allowEscape]);
  index(() => {
    if (!enabled) {
      return;
    }

    if (!open && initializedRef.current && selectedIndex != null && isHTMLElement(refs.reference.current)) {
      refs.reference.current.focus();
    }
  }, [refs.reference, selectedIndex, open, enabled]);
  index(() => {
    initializedRef.current = true;
    return () => {
      initializedRef.current = false;
    };
  }, []);
  index(() => {
    if (!enabled) {
      return;
    }

    if (!open) {
      var _ref2;

      if (focusItemOnOpen === 'auto') {
        focusOnOpenRef.current = true;
      }

      indexRef.current = (_ref2 = selectedIndex != null ? selectedIndex : activeIndex) != null ? _ref2 : -1;
      onNavigateRef.current(null);
    }
  }, [open, selectedIndex, activeIndex, enabled, focusItemOnOpen, onNavigateRef]);

  function pointerCheck(event) {
    if (focusItemOnOpen === 'auto') {
      // undefined or '' depending on the browser
      focusOnOpenRef.current = !event.pointerType;
    }
  }

  function onFloatingKeyDown(event) {
    blockPointerLeaveRef.current = true;

    if (nested && isCrossOrientationCloseKey(event.key, orientation, rtl)) {
      stopEvent(event);
      onOpenChange(false);

      if (isHTMLElement(refs.reference.current)) {
        refs.reference.current.focus();
      }

      return;
    }

    const currentIndex = indexRef.current;
    const minIndex = getMinIndex(listRef);
    const maxIndex = getMaxIndex(listRef);

    if (event.key === 'Home') {
      indexRef.current = minIndex;
      onNavigate(indexRef.current);
    }

    if (event.key === 'End') {
      indexRef.current = maxIndex;
      onNavigate(indexRef.current);
    }

    if (isMainOrientationKey(event.key, orientation)) {
      stopEvent(event);

      if (!virtual && event.currentTarget.ownerDocument.activeElement === event.currentTarget) {
        indexRef.current = selectedIndex != null ? selectedIndex : isMainOrientationToEndKey(event.key, orientation, rtl) ? minIndex : maxIndex;
        onNavigate(indexRef.current);
        return;
      }

      if (isMainOrientationToEndKey(event.key, orientation, rtl)) {
        if (loop) {
          indexRef.current = currentIndex >= maxIndex ? allowEscape && currentIndex !== listRef.current.length ? -1 : minIndex : findNonDisabledIndex(listRef, {
            startingIndex: currentIndex
          });
        } else {
          indexRef.current = Math.min(maxIndex, findNonDisabledIndex(listRef, {
            startingIndex: currentIndex
          }));
        }
      } else {
        if (loop) {
          indexRef.current = currentIndex <= minIndex ? allowEscape && currentIndex !== -1 ? listRef.current.length : maxIndex : findNonDisabledIndex(listRef, {
            startingIndex: currentIndex,
            decrement: true
          });
        } else {
          indexRef.current = Math.max(minIndex, findNonDisabledIndex(listRef, {
            startingIndex: currentIndex,
            decrement: true
          }));
        }
      }

      onNavigate(indexRef.current);
    }
  }

  if (!enabled) {
    return {};
  }

  return {
    reference: { ...(virtual && open && activeIndex != null && {
        'aria-activedescendant': activeId
      }),
      onPointerEnter: pointerCheck,
      onPointerDown: pointerCheck,

      onKeyDown(event) {
        blockPointerLeaveRef.current = true;

        if (virtual && open) {
          return onFloatingKeyDown(event);
        }

        if (focusItemOnOpen === 'auto') {
          focusOnOpenRef.current = true;
        }

        keyRef.current = event.key;

        if (nested) {
          if (isCrossOrientationOpenKey(event.key, orientation, rtl)) {
            stopEvent(event);

            if (open) {
              indexRef.current = getMinIndex(listRef);
              onNavigate(indexRef.current);
            } else {
              onOpenChange(true);
            }
          }

          return;
        }

        if (isMainOrientationKey(event.key, orientation)) {
          if (selectedIndex == null) {
            indexRef.current = isMainOrientationToEndKey(event.key, orientation, rtl) ? getMinIndex(listRef) : getMaxIndex(listRef);
          } else {
            indexRef.current = selectedIndex;
          }

          stopEvent(event);
          onOpenChange(true);
          onNavigate(indexRef.current);
        }

        if (virtual && !open) {
          onFloatingKeyDown(event);
        }
      }

    },
    floating: {
      'aria-orientation': orientation === 'both' ? undefined : orientation,
      ...(virtual && activeIndex != null && {
        'aria-activedescendant': activeId
      }),
      onKeyDown: onFloatingKeyDown,

      onPointerMove() {
        blockPointerLeaveRef.current = false;
      }

    },
    item: {
      onClick: _ref3 => {
        let {
          currentTarget
        } = _ref3;
        return currentTarget.focus({
          preventScroll: true
        });
      },
      // Safari
      ...(focusItemOnHover && {
        onPointerMove(_ref4) {
          let {
            currentTarget
          } = _ref4;
          const target = currentTarget;

          if (target) {
            const index = listRef.current.indexOf(target);

            if (index !== -1) {
              onNavigate(index);
            }
          }
        },

        onPointerLeave() {
          if (!blockPointerLeaveRef.current) {
            onNavigate(null);

            if (!virtual) {
              var _refs$floating$curren;

              (_refs$floating$curren = refs.floating.current) == null ? void 0 : _refs$floating$curren.focus({
                preventScroll: true
              });
            } else {
              indexRef.current = -1;
              focusItem(listRef, indexRef);
            }
          }
        }

      })
    }
  };
};

/**
 * Provides a matching callback that can be used to focus an item as the user
 * types, often used in tandem with `useListNavigation()`.
 * @see https://floating-ui.com/docs/useTypeahead
 */
const useTypeahead = function (_ref, _temp) {
  var _ref2;

  let {
    open,
    dataRef
  } = _ref;
  let {
    listRef,
    activeIndex,
    onMatch = () => {},
    enabled = true,
    findMatch = null,
    resetMs = 1000,
    ignoreKeys = [],
    selectedIndex = null
  } = _temp === void 0 ? {
    listRef: {
      current: []
    },
    activeIndex: null
  } : _temp;
  const timeoutIdRef = React.useRef();
  const stringRef = React.useRef('');
  const prevIndexRef = React.useRef((_ref2 = selectedIndex != null ? selectedIndex : activeIndex) != null ? _ref2 : -1);
  const matchIndexRef = React.useRef(null);
  index(() => {
    if (open) {
      clearTimeout(timeoutIdRef.current);
      matchIndexRef.current = null;
      stringRef.current = '';
    }
  }, [open]);
  index(() => {
    // Sync arrow key navigation but not typeahead navigation
    if (open && stringRef.current === '') {
      var _ref3;

      prevIndexRef.current = (_ref3 = selectedIndex != null ? selectedIndex : activeIndex) != null ? _ref3 : -1;
    }
  }, [open, selectedIndex, activeIndex]);

  function onKeyDown(event) {
    if (!event.currentTarget.contains(getDocument(event.currentTarget).activeElement)) {
      return;
    }

    if (stringRef.current.length > 0 && stringRef.current[0] !== ' ') {
      dataRef.current.typing = true;

      if (event.key === ' ') {
        stopEvent(event);
      }
    }

    const listContent = listRef.current;

    if (listContent == null || ['Home', 'End', 'Escape', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ...ignoreKeys].includes(event.key)) {
      return;
    } // Bail out if the list contains a word like "llama" or "aaron". TODO:
    // allow it in this case, too.


    const allowRapidSuccessionOfFirstLetter = listContent.every(text => {
      var _text$, _text$2;

      return text ? ((_text$ = text[0]) == null ? void 0 : _text$.toLocaleLowerCase()) !== ((_text$2 = text[1]) == null ? void 0 : _text$2.toLocaleLowerCase()) : true;
    }); // Allows the user to cycle through items that start with the same letter
    // in rapid succession

    if (allowRapidSuccessionOfFirstLetter && stringRef.current === event.key) {
      stringRef.current = '';
      prevIndexRef.current = matchIndexRef.current;
    }

    stringRef.current += event.key;
    clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = setTimeout(() => {
      stringRef.current = '';
      prevIndexRef.current = matchIndexRef.current;
      dataRef.current.typing = false;
    }, resetMs);
    const prevIndex = prevIndexRef.current;
    const orderedList = [...listContent.slice((prevIndex != null ? prevIndex : 0) + 1), ...listContent.slice(0, (prevIndex != null ? prevIndex : 0) + 1)];
    const str = findMatch ? findMatch(orderedList, stringRef.current) : orderedList.find(text => (text == null ? void 0 : text.toLocaleLowerCase().indexOf(stringRef.current)) === 0);
    const index = str ? listContent.indexOf(str) : -1;

    if (index !== -1) {
      onMatch(index);
      matchIndexRef.current = index;
    }
  }

  if (!enabled) {
    return {};
  }

  return {
    reference: {
      onKeyDown
    },
    floating: {
      onKeyDown
    }
  };
};

function useFloating(_temp) {
  let {
    open = false,
    onOpenChange = () => {},
    placement,
    middleware,
    strategy,
    nodeId
  } = _temp === void 0 ? {} : _temp;
  const tree = useFloatingTree();
  const dataRef = React.useRef({});
  const events = React.useState(() => createPubSub())[0];
  const floating = reactDom.useFloating({
    placement,
    middleware,
    strategy
  });
  const context = React.useMemo(() => ({ ...floating,
    dataRef,
    nodeId,
    events,
    open,
    onOpenChange
  }), [floating, dataRef, nodeId, events, open, onOpenChange]);
  index(() => {
    const node = tree == null ? void 0 : tree.nodesRef.current.find(node => node.id === nodeId);

    if (node) {
      node.context = context;
    }
  });
  return React.useMemo(() => ({
    context,
    ...floating
  }), [floating, context]);
}

exports.FloatingDelayGroup = FloatingDelayGroup;
exports.FloatingFocusManager = FloatingFocusManager;
exports.FloatingNode = FloatingNode;
exports.FloatingOverlay = FloatingOverlay;
exports.FloatingPortal = FloatingPortal;
exports.FloatingTree = FloatingTree;
exports.safePolygon = safePolygon;
exports.useClick = useClick;
exports.useDelayGroup = useDelayGroup;
exports.useDelayGroupContext = useDelayGroupContext;
exports.useDismiss = useDismiss;
exports.useFloating = useFloating;
exports.useFloatingNodeId = useFloatingNodeId;
exports.useFloatingParentNodeId = useFloatingParentNodeId;
exports.useFloatingTree = useFloatingTree;
exports.useFocus = useFocus;
exports.useFocusTrap = useFocusTrap;
exports.useHover = useHover;
exports.useId = useId;
exports.useInteractions = useInteractions;
exports.useListNavigation = useListNavigation;
exports.useRole = useRole;
exports.useTypeahead = useTypeahead;
Object.keys(reactDom).forEach(function (k) {
  if (k !== 'default' && !exports.hasOwnProperty(k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: function () { return reactDom[k]; }
  });
});
