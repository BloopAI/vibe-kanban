"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const React = require("react");
const formCore = require("@tanstack/form-core");
function useUUID() {
  return React.useState(() => formCore.uuid())[0];
}
exports.useUUID = useUUID;
//# sourceMappingURL=useUUID.cjs.map
