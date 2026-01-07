import { map } from "./map.js";
function keyBy(keyFn) {
  return map((value) => [keyFn(value), value]);
}
function unkey() {
  return map(([_, value]) => value);
}
function rekey(keyFn) {
  return map(([_, value]) => [keyFn(value), value]);
}
export {
  keyBy,
  rekey,
  unkey
};
//# sourceMappingURL=keying.js.map
