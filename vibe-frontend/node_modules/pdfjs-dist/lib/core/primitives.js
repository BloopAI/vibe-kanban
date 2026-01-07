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
exports.RefSetCache = exports.RefSet = exports.Ref = exports.Name = exports.EOF = exports.Dict = exports.Cmd = exports.CIRCULAR_REF = void 0;
exports.clearPrimitiveCaches = clearPrimitiveCaches;
exports.isCmd = isCmd;
exports.isDict = isDict;
exports.isName = isName;
exports.isRefsEqual = isRefsEqual;
var _util = require("../shared/util.js");
const CIRCULAR_REF = Symbol("CIRCULAR_REF");
exports.CIRCULAR_REF = CIRCULAR_REF;
const EOF = Symbol("EOF");
exports.EOF = EOF;
const Name = function NameClosure() {
  let nameCache = Object.create(null);
  class Name {
    constructor(name) {
      this.name = name;
    }
    static get(name) {
      return nameCache[name] || (nameCache[name] = new Name(name));
    }
    static _clearCache() {
      nameCache = Object.create(null);
    }
  }
  return Name;
}();
exports.Name = Name;
const Cmd = function CmdClosure() {
  let cmdCache = Object.create(null);
  class Cmd {
    constructor(cmd) {
      this.cmd = cmd;
    }
    static get(cmd) {
      return cmdCache[cmd] || (cmdCache[cmd] = new Cmd(cmd));
    }
    static _clearCache() {
      cmdCache = Object.create(null);
    }
  }
  return Cmd;
}();
exports.Cmd = Cmd;
const nonSerializable = function nonSerializableClosure() {
  return nonSerializable;
};
class Dict {
  constructor(xref = null) {
    this._map = Object.create(null);
    this.xref = xref;
    this.objId = null;
    this.suppressEncryption = false;
    this.__nonSerializable__ = nonSerializable;
  }
  assignXref(newXref) {
    this.xref = newXref;
  }
  get size() {
    return Object.keys(this._map).length;
  }
  get(key1, key2, key3) {
    let value = this._map[key1];
    if (value === undefined && key2 !== undefined) {
      value = this._map[key2];
      if (value === undefined && key3 !== undefined) {
        value = this._map[key3];
      }
    }
    if (value instanceof Ref && this.xref) {
      return this.xref.fetch(value, this.suppressEncryption);
    }
    return value;
  }
  async getAsync(key1, key2, key3) {
    let value = this._map[key1];
    if (value === undefined && key2 !== undefined) {
      value = this._map[key2];
      if (value === undefined && key3 !== undefined) {
        value = this._map[key3];
      }
    }
    if (value instanceof Ref && this.xref) {
      return this.xref.fetchAsync(value, this.suppressEncryption);
    }
    return value;
  }
  getArray(key1, key2, key3) {
    let value = this._map[key1];
    if (value === undefined && key2 !== undefined) {
      value = this._map[key2];
      if (value === undefined && key3 !== undefined) {
        value = this._map[key3];
      }
    }
    if (value instanceof Ref && this.xref) {
      value = this.xref.fetch(value, this.suppressEncryption);
    }
    if (Array.isArray(value)) {
      value = value.slice();
      for (let i = 0, ii = value.length; i < ii; i++) {
        if (value[i] instanceof Ref && this.xref) {
          value[i] = this.xref.fetch(value[i], this.suppressEncryption);
        }
      }
    }
    return value;
  }
  getRaw(key) {
    return this._map[key];
  }
  getKeys() {
    return Object.keys(this._map);
  }
  getRawValues() {
    return Object.values(this._map);
  }
  set(key, value) {
    this._map[key] = value;
  }
  has(key) {
    return this._map[key] !== undefined;
  }
  forEach(callback) {
    for (const key in this._map) {
      callback(key, this.get(key));
    }
  }
  static get empty() {
    const emptyDict = new Dict(null);
    emptyDict.set = (key, value) => {
      (0, _util.unreachable)("Should not call `set` on the empty dictionary.");
    };
    return (0, _util.shadow)(this, "empty", emptyDict);
  }
  static merge({
    xref,
    dictArray,
    mergeSubDicts = false
  }) {
    const mergedDict = new Dict(xref),
      properties = new Map();
    for (const dict of dictArray) {
      if (!(dict instanceof Dict)) {
        continue;
      }
      for (const [key, value] of Object.entries(dict._map)) {
        let property = properties.get(key);
        if (property === undefined) {
          property = [];
          properties.set(key, property);
        } else if (!mergeSubDicts || !(value instanceof Dict)) {
          continue;
        }
        property.push(value);
      }
    }
    for (const [name, values] of properties) {
      if (values.length === 1 || !(values[0] instanceof Dict)) {
        mergedDict._map[name] = values[0];
        continue;
      }
      const subDict = new Dict(xref);
      for (const dict of values) {
        for (const [key, value] of Object.entries(dict._map)) {
          if (subDict._map[key] === undefined) {
            subDict._map[key] = value;
          }
        }
      }
      if (subDict.size > 0) {
        mergedDict._map[name] = subDict;
      }
    }
    properties.clear();
    return mergedDict.size > 0 ? mergedDict : Dict.empty;
  }
}
exports.Dict = Dict;
const Ref = function RefClosure() {
  let refCache = Object.create(null);
  class Ref {
    constructor(num, gen) {
      this.num = num;
      this.gen = gen;
    }
    toString() {
      if (this.gen === 0) {
        return `${this.num}R`;
      }
      return `${this.num}R${this.gen}`;
    }
    static get(num, gen) {
      const key = gen === 0 ? `${num}R` : `${num}R${gen}`;
      return refCache[key] || (refCache[key] = new Ref(num, gen));
    }
    static _clearCache() {
      refCache = Object.create(null);
    }
  }
  return Ref;
}();
exports.Ref = Ref;
class RefSet {
  constructor(parent = null) {
    this._set = new Set(parent && parent._set);
  }
  has(ref) {
    return this._set.has(ref.toString());
  }
  put(ref) {
    this._set.add(ref.toString());
  }
  remove(ref) {
    this._set.delete(ref.toString());
  }
  [Symbol.iterator]() {
    return this._set.values();
  }
  clear() {
    this._set.clear();
  }
}
exports.RefSet = RefSet;
class RefSetCache {
  constructor() {
    this._map = new Map();
  }
  get size() {
    return this._map.size;
  }
  get(ref) {
    return this._map.get(ref.toString());
  }
  has(ref) {
    return this._map.has(ref.toString());
  }
  put(ref, obj) {
    this._map.set(ref.toString(), obj);
  }
  putAlias(ref, aliasRef) {
    this._map.set(ref.toString(), this.get(aliasRef));
  }
  [Symbol.iterator]() {
    return this._map.values();
  }
  clear() {
    this._map.clear();
  }
}
exports.RefSetCache = RefSetCache;
function isName(v, name) {
  return v instanceof Name && (name === undefined || v.name === name);
}
function isCmd(v, cmd) {
  return v instanceof Cmd && (cmd === undefined || v.cmd === cmd);
}
function isDict(v, type) {
  return v instanceof Dict && (type === undefined || isName(v.get("Type"), type));
}
function isRefsEqual(v1, v2) {
  return v1.num === v2.num && v1.gen === v2.gen;
}
function clearPrimitiveCaches() {
  Cmd._clearCache();
  Name._clearCache();
  Ref._clearCache();
}