/**
 * @licstart The following is the entire license notice for the
 * JavaScript code in this page
 *
 * Copyright 2023 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @licend The above is the entire license notice for the
 * JavaScript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NumberTree = exports.NameTree = void 0;
var _primitives = require("./primitives.js");
var _util = require("../shared/util.js");
class NameOrNumberTree {
  constructor(root, xref, type) {
    if (this.constructor === NameOrNumberTree) {
      (0, _util.unreachable)("Cannot initialize NameOrNumberTree.");
    }
    this.root = root;
    this.xref = xref;
    this._type = type;
  }
  getAll() {
    const map = new Map();
    if (!this.root) {
      return map;
    }
    const xref = this.xref;
    const processed = new _primitives.RefSet();
    processed.put(this.root);
    const queue = [this.root];
    while (queue.length > 0) {
      const obj = xref.fetchIfRef(queue.shift());
      if (!(obj instanceof _primitives.Dict)) {
        continue;
      }
      if (obj.has("Kids")) {
        const kids = obj.get("Kids");
        if (!Array.isArray(kids)) {
          continue;
        }
        for (const kid of kids) {
          if (processed.has(kid)) {
            throw new _util.FormatError(`Duplicate entry in "${this._type}" tree.`);
          }
          queue.push(kid);
          processed.put(kid);
        }
        continue;
      }
      const entries = obj.get(this._type);
      if (!Array.isArray(entries)) {
        continue;
      }
      for (let i = 0, ii = entries.length; i < ii; i += 2) {
        map.set(xref.fetchIfRef(entries[i]), xref.fetchIfRef(entries[i + 1]));
      }
    }
    return map;
  }
  get(key) {
    if (!this.root) {
      return null;
    }
    const xref = this.xref;
    let kidsOrEntries = xref.fetchIfRef(this.root);
    let loopCount = 0;
    const MAX_LEVELS = 10;
    while (kidsOrEntries.has("Kids")) {
      if (++loopCount > MAX_LEVELS) {
        (0, _util.warn)(`Search depth limit reached for "${this._type}" tree.`);
        return null;
      }
      const kids = kidsOrEntries.get("Kids");
      if (!Array.isArray(kids)) {
        return null;
      }
      let l = 0,
        r = kids.length - 1;
      while (l <= r) {
        const m = l + r >> 1;
        const kid = xref.fetchIfRef(kids[m]);
        const limits = kid.get("Limits");
        if (key < xref.fetchIfRef(limits[0])) {
          r = m - 1;
        } else if (key > xref.fetchIfRef(limits[1])) {
          l = m + 1;
        } else {
          kidsOrEntries = kid;
          break;
        }
      }
      if (l > r) {
        return null;
      }
    }
    const entries = kidsOrEntries.get(this._type);
    if (Array.isArray(entries)) {
      let l = 0,
        r = entries.length - 2;
      while (l <= r) {
        const tmp = l + r >> 1,
          m = tmp + (tmp & 1);
        const currentKey = xref.fetchIfRef(entries[m]);
        if (key < currentKey) {
          r = m - 2;
        } else if (key > currentKey) {
          l = m + 2;
        } else {
          return xref.fetchIfRef(entries[m + 1]);
        }
      }
    }
    return null;
  }
}
class NameTree extends NameOrNumberTree {
  constructor(root, xref) {
    super(root, xref, "Names");
  }
}
exports.NameTree = NameTree;
class NumberTree extends NameOrNumberTree {
  constructor(root, xref) {
    super(root, xref, "Nums");
  }
}
exports.NumberTree = NumberTree;