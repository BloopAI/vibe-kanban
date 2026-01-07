function serialize(value) {
  if (value === null || value === void 0) {
    return ``;
  }
  if (typeof value === `string`) {
    return value;
  }
  if (typeof value === `number`) {
    return value.toString();
  }
  if (typeof value === `bigint`) {
    return value.toString();
  }
  if (typeof value === `boolean`) {
    return value ? `true` : `false`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    const elements = value.map((item) => {
      if (item === null || item === void 0) {
        return `NULL`;
      }
      if (typeof item === `string`) {
        const escaped = item.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`);
        return `"${escaped}"`;
      }
      return serialize(item);
    });
    return `{${elements.join(`,`)}}`;
  }
  let valueStr;
  try {
    valueStr = JSON.stringify(value);
  } catch {
    valueStr = String(value);
  }
  throw new Error(`Cannot serialize value: ${valueStr}`);
}
export {
  serialize
};
//# sourceMappingURL=pg-serializer.js.map
