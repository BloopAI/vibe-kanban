'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function mergeRefs(refs) {
  return function (value) {
    refs.forEach(function (ref) {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref != null) {
        ref.current = value;
      }
    });
  };
}

exports.default = mergeRefs;
//# sourceMappingURL=react-merge-refs.cjs.development.js.map
