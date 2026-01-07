import { PropRef, Value } from "../ir.js";
function createSingleRowRefProxy() {
  const cache = /* @__PURE__ */ new Map();
  function createProxy(path) {
    const pathKey = path.join(`.`);
    if (cache.has(pathKey)) {
      return cache.get(pathKey);
    }
    const proxy = new Proxy({}, {
      get(target, prop, receiver) {
        if (prop === `__refProxy`) return true;
        if (prop === `__path`) return path;
        if (prop === `__type`) return void 0;
        if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver);
        const newPath = [...path, String(prop)];
        return createProxy(newPath);
      },
      has(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
          return true;
        return Reflect.has(target, prop);
      },
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
          return { enumerable: false, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
    });
    cache.set(pathKey, proxy);
    return proxy;
  }
  return createProxy([]);
}
function createRefProxy(aliases) {
  const cache = /* @__PURE__ */ new Map();
  let accessId = 0;
  function createProxy(path) {
    const pathKey = path.join(`.`);
    if (cache.has(pathKey)) {
      return cache.get(pathKey);
    }
    const proxy = new Proxy({}, {
      get(target, prop, receiver) {
        if (prop === `__refProxy`) return true;
        if (prop === `__path`) return path;
        if (prop === `__type`) return void 0;
        if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver);
        const newPath = [...path, String(prop)];
        return createProxy(newPath);
      },
      has(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
          return true;
        return Reflect.has(target, prop);
      },
      ownKeys(target) {
        const id = ++accessId;
        const sentinelKey = `__SPREAD_SENTINEL__${path.join(`.`)}__${id}`;
        if (!Object.prototype.hasOwnProperty.call(target, sentinelKey)) {
          Object.defineProperty(target, sentinelKey, {
            enumerable: true,
            configurable: true,
            value: true
          });
        }
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
          return { enumerable: false, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
    });
    cache.set(pathKey, proxy);
    return proxy;
  }
  const rootProxy = new Proxy({}, {
    get(target, prop, receiver) {
      if (prop === `__refProxy`) return true;
      if (prop === `__path`) return [];
      if (prop === `__type`) return void 0;
      if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver);
      const propStr = String(prop);
      if (aliases.includes(propStr)) {
        return createProxy([propStr]);
      }
      return void 0;
    },
    has(target, prop) {
      if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
        return true;
      if (typeof prop === `string` && aliases.includes(prop)) return true;
      return Reflect.has(target, prop);
    },
    ownKeys(_target) {
      return [...aliases, `__refProxy`, `__path`, `__type`];
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
        return { enumerable: false, configurable: true };
      }
      if (typeof prop === `string` && aliases.includes(prop)) {
        return { enumerable: true, configurable: true };
      }
      return void 0;
    }
  });
  return rootProxy;
}
function toExpression(value) {
  if (isRefProxy(value)) {
    return new PropRef(value.__path);
  }
  if (value && typeof value === `object` && `type` in value && (value.type === `func` || value.type === `ref` || value.type === `val` || value.type === `agg`)) {
    return value;
  }
  return new Value(value);
}
function isRefProxy(value) {
  return value && typeof value === `object` && value.__refProxy === true;
}
export {
  createRefProxy,
  createSingleRowRefProxy,
  isRefProxy,
  toExpression
};
//# sourceMappingURL=ref-proxy.js.map
