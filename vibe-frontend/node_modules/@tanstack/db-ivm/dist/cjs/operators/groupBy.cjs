"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const map = require("./map.cjs");
const reduce = require("./reduce.cjs");
function isPipedAggregateFunction(aggregate) {
  return `pipe` in aggregate;
}
function groupBy(keyExtractor, aggregates = {}) {
  const basicAggregates = Object.fromEntries(
    Object.entries(aggregates).filter(
      ([_, aggregate]) => !isPipedAggregateFunction(aggregate)
    )
  );
  Object.fromEntries(
    Object.entries(aggregates).filter(
      ([_, aggregate]) => isPipedAggregateFunction(aggregate)
    )
  );
  return (stream) => {
    const KEY_SENTINEL = `__original_key__`;
    const withKeysAndValues = stream.pipe(
      map.map((data) => {
        const key = keyExtractor(data);
        const keyString = JSON.stringify(key);
        const values = {};
        values[KEY_SENTINEL] = key;
        for (const [name, aggregate] of Object.entries(basicAggregates)) {
          values[name] = aggregate.preMap(data);
        }
        return [keyString, values];
      })
    );
    const reduced = withKeysAndValues.pipe(
      reduce.reduce((values) => {
        let totalMultiplicity = 0;
        for (const [_, multiplicity] of values) {
          totalMultiplicity += multiplicity;
        }
        if (totalMultiplicity <= 0) {
          return [];
        }
        const result = {};
        const originalKey = values[0]?.[0]?.[KEY_SENTINEL];
        result[KEY_SENTINEL] = originalKey;
        for (const [name, aggregate] of Object.entries(basicAggregates)) {
          const preValues = values.map(
            ([v, m]) => [v[name], m]
          );
          result[name] = aggregate.reduce(preValues);
        }
        return [[result, 1]];
      })
    );
    return reduced.pipe(
      map.map(([keyString, values]) => {
        const key = values[KEY_SENTINEL];
        const result = {};
        Object.assign(result, key);
        for (const [name, aggregate] of Object.entries(basicAggregates)) {
          if (aggregate.postMap) {
            result[name] = aggregate.postMap(values[name]);
          } else {
            result[name] = values[name];
          }
        }
        return [keyString, result];
      })
    );
  };
}
function sum(valueExtractor = (v) => v) {
  return {
    preMap: (data) => valueExtractor(data),
    reduce: (values) => {
      let total = 0;
      for (const [value, multiplicity] of values) {
        total += value * multiplicity;
      }
      return total;
    }
  };
}
function count(valueExtractor = (v) => v) {
  return {
    // Count only not-null values (the `== null` comparison gives true for both null and undefined)
    preMap: (data) => valueExtractor(data) == null ? 0 : 1,
    reduce: (values) => {
      let totalCount = 0;
      for (const [nullMultiplier, multiplicity] of values) {
        totalCount += nullMultiplier * multiplicity;
      }
      return totalCount;
    }
  };
}
function avg(valueExtractor = (v) => v) {
  return {
    preMap: (data) => ({
      sum: valueExtractor(data),
      count: 0
    }),
    reduce: (values) => {
      let totalSum = 0;
      let totalCount = 0;
      for (const [value, multiplicity] of values) {
        totalSum += value.sum * multiplicity;
        totalCount += multiplicity;
      }
      return {
        sum: totalSum,
        count: totalCount
      };
    },
    postMap: (result) => {
      return result.sum / result.count;
    }
  };
}
function min(valueExtractor) {
  const extractor = valueExtractor ?? ((v) => v);
  return {
    preMap: (data) => extractor(data),
    reduce: (values) => {
      let minValue;
      for (const [value, _multiplicity] of values) {
        if (!minValue || value && value < minValue) {
          minValue = value;
        }
      }
      return minValue;
    }
  };
}
function max(valueExtractor) {
  const extractor = valueExtractor ?? ((v) => v);
  return {
    preMap: (data) => extractor(data),
    reduce: (values) => {
      let maxValue;
      for (const [value, _multiplicity] of values) {
        if (!maxValue || value && value > maxValue) {
          maxValue = value;
        }
      }
      return maxValue;
    }
  };
}
function median(valueExtractor = (v) => v) {
  return {
    preMap: (data) => [valueExtractor(data)],
    reduce: (values) => {
      const allValues = [];
      for (const [valueArray, multiplicity] of values) {
        for (const value of valueArray) {
          for (let i = 0; i < multiplicity; i++) {
            allValues.push(value);
          }
        }
      }
      if (allValues.length === 0) {
        return [];
      }
      allValues.sort((a, b) => a - b);
      return allValues;
    },
    postMap: (result) => {
      if (result.length === 0) return 0;
      const mid = Math.floor(result.length / 2);
      if (result.length % 2 === 0) {
        return (result[mid - 1] + result[mid]) / 2;
      }
      return result[mid];
    }
  };
}
function mode(valueExtractor = (v) => v) {
  return {
    preMap: (data) => {
      const value = valueExtractor(data);
      const frequencyMap = /* @__PURE__ */ new Map();
      frequencyMap.set(value, 1);
      return frequencyMap;
    },
    reduce: (values) => {
      const combinedMap = /* @__PURE__ */ new Map();
      for (const [frequencyMap, multiplicity] of values) {
        for (const [value, frequencyCount] of frequencyMap.entries()) {
          const currentCount = combinedMap.get(value) || 0;
          combinedMap.set(value, currentCount + frequencyCount * multiplicity);
        }
      }
      return combinedMap;
    },
    postMap: (result) => {
      if (result.size === 0) return 0;
      let modeValue = 0;
      let maxFrequency = 0;
      for (const [value, frequency] of result.entries()) {
        if (frequency > maxFrequency) {
          maxFrequency = frequency;
          modeValue = value;
        }
      }
      return modeValue;
    }
  };
}
const groupByOperators = {
  sum,
  count,
  avg,
  min,
  max,
  median,
  mode
};
exports.avg = avg;
exports.count = count;
exports.groupBy = groupBy;
exports.groupByOperators = groupByOperators;
exports.max = max;
exports.median = median;
exports.min = min;
exports.mode = mode;
exports.sum = sum;
//# sourceMappingURL=groupBy.cjs.map
