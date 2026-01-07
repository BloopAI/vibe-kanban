"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const internal = require("./internal.cjs");
const collectionBuilderRegistry = /* @__PURE__ */ new WeakMap();
function getBuilderFromConfig(config) {
  return config.utils?.[internal.LIVE_QUERY_INTERNAL]?.getBuilder?.();
}
function registerCollectionBuilder(collection, builder) {
  collectionBuilderRegistry.set(collection, builder);
}
function getCollectionBuilder(collection) {
  return collectionBuilderRegistry.get(collection);
}
exports.getBuilderFromConfig = getBuilderFromConfig;
exports.getCollectionBuilder = getCollectionBuilder;
exports.registerCollectionBuilder = registerCollectionBuilder;
//# sourceMappingURL=collection-registry.cjs.map
