const { generateFullMatchRegExp } = require('.');

const cache = new WeakMap();

module.exports = function matchPatterns(patterns, text) {
  let handler = cache.get(patterns);
  if (handler) {
    return handler(text);
  }
  handler = str => {
    return patterns.map(generateFullMatchRegExp).some(item => item.test(str));
  };
  cache.set(patterns, handler);
  return handler(text);
};
