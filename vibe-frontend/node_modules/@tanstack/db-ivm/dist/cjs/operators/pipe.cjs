"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
function pipe(...operators) {
  return (stream) => {
    return stream.pipe(...operators);
  };
}
exports.pipe = pipe;
//# sourceMappingURL=pipe.cjs.map
