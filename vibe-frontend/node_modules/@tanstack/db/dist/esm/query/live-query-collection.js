import { createCollection } from "../collection/index.js";
import { CollectionConfigBuilder } from "./live/collection-config-builder.js";
import { getBuilderFromConfig, registerCollectionBuilder } from "./live/collection-registry.js";
function liveQueryCollectionOptions(config) {
  const collectionConfigBuilder = new CollectionConfigBuilder(config);
  return collectionConfigBuilder.getConfig();
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
  const collection = createCollection(options);
  const builder = getBuilderFromConfig(options);
  if (builder) {
    registerCollectionBuilder(collection, builder);
  }
  return collection;
}
export {
  createLiveQueryCollection,
  liveQueryCollectionOptions
};
//# sourceMappingURL=live-query-collection.js.map
