'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var dom = require('@floating-ui/dom');
var react = require('react');
var reactDom = require('react-dom');

var index = typeof document !== 'undefined' ? react.useLayoutEffect : react.useEffect;

// Fork of `fast-deep-equal` that only does the comparisons we need and compares
// functions
// @ts-nocheck
function deepEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (typeof a === 'function' && a.toString() === b.toString()) {
    return true;
  }

  let length, i, keys;

  if (a && b && typeof a == 'object') {
    if (Array.isArray(a)) {
      length = a.length;
      if (length != b.length) return false;

      for (i = length; i-- !== 0;) {
        if (!deepEqual(a[i], b[i])) {
          return false;
        }
      }

      return true;
    }

    keys = Object.keys(a);
    length = keys.length;

    if (length !== Object.keys(b).length) {
      return false;
    }

    for (i = length; i-- !== 0;) {
      if (!Object.prototype.hasOwnProperty.call(b, keys[i])) {
        return false;
      }
    }

    for (i = length; i-- !== 0;) {
      const key = keys[i];

      if (key === '_owner' && a.$$typeof) {
        continue;
      }

      if (!deepEqual(a[key], b[key])) {
        return false;
      }
    }

    return true;
  }

  return a !== a && b !== b;
}

function useFloating(_temp) {
  let {
    middleware,
    placement = 'bottom',
    strategy = 'absolute'
  } = _temp === void 0 ? {} : _temp;
  const reference = react.useRef(null);
  const floating = react.useRef(null);
  const [data, setData] = react.useState({
    // Setting these to `null` will allow the consumer to determine if
    // `computePosition()` has run yet
    x: null,
    y: null,
    strategy,
    placement,
    middlewareData: {}
  });
  const [latestMiddleware, setLatestMiddleware] = react.useState(middleware);

  if (!deepEqual(latestMiddleware == null ? void 0 : latestMiddleware.map(_ref => {
    let {
      options
    } = _ref;
    return options;
  }), middleware == null ? void 0 : middleware.map(_ref2 => {
    let {
      options
    } = _ref2;
    return options;
  }))) {
    setLatestMiddleware(middleware);
  }

  const isMountedRef = react.useRef(true);
  index(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const update = react.useCallback(() => {
    if (!reference.current || !floating.current) {
      return;
    }

    dom.computePosition(reference.current, floating.current, {
      middleware: latestMiddleware,
      placement,
      strategy
    }).then(data => {
      if (isMountedRef.current) {
        reactDom.flushSync(() => {
          setData(data);
        });
      }
    });
  }, [latestMiddleware, placement, strategy]);
  index(update, [update]);
  const setReference = react.useCallback(node => {
    reference.current = node;
    update();
  }, [update]);
  const setFloating = react.useCallback(node => {
    floating.current = node;
    update();
  }, [update]);
  const refs = react.useMemo(() => ({
    reference,
    floating
  }), []);
  return react.useMemo(() => ({ ...data,
    update,
    refs,
    reference: setReference,
    floating: setFloating
  }), [data, update, refs, setReference, setFloating]);
}
const arrow = options => {
  const {
    element,
    padding
  } = options;

  function isRef(value) {
    return Object.prototype.hasOwnProperty.call(value, 'current');
  }

  return {
    name: 'arrow',
    options,

    fn(args) {
      if (isRef(element)) {
        if (element.current != null) {
          return dom.arrow({
            element: element.current,
            padding
          }).fn(args);
        }

        return {};
      } else if (element) {
        return dom.arrow({
          element,
          padding
        }).fn(args);
      }

      return {};
    }

  };
};

exports.arrow = arrow;
exports.useFloating = useFloating;
Object.keys(dom).forEach(function (k) {
  if (k !== 'default' && !exports.hasOwnProperty(k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: function () { return dom[k]; }
  });
});
