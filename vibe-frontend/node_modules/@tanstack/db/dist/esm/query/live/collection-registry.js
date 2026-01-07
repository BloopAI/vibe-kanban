import { LIVE_QUERY_INTERNAL } from "./internal.js";
const collectionBuilderRegistry = /* @__PURE__ */ new WeakMap();
function getBuilderFromConfig(config) {
  return config.utils?.[LIVE_QUERY_INTERNAL]?.getBuilder?.();
}
function registerCollectionBuilder(collection, builder) {
  collectionBuilderRegistry.set(collection, builder);
}
function getCollectionBuilder(collection) {
  return collectionBuilderRegistry.get(collection);
}
export {
  getBuilderFromConfig,
  getCollectionBuilder,
  registerCollectionBuilder
};
//# sourceMappingURL=collection-registry.js.map
