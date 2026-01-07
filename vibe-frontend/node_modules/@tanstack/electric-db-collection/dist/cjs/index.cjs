"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electric = require("./electric.cjs");
const errors = require("./errors.cjs");
const client = require("@electric-sql/client");
exports.electricCollectionOptions = electric.electricCollectionOptions;
exports.ElectricDBCollectionError = errors.ElectricDBCollectionError;
exports.ExpectedNumberInAwaitTxIdError = errors.ExpectedNumberInAwaitTxIdError;
exports.StreamAbortedError = errors.StreamAbortedError;
exports.TimeoutWaitingForMatchError = errors.TimeoutWaitingForMatchError;
exports.TimeoutWaitingForTxIdError = errors.TimeoutWaitingForTxIdError;
Object.defineProperty(exports, "isChangeMessage", {
  enumerable: true,
  get: () => client.isChangeMessage
});
Object.defineProperty(exports, "isControlMessage", {
  enumerable: true,
  get: () => client.isControlMessage
});
//# sourceMappingURL=index.cjs.map
