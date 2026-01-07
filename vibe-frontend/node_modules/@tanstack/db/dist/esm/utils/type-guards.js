function isPromiseLike(value) {
  return !!value && (typeof value === `object` || typeof value === `function`) && typeof value.then === `function`;
}
export {
  isPromiseLike
};
//# sourceMappingURL=type-guards.js.map
