function isValidKey(key) {
  const dangerousProps = ["__proto__", "constructor", "prototype"];
  return !dangerousProps.includes(String(key));
}
function mutateMergeDeep(target, source) {
  if (target === null || target === void 0 || typeof target !== "object")
    return {};
  if (source === null || source === void 0 || typeof source !== "object")
    return target;
  const targetKeys = Object.keys(target);
  const sourceKeys = Object.keys(source);
  const keySet = /* @__PURE__ */ new Set([...targetKeys, ...sourceKeys]);
  for (const key of keySet) {
    if (!isValidKey(key)) continue;
    const targetKey = key;
    const sourceKey = key;
    if (!Object.hasOwn(source, sourceKey)) continue;
    const sourceValue = source[sourceKey];
    const targetValue = target[targetKey];
    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      Object.defineProperty(target, key, {
        value: [...sourceValue],
        enumerable: true,
        writable: true,
        configurable: true
      });
      continue;
    }
    const isTargetObj = typeof targetValue === "object" && targetValue !== null;
    const isSourceObj = typeof sourceValue === "object" && sourceValue !== null;
    const areObjects = isTargetObj && isSourceObj && !Array.isArray(targetValue) && !Array.isArray(sourceValue);
    if (areObjects) {
      mutateMergeDeep(targetValue, sourceValue);
      continue;
    }
    Object.defineProperty(target, key, {
      value: sourceValue,
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return target;
}
function mergeForm(baseForm, state) {
  mutateMergeDeep(baseForm.state, state);
  return baseForm;
}
export {
  mergeForm,
  mutateMergeDeep
};
//# sourceMappingURL=mergeForm.js.map
