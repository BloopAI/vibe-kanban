var isArray = require('./isArray.js');
var isObject = require('./isObject.js');
var _set = require('./_set.js');

// set the value in given path
function set (obj, path, value) {
  if (!isObject(obj) || !isArray(path)) return obj;
  if (path.length === 0) return obj;

  _set(obj, path, value);

  return obj;
}

module.exports = set;
