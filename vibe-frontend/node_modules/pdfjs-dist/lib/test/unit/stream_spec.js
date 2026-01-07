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

var _primitives = require("../../core/primitives.js");
var _predictor_stream = require("../../core/predictor_stream.js");
var _stream = require("../../core/stream.js");
describe("stream", function () {
  describe("PredictorStream", function () {
    it("should decode simple predictor data", function () {
      const dict = new _primitives.Dict();
      dict.set("Predictor", 12);
      dict.set("Colors", 1);
      dict.set("BitsPerComponent", 8);
      dict.set("Columns", 2);
      const input = new _stream.Stream(new Uint8Array([2, 100, 3, 2, 1, 255, 2, 1, 255]), 0, 9, dict);
      const predictor = new _predictor_stream.PredictorStream(input, 9, dict);
      const result = predictor.getBytes(6);
      expect(result).toEqual(new Uint8Array([100, 3, 101, 2, 102, 1]));
    });
  });
});