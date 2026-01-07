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
exports.BaseStream = void 0;
var _util = require("../shared/util.js");
class BaseStream {
  constructor() {
    if (this.constructor === BaseStream) {
      (0, _util.unreachable)("Cannot initialize BaseStream.");
    }
  }
  get length() {
    (0, _util.unreachable)("Abstract getter `length` accessed");
  }
  get isEmpty() {
    (0, _util.unreachable)("Abstract getter `isEmpty` accessed");
  }
  get isDataLoaded() {
    return (0, _util.shadow)(this, "isDataLoaded", true);
  }
  getByte() {
    (0, _util.unreachable)("Abstract method `getByte` called");
  }
  getBytes(length) {
    (0, _util.unreachable)("Abstract method `getBytes` called");
  }
  peekByte() {
    const peekedByte = this.getByte();
    if (peekedByte !== -1) {
      this.pos--;
    }
    return peekedByte;
  }
  peekBytes(length) {
    const bytes = this.getBytes(length);
    this.pos -= bytes.length;
    return bytes;
  }
  getUint16() {
    const b0 = this.getByte();
    const b1 = this.getByte();
    if (b0 === -1 || b1 === -1) {
      return -1;
    }
    return (b0 << 8) + b1;
  }
  getInt32() {
    const b0 = this.getByte();
    const b1 = this.getByte();
    const b2 = this.getByte();
    const b3 = this.getByte();
    return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
  }
  getByteRange(begin, end) {
    (0, _util.unreachable)("Abstract method `getByteRange` called");
  }
  getString(length) {
    return (0, _util.bytesToString)(this.getBytes(length));
  }
  skip(n) {
    this.pos += n || 1;
  }
  reset() {
    (0, _util.unreachable)("Abstract method `reset` called");
  }
  moveStart() {
    (0, _util.unreachable)("Abstract method `moveStart` called");
  }
  makeSubStream(start, length, dict = null) {
    (0, _util.unreachable)("Abstract method `makeSubStream` called");
  }
  getBaseStreams() {
    return null;
  }
}
exports.BaseStream = BaseStream;