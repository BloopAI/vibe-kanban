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
exports.CCITTFaxStream = void 0;
var _ccitt = require("./ccitt.js");
var _decode_stream = require("./decode_stream.js");
var _primitives = require("./primitives.js");
class CCITTFaxStream extends _decode_stream.DecodeStream {
  constructor(str, maybeLength, params) {
    super(maybeLength);
    this.str = str;
    this.dict = str.dict;
    if (!(params instanceof _primitives.Dict)) {
      params = _primitives.Dict.empty;
    }
    const source = {
      next() {
        return str.getByte();
      }
    };
    this.ccittFaxDecoder = new _ccitt.CCITTFaxDecoder(source, {
      K: params.get("K"),
      EndOfLine: params.get("EndOfLine"),
      EncodedByteAlign: params.get("EncodedByteAlign"),
      Columns: params.get("Columns"),
      Rows: params.get("Rows"),
      EndOfBlock: params.get("EndOfBlock"),
      BlackIs1: params.get("BlackIs1")
    });
  }
  readBlock() {
    while (!this.eof) {
      const c = this.ccittFaxDecoder.readNextChar();
      if (c === -1) {
        this.eof = true;
        return;
      }
      this.ensureBuffer(this.bufferLength + 1);
      this.buffer[this.bufferLength++] = c;
    }
  }
}
exports.CCITTFaxStream = CCITTFaxStream;