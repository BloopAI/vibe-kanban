define(['./isNumber', './isArray', './isObject'], function (isNumber, isArray, isObject) {

  function set (obj, path, value) {
    var key = String(path[0]);

    if (path.length === 1) {
      obj[key] = value;
      return;
    }

    if (!isArray(obj[key]) || !isObject(obj[key])) {
      var nextKey = path[1];
      obj[key] = isNumber(nextKey) ? [] : {};
    }

    return set(obj[key], path.slice(1), value);
  }

  return set;

});
