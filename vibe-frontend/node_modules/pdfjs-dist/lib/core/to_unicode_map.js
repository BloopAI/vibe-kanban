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
exports.ToUnicodeMap = exports.IdentityToUnicodeMap = void 0;
var _util = require("../shared/util.js");
class ToUnicodeMap {
  constructor(cmap = []) {
    this._map = cmap;
  }
  get length() {
    return this._map.length;
  }
  forEach(callback) {
    for (const charCode in this._map) {
      callback(charCode, this._map[charCode].charCodeAt(0));
    }
  }
  has(i) {
    return this._map[i] !== undefined;
  }
  get(i) {
    return this._map[i];
  }
  charCodeOf(value) {
    const map = this._map;
    if (map.length <= 0x10000) {
      return map.indexOf(value);
    }
    for (const charCode in map) {
      if (map[charCode] === value) {
        return charCode | 0;
      }
    }
    return -1;
  }
  amend(map) {
    for (const charCode in map) {
      this._map[charCode] = map[charCode];
    }
  }
}
exports.ToUnicodeMap = ToUnicodeMap;
class IdentityToUnicodeMap {
  constructor(firstChar, lastChar) {
    this.firstChar = firstChar;
    this.lastChar = lastChar;
  }
  get length() {
    return this.lastChar + 1 - this.firstChar;
  }
  forEach(callback) {
    for (let i = this.firstChar, ii = this.lastChar; i <= ii; i++) {
      callback(i, i);
    }
  }
  has(i) {
    return this.firstChar <= i && i <= this.lastChar;
  }
  get(i) {
    if (this.firstChar <= i && i <= this.lastChar) {
      return String.fromCharCode(i);
    }
    return undefined;
  }
  charCodeOf(v) {
    return Number.isInteger(v) && v >= this.firstChar && v <= this.lastChar ? v : -1;
  }
  amend(map) {
    (0, _util.unreachable)("Should not call amend()");
  }
}
exports.IdentityToUnicodeMap = IdentityToUnicodeMap;