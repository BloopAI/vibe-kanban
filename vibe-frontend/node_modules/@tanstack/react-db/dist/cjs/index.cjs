"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const useLiveQuery = require("./useLiveQuery.cjs");
const useLiveSuspenseQuery = require("./useLiveSuspenseQuery.cjs");
const usePacedMutations = require("./usePacedMutations.cjs");
const useLiveInfiniteQuery = require("./useLiveInfiniteQuery.cjs");
const db = require("@tanstack/db");
exports.useLiveQuery = useLiveQuery.useLiveQuery;
exports.useLiveSuspenseQuery = useLiveSuspenseQuery.useLiveSuspenseQuery;
exports.usePacedMutations = usePacedMutations.usePacedMutations;
exports.useLiveInfiniteQuery = useLiveInfiniteQuery.useLiveInfiniteQuery;
Object.defineProperty(exports, "createTransaction", {
  enumerable: true,
  get: () => db.createTransaction
});
Object.keys(db).forEach((k) => {
  if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: () => db[k]
  });
});
//# sourceMappingURL=index.cjs.map
