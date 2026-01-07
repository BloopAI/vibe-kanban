define(['./isArray', './isObject', './_set'], function (isArray, isObject, _set) {

  // set the value in given path
  function set (obj, path, value) {
    if (!isObject(obj) || !isArray(path)) return obj;
    if (path.length === 0) return obj;

    _set(obj, path, value);

    return obj;
  }

  return set;

});
