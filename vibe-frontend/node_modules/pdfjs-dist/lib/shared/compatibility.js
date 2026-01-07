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

var _is_node = require("./is_node.js");
(function checkNodeBtoa() {
  if (globalThis.btoa || !_is_node.isNodeJS) {
    return;
  }
  globalThis.btoa = function (chars) {
    return Buffer.from(chars, "binary").toString("base64");
  };
})();
(function checkNodeAtob() {
  if (globalThis.atob || !_is_node.isNodeJS) {
    return;
  }
  globalThis.atob = function (input) {
    return Buffer.from(input, "base64").toString("binary");
  };
})();
(function checkDOMMatrix() {
  if (globalThis.DOMMatrix || !_is_node.isNodeJS) {
    return;
  }
  globalThis.DOMMatrix = require("canvas").DOMMatrix;
})();
(function checkPath2D() {
  if (globalThis.Path2D || !_is_node.isNodeJS) {
    return;
  }
  const {
    CanvasRenderingContext2D
  } = require("canvas");
  const {
    polyfillPath2D
  } = require("path2d-polyfill");
  globalThis.CanvasRenderingContext2D = CanvasRenderingContext2D;
  polyfillPath2D(globalThis);
})();
(function checkReadableStream() {
  if (globalThis.ReadableStream || !_is_node.isNodeJS) {
    return;
  }
  globalThis.ReadableStream = require("web-streams-polyfill/dist/ponyfill.js").ReadableStream;
})();
(function checkArrayAt() {
  if (Array.prototype.at) {
    return;
  }
  require("core-js/es/array/at.js");
})();
(function checkTypedArrayAt() {
  if (Uint8Array.prototype.at) {
    return;
  }
  require("core-js/es/typed-array/at.js");
})();
(function checkStructuredClone() {
  if (globalThis.structuredClone) {
    return;
  }
  require("core-js/web/structured-clone.js");
})();