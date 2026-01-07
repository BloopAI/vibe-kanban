"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const derived = require("./derived.cjs");
class Effect {
  constructor(opts) {
    const { eager, fn, ...derivedProps } = opts;
    this._derived = new derived.Derived({
      ...derivedProps,
      fn: () => {
      },
      onUpdate() {
        fn();
      }
    });
    if (eager) {
      fn();
    }
  }
  mount() {
    return this._derived.mount();
  }
}
exports.Effect = Effect;
//# sourceMappingURL=effect.cjs.map
