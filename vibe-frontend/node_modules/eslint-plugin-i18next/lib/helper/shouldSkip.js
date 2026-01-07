const matchPatterns = require('./matchPatterns');

module.exports = function shouldSkip({ exclude = [], include = [] }, text) {
  if (!include.length && !exclude.length) return false;

  if (include.length && matchPatterns(include, text)) return false;

  if (exclude.length && !matchPatterns(exclude, text)) return false;

  return true;
};