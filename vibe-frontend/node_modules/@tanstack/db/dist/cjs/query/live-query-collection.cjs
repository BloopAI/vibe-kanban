"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const index = require("../collection/index.cjs");
const collectionConfigBuilder = require("./live/collection-config-builder.cjs");
const collectionRegistry = require("./live/collection-registry.cjs");
function liveQueryCollectionOptions(config) {
  const collectionConfigBuilder$1 = new collectionConfigBuilder.CollectionConfigBuilder(config);
  return collectionConfigBuilder$1.getConfig();
}
function createLiveQueryCollection(configOrQuery) {
  if (typeof configOrQuery === `function`) {
    const config = {
      query: configOrQuery
    };
    const options = liveQueryCollectionOptions(config);
    return bridgeToCreateCollection(options);
  } else {
    const config = configOrQuery;
    const options = liveQueryCollectionOptions(config);
    if (config.utils) {
      options.utils = { ...options.utils, ...config.utils };
    }
    return bridgeToCreateCollection(options);
  }
}
function bridgeToCreateCollection(options) {
  const collection = index.createCollection(options);
  const builder = collectionRegistry.getBuilderFromConfig(options);
  if (builder) {
    collectionRegistry.registerCollectionBuilder(collection, builder);
  }
  return collection;
}
exports.createLiveQueryCollection = createLiveQueryCollection;
exports.liveQueryCollectionOptions = liveQueryCollectionOptions;
//# sourceMappingURL=live-query-collection.cjs.map
