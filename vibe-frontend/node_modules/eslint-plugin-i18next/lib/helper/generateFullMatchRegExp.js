module.exports = function generateFullMatchRegExp(source) {
  if (source instanceof RegExp) {
    return source;
  }
  if (typeof source !== 'string') {
    throw new Error('generateFullMatchRegExp: expect string but get', source);
  }
  // allow dot ahead
  return new RegExp(`(^|\\.)${source}${source.endsWith('$') ? '' : '$'}`);
};
