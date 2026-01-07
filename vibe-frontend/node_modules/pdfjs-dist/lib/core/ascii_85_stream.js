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
exports.Ascii85Stream = void 0;
var _decode_stream = require("./decode_stream.js");
var _core_utils = require("./core_utils.js");
class Ascii85Stream extends _decode_stream.DecodeStream {
  constructor(str, maybeLength) {
    if (maybeLength) {
      maybeLength *= 0.8;
    }
    super(maybeLength);
    this.str = str;
    this.dict = str.dict;
    this.input = new Uint8Array(5);
  }
  readBlock() {
    const TILDA_CHAR = 0x7e;
    const Z_LOWER_CHAR = 0x7a;
    const EOF = -1;
    const str = this.str;
    let c = str.getByte();
    while ((0, _core_utils.isWhiteSpace)(c)) {
      c = str.getByte();
    }
    if (c === EOF || c === TILDA_CHAR) {
      this.eof = true;
      return;
    }
    const bufferLength = this.bufferLength;
    let buffer, i;
    if (c === Z_LOWER_CHAR) {
      buffer = this.ensureBuffer(bufferLength + 4);
      for (i = 0; i < 4; ++i) {
        buffer[bufferLength + i] = 0;
      }
      this.bufferLength += 4;
    } else {
      const input = this.input;
      input[0] = c;
      for (i = 1; i < 5; ++i) {
        c = str.getByte();
        while ((0, _core_utils.isWhiteSpace)(c)) {
          c = str.getByte();
        }
        input[i] = c;
        if (c === EOF || c === TILDA_CHAR) {
          break;
        }
      }
      buffer = this.ensureBuffer(bufferLength + i - 1);
      this.bufferLength += i - 1;
      if (i < 5) {
        for (; i < 5; ++i) {
          input[i] = 0x21 + 84;
        }
        this.eof = true;
      }
      let t = 0;
      for (i = 0; i < 5; ++i) {
        t = t * 85 + (input[i] - 0x21);
      }
      for (i = 3; i >= 0; --i) {
        buffer[bufferLength + i] = t & 0xff;
        t >>= 8;
      }
    }
  }
}
exports.Ascii85Stream = Ascii85Stream;