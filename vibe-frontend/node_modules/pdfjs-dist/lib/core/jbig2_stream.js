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
exports.Jbig2Stream = void 0;
var _base_stream = require("./base_stream.js");
var _decode_stream = require("./decode_stream.js");
var _primitives = require("./primitives.js");
var _jbig = require("./jbig2.js");
var _util = require("../shared/util.js");
class Jbig2Stream extends _decode_stream.DecodeStream {
  constructor(stream, maybeLength, params) {
    super(maybeLength);
    this.stream = stream;
    this.dict = stream.dict;
    this.maybeLength = maybeLength;
    this.params = params;
  }
  get bytes() {
    return (0, _util.shadow)(this, "bytes", this.stream.getBytes(this.maybeLength));
  }
  ensureBuffer(requested) {}
  readBlock() {
    if (this.eof) {
      return;
    }
    const jbig2Image = new _jbig.Jbig2Image();
    const chunks = [];
    if (this.params instanceof _primitives.Dict) {
      const globalsStream = this.params.get("JBIG2Globals");
      if (globalsStream instanceof _base_stream.BaseStream) {
        const globals = globalsStream.getBytes();
        chunks.push({
          data: globals,
          start: 0,
          end: globals.length
        });
      }
    }
    chunks.push({
      data: this.bytes,
      start: 0,
      end: this.bytes.length
    });
    const data = jbig2Image.parseChunks(chunks);
    const dataLength = data.length;
    for (let i = 0; i < dataLength; i++) {
      data[i] ^= 0xff;
    }
    this.buffer = data;
    this.bufferLength = dataLength;
    this.eof = true;
  }
}
exports.Jbig2Stream = Jbig2Stream;