"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const utils = require("./utils.cjs");
const CALLBACK_ITERATION_METHODS = /* @__PURE__ */ new Set([
  `find`,
  `findLast`,
  `findIndex`,
  `findLastIndex`,
  `filter`,
  `map`,
  `flatMap`,
  `forEach`,
  `some`,
  `every`,
  `reduce`,
  `reduceRight`
]);
const ARRAY_MODIFYING_METHODS = /* @__PURE__ */ new Set([
  `pop`,
  `push`,
  `shift`,
  `unshift`,
  `splice`,
  `sort`,
  `reverse`,
  `fill`,
  `copyWithin`
]);
const MAP_SET_MODIFYING_METHODS = /* @__PURE__ */ new Set([`set`, `delete`, `clear`, `add`]);
const MAP_SET_ITERATOR_METHODS = /* @__PURE__ */ new Set([
  `entries`,
  `keys`,
  `values`,
  `forEach`
]);
function isProxiableObject(value) {
  return value !== null && typeof value === `object` && !(value instanceof Date) && !(value instanceof RegExp) && !utils.isTemporal(value);
}
function createArrayIterationHandler(methodName, methodFn, changeTracker, memoizedCreateChangeProxy) {
  if (!CALLBACK_ITERATION_METHODS.has(methodName)) {
    return void 0;
  }
  return function(...args) {
    const callback = args[0];
    if (typeof callback !== `function`) {
      return methodFn.apply(changeTracker.copy_, args);
    }
    const getProxiedElement = (element, index) => {
      if (isProxiableObject(element)) {
        const nestedParent = {
          tracker: changeTracker,
          prop: String(index)
        };
        const { proxy: elementProxy } = memoizedCreateChangeProxy(
          element,
          nestedParent
        );
        return elementProxy;
      }
      return element;
    };
    const wrappedCallback = function(element, index, array) {
      const proxiedElement = getProxiedElement(element, index);
      return callback.call(this, proxiedElement, index, array);
    };
    if (methodName === `reduce` || methodName === `reduceRight`) {
      const reduceCallback = function(accumulator, element, index, array) {
        const proxiedElement = getProxiedElement(element, index);
        return callback.call(this, accumulator, proxiedElement, index, array);
      };
      return methodFn.apply(changeTracker.copy_, [
        reduceCallback,
        ...args.slice(1)
      ]);
    }
    const result = methodFn.apply(changeTracker.copy_, [
      wrappedCallback,
      ...args.slice(1)
    ]);
    if ((methodName === `find` || methodName === `findLast`) && result && typeof result === `object`) {
      const foundIndex = changeTracker.copy_.indexOf(result);
      if (foundIndex !== -1) {
        return getProxiedElement(result, foundIndex);
      }
    }
    if (methodName === `filter` && Array.isArray(result)) {
      return result.map((element) => {
        const originalIndex = changeTracker.copy_.indexOf(element);
        if (originalIndex !== -1) {
          return getProxiedElement(element, originalIndex);
        }
        return element;
      });
    }
    return result;
  };
}
function createArrayIteratorHandler(changeTracker, memoizedCreateChangeProxy) {
  return function() {
    const array = changeTracker.copy_;
    let index = 0;
    return {
      next() {
        if (index >= array.length) {
          return { done: true, value: void 0 };
        }
        const element = array[index];
        let proxiedElement = element;
        if (isProxiableObject(element)) {
          const nestedParent = {
            tracker: changeTracker,
            prop: String(index)
          };
          const { proxy: elementProxy } = memoizedCreateChangeProxy(
            element,
            nestedParent
          );
          proxiedElement = elementProxy;
        }
        index++;
        return { done: false, value: proxiedElement };
      },
      [Symbol.iterator]() {
        return this;
      }
    };
  };
}
function createModifyingMethodHandler(methodFn, changeTracker, markChanged) {
  return function(...args) {
    const result = methodFn.apply(changeTracker.copy_, args);
    markChanged(changeTracker);
    return result;
  };
}
function createMapSetIteratorHandler(methodName, prop, methodFn, target, changeTracker, memoizedCreateChangeProxy, markChanged) {
  const isIteratorMethod = MAP_SET_ITERATOR_METHODS.has(methodName) || prop === Symbol.iterator;
  if (!isIteratorMethod) {
    return void 0;
  }
  return function(...args) {
    const result = methodFn.apply(changeTracker.copy_, args);
    if (methodName === `forEach`) {
      const callback = args[0];
      if (typeof callback === `function`) {
        const wrappedCallback = function(value, key, collection) {
          const cbresult = callback.call(this, value, key, collection);
          markChanged(changeTracker);
          return cbresult;
        };
        return methodFn.apply(target, [wrappedCallback, ...args.slice(1)]);
      }
    }
    const isValueIterator = methodName === `entries` || methodName === `values` || methodName === Symbol.iterator.toString() || prop === Symbol.iterator;
    if (isValueIterator) {
      const originalIterator = result;
      const valueToKeyMap = /* @__PURE__ */ new Map();
      if (methodName === `values` && target instanceof Map) {
        for (const [key, mapValue] of changeTracker.copy_.entries()) {
          valueToKeyMap.set(mapValue, key);
        }
      }
      const originalToModifiedMap = /* @__PURE__ */ new Map();
      if (target instanceof Set) {
        for (const setValue of changeTracker.copy_.values()) {
          originalToModifiedMap.set(setValue, setValue);
        }
      }
      return {
        next() {
          const nextResult = originalIterator.next();
          if (!nextResult.done && nextResult.value && typeof nextResult.value === `object`) {
            if (methodName === `entries` && Array.isArray(nextResult.value) && nextResult.value.length === 2) {
              if (nextResult.value[1] && typeof nextResult.value[1] === `object`) {
                const mapKey = nextResult.value[0];
                const mapParent = {
                  tracker: changeTracker,
                  prop: mapKey,
                  updateMap: (newValue) => {
                    if (changeTracker.copy_ instanceof Map) {
                      changeTracker.copy_.set(
                        mapKey,
                        newValue
                      );
                    }
                  }
                };
                const { proxy: valueProxy } = memoizedCreateChangeProxy(
                  nextResult.value[1],
                  mapParent
                );
                nextResult.value[1] = valueProxy;
              }
            } else if (methodName === `values` || methodName === Symbol.iterator.toString() || prop === Symbol.iterator) {
              if (methodName === `values` && target instanceof Map) {
                const mapKey = valueToKeyMap.get(nextResult.value);
                if (mapKey !== void 0) {
                  const mapParent = {
                    tracker: changeTracker,
                    prop: mapKey,
                    updateMap: (newValue) => {
                      if (changeTracker.copy_ instanceof Map) {
                        changeTracker.copy_.set(
                          mapKey,
                          newValue
                        );
                      }
                    }
                  };
                  const { proxy: valueProxy } = memoizedCreateChangeProxy(
                    nextResult.value,
                    mapParent
                  );
                  nextResult.value = valueProxy;
                }
              } else if (target instanceof Set) {
                const setOriginalValue = nextResult.value;
                const setParent = {
                  tracker: changeTracker,
                  prop: setOriginalValue,
                  updateSet: (newValue) => {
                    if (changeTracker.copy_ instanceof Set) {
                      changeTracker.copy_.delete(
                        setOriginalValue
                      );
                      changeTracker.copy_.add(newValue);
                      originalToModifiedMap.set(setOriginalValue, newValue);
                    }
                  }
                };
                const { proxy: valueProxy } = memoizedCreateChangeProxy(
                  nextResult.value,
                  setParent
                );
                nextResult.value = valueProxy;
              } else {
                const tempKey = Symbol(`iterator-value`);
                const { proxy: valueProxy } = memoizedCreateChangeProxy(
                  nextResult.value,
                  {
                    tracker: changeTracker,
                    prop: tempKey
                  }
                );
                nextResult.value = valueProxy;
              }
            }
          }
          return nextResult;
        },
        [Symbol.iterator]() {
          return this;
        }
      };
    }
    return result;
  };
}
function debugLog(...args) {
  const isBrowser = typeof window !== `undefined` && typeof localStorage !== `undefined`;
  if (isBrowser && localStorage.getItem(`DEBUG`) === `true`) {
    console.log(`[proxy]`, ...args);
  } else if (
    // true
    !isBrowser && typeof process !== `undefined` && process.env.DEBUG === `true`
  ) {
    console.log(`[proxy]`, ...args);
  }
}
function deepClone(obj, visited = /* @__PURE__ */ new WeakMap()) {
  if (obj === null || obj === void 0) {
    return obj;
  }
  if (typeof obj !== `object`) {
    return obj;
  }
  if (visited.has(obj)) {
    return visited.get(obj);
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags);
  }
  if (Array.isArray(obj)) {
    const arrayClone = [];
    visited.set(obj, arrayClone);
    obj.forEach((item, index) => {
      arrayClone[index] = deepClone(item, visited);
    });
    return arrayClone;
  }
  if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
    const TypedArrayConstructor = Object.getPrototypeOf(obj).constructor;
    const clone2 = new TypedArrayConstructor(
      obj.length
    );
    visited.set(obj, clone2);
    for (let i = 0; i < obj.length; i++) {
      clone2[i] = obj[i];
    }
    return clone2;
  }
  if (obj instanceof Map) {
    const clone2 = /* @__PURE__ */ new Map();
    visited.set(obj, clone2);
    obj.forEach((value, key) => {
      clone2.set(key, deepClone(value, visited));
    });
    return clone2;
  }
  if (obj instanceof Set) {
    const clone2 = /* @__PURE__ */ new Set();
    visited.set(obj, clone2);
    obj.forEach((value) => {
      clone2.add(deepClone(value, visited));
    });
    return clone2;
  }
  if (utils.isTemporal(obj)) {
    return obj;
  }
  const clone = {};
  visited.set(obj, clone);
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone(
        obj[key],
        visited
      );
    }
  }
  const symbolProps = Object.getOwnPropertySymbols(obj);
  for (const sym of symbolProps) {
    clone[sym] = deepClone(
      obj[sym],
      visited
    );
  }
  return clone;
}
let count = 0;
function getProxyCount() {
  count += 1;
  return count;
}
function createChangeProxy(target, parent) {
  const changeProxyCache = /* @__PURE__ */ new Map();
  function memoizedCreateChangeProxy(innerTarget, innerParent) {
    debugLog(`Object ID:`, innerTarget.constructor.name);
    if (changeProxyCache.has(innerTarget)) {
      return changeProxyCache.get(innerTarget);
    } else {
      const changeProxy = createChangeProxy(innerTarget, innerParent);
      changeProxyCache.set(innerTarget, changeProxy);
      return changeProxy;
    }
  }
  const proxyCache = /* @__PURE__ */ new Map();
  const changeTracker = {
    copy_: deepClone(target),
    originalObject: deepClone(target),
    proxyCount: getProxyCount(),
    modified: false,
    assigned_: {},
    parent,
    target
    // Store reference to the target object
  };
  debugLog(
    `createChangeProxy called for target`,
    target,
    changeTracker.proxyCount
  );
  function markChanged(state) {
    if (!state.modified) {
      state.modified = true;
    }
    if (state.parent) {
      debugLog(`propagating change to parent`);
      if (`updateMap` in state.parent) {
        state.parent.updateMap(state.copy_);
      } else if (`updateSet` in state.parent) {
        state.parent.updateSet(state.copy_);
      } else {
        state.parent.tracker.copy_[state.parent.prop] = state.copy_;
        state.parent.tracker.assigned_[state.parent.prop] = true;
      }
      markChanged(state.parent.tracker);
    }
  }
  function checkIfReverted(state) {
    debugLog(
      `checkIfReverted called with assigned keys:`,
      Object.keys(state.assigned_)
    );
    if (Object.keys(state.assigned_).length === 0 && Object.getOwnPropertySymbols(state.assigned_).length === 0) {
      debugLog(`No assigned properties, returning true`);
      return true;
    }
    for (const prop in state.assigned_) {
      if (state.assigned_[prop] === true) {
        const currentValue = state.copy_[prop];
        const originalValue = state.originalObject[prop];
        debugLog(
          `Checking property ${String(prop)}, current:`,
          currentValue,
          `original:`,
          originalValue
        );
        if (!utils.deepEquals(currentValue, originalValue)) {
          debugLog(`Property ${String(prop)} is different, returning false`);
          return false;
        }
      } else if (state.assigned_[prop] === false) {
        debugLog(`Property ${String(prop)} was deleted, returning false`);
        return false;
      }
    }
    const symbolProps = Object.getOwnPropertySymbols(state.assigned_);
    for (const sym of symbolProps) {
      if (state.assigned_[sym] === true) {
        const currentValue = state.copy_[sym];
        const originalValue = state.originalObject[sym];
        if (!utils.deepEquals(currentValue, originalValue)) {
          debugLog(`Symbol property is different, returning false`);
          return false;
        }
      } else if (state.assigned_[sym] === false) {
        debugLog(`Symbol property was deleted, returning false`);
        return false;
      }
    }
    debugLog(`All properties match original values, returning true`);
    return true;
  }
  function checkParentStatus(parentState, childProp) {
    debugLog(`checkParentStatus called for child prop:`, childProp);
    const isReverted = checkIfReverted(parentState);
    debugLog(`Parent checkIfReverted returned:`, isReverted);
    if (isReverted) {
      debugLog(`Parent is fully reverted, clearing tracking`);
      parentState.modified = false;
      parentState.assigned_ = {};
      if (parentState.parent) {
        debugLog(`Continuing up the parent chain`);
        checkParentStatus(parentState.parent.tracker, parentState.parent.prop);
      }
    }
  }
  function createObjectProxy(obj) {
    debugLog(`createObjectProxy`, obj);
    if (proxyCache.has(obj)) {
      debugLog(`proxyCache found match`);
      return proxyCache.get(obj);
    }
    const proxy2 = new Proxy(obj, {
      get(ptarget, prop) {
        debugLog(`get`, ptarget, prop);
        const value = changeTracker.copy_[prop] ?? changeTracker.originalObject[prop];
        const originalValue = changeTracker.originalObject[prop];
        debugLog(`value (at top of proxy get)`, value);
        const desc = Object.getOwnPropertyDescriptor(ptarget, prop);
        if (desc?.get) {
          return value;
        }
        if (typeof value === `function`) {
          if (Array.isArray(ptarget)) {
            const methodName = prop.toString();
            if (ARRAY_MODIFYING_METHODS.has(methodName)) {
              return createModifyingMethodHandler(
                value,
                changeTracker,
                markChanged
              );
            }
            const iterationHandler = createArrayIterationHandler(
              methodName,
              value,
              changeTracker,
              memoizedCreateChangeProxy
            );
            if (iterationHandler) {
              return iterationHandler;
            }
            if (prop === Symbol.iterator) {
              return createArrayIteratorHandler(
                changeTracker,
                memoizedCreateChangeProxy
              );
            }
          }
          if (ptarget instanceof Map || ptarget instanceof Set) {
            const methodName = prop.toString();
            if (MAP_SET_MODIFYING_METHODS.has(methodName)) {
              return createModifyingMethodHandler(
                value,
                changeTracker,
                markChanged
              );
            }
            const iteratorHandler = createMapSetIteratorHandler(
              methodName,
              prop,
              value,
              ptarget,
              changeTracker,
              memoizedCreateChangeProxy,
              markChanged
            );
            if (iteratorHandler) {
              return iteratorHandler;
            }
          }
          return value.bind(ptarget);
        }
        if (isProxiableObject(value)) {
          const nestedParent = {
            tracker: changeTracker,
            prop: String(prop)
          };
          const { proxy: nestedProxy } = memoizedCreateChangeProxy(
            originalValue,
            nestedParent
          );
          proxyCache.set(value, nestedProxy);
          return nestedProxy;
        }
        return value;
      },
      set(_sobj, prop, value) {
        const currentValue = changeTracker.copy_[prop];
        debugLog(
          `set called for property ${String(prop)}, current:`,
          currentValue,
          `new:`,
          value
        );
        if (!utils.deepEquals(currentValue, value)) {
          const originalValue = changeTracker.originalObject[prop];
          const isRevertToOriginal = utils.deepEquals(value, originalValue);
          debugLog(
            `value:`,
            value,
            `original:`,
            originalValue,
            `isRevertToOriginal:`,
            isRevertToOriginal
          );
          if (isRevertToOriginal) {
            debugLog(`Reverting property ${String(prop)} to original value`);
            delete changeTracker.assigned_[prop.toString()];
            debugLog(`Updating copy with original value for ${String(prop)}`);
            changeTracker.copy_[prop] = deepClone(originalValue);
            debugLog(`Checking if all properties reverted`);
            const allReverted = checkIfReverted(changeTracker);
            debugLog(`All reverted:`, allReverted);
            if (allReverted) {
              debugLog(`All properties reverted, clearing tracking`);
              changeTracker.modified = false;
              changeTracker.assigned_ = {};
              if (parent) {
                debugLog(`Updating parent for property:`, parent.prop);
                checkParentStatus(parent.tracker, parent.prop);
              }
            } else {
              debugLog(`Some properties still changed, keeping modified flag`);
              changeTracker.modified = true;
            }
          } else {
            debugLog(`Setting new value for property ${String(prop)}`);
            changeTracker.copy_[prop] = value;
            changeTracker.assigned_[prop.toString()] = true;
            debugLog(`Marking object and ancestors as modified`, changeTracker);
            markChanged(changeTracker);
          }
        } else {
          debugLog(`Value unchanged, not tracking`);
        }
        return true;
      },
      defineProperty(ptarget, prop, descriptor) {
        const result = Reflect.defineProperty(ptarget, prop, descriptor);
        if (result && `value` in descriptor) {
          changeTracker.copy_[prop] = deepClone(descriptor.value);
          changeTracker.assigned_[prop.toString()] = true;
          markChanged(changeTracker);
        }
        return result;
      },
      getOwnPropertyDescriptor(ptarget, prop) {
        return Reflect.getOwnPropertyDescriptor(ptarget, prop);
      },
      preventExtensions(ptarget) {
        return Reflect.preventExtensions(ptarget);
      },
      isExtensible(ptarget) {
        return Reflect.isExtensible(ptarget);
      },
      deleteProperty(dobj, prop) {
        debugLog(`deleteProperty`, dobj, prop);
        const stringProp = typeof prop === `symbol` ? prop.toString() : prop;
        if (stringProp in dobj) {
          const hadPropertyInOriginal = stringProp in changeTracker.originalObject;
          const result = Reflect.deleteProperty(dobj, prop);
          if (result) {
            if (!hadPropertyInOriginal) {
              delete changeTracker.assigned_[stringProp];
              if (Object.keys(changeTracker.assigned_).length === 0 && Object.getOwnPropertySymbols(changeTracker.assigned_).length === 0) {
                changeTracker.modified = false;
              } else {
                changeTracker.modified = true;
              }
            } else {
              changeTracker.assigned_[stringProp] = false;
              markChanged(changeTracker);
            }
          }
          return result;
        }
        return true;
      }
    });
    proxyCache.set(obj, proxy2);
    return proxy2;
  }
  const proxy = createObjectProxy(changeTracker.copy_);
  return {
    proxy,
    getChanges: () => {
      debugLog(`getChanges called, modified:`, changeTracker.modified);
      debugLog(changeTracker);
      if (!changeTracker.modified) {
        debugLog(`Object not modified, returning empty object`);
        return {};
      }
      if (typeof changeTracker.copy_ !== `object` || Array.isArray(changeTracker.copy_)) {
        return changeTracker.copy_;
      }
      if (Object.keys(changeTracker.assigned_).length === 0) {
        return changeTracker.copy_;
      }
      const result = {};
      for (const key in changeTracker.copy_) {
        if (changeTracker.assigned_[key] === true && key in changeTracker.copy_) {
          result[key] = changeTracker.copy_[key];
        }
      }
      debugLog(`Returning copy:`, result);
      return result;
    }
  };
}
function createArrayChangeProxy(targets) {
  const proxiesWithChanges = targets.map((target) => createChangeProxy(target));
  return {
    proxies: proxiesWithChanges.map((p) => p.proxy),
    getChanges: () => proxiesWithChanges.map((p) => p.getChanges())
  };
}
function withChangeTracking(target, callback) {
  const { proxy, getChanges } = createChangeProxy(target);
  callback(proxy);
  return getChanges();
}
function withArrayChangeTracking(targets, callback) {
  const { proxies, getChanges } = createArrayChangeProxy(targets);
  callback(proxies);
  return getChanges();
}
exports.createArrayChangeProxy = createArrayChangeProxy;
exports.createChangeProxy = createChangeProxy;
exports.withArrayChangeTracking = withArrayChangeTracking;
exports.withChangeTracking = withChangeTracking;
//# sourceMappingURL=proxy.cjs.map
