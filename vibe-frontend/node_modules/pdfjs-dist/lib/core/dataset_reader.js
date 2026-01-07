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
exports.DatasetReader = void 0;
var _util = require("../shared/util.js");
var _core_utils = require("./core_utils.js");
var _xml_parser = require("./xml_parser.js");
function decodeString(str) {
  try {
    return (0, _util.stringToUTF8String)(str);
  } catch (ex) {
    (0, _util.warn)(`UTF-8 decoding failed: "${ex}".`);
    return str;
  }
}
class DatasetXMLParser extends _xml_parser.SimpleXMLParser {
  constructor(options) {
    super(options);
    this.node = null;
  }
  onEndElement(name) {
    const node = super.onEndElement(name);
    if (node && name === "xfa:datasets") {
      this.node = node;
      throw new Error("Aborting DatasetXMLParser.");
    }
  }
}
class DatasetReader {
  constructor(data) {
    if (data.datasets) {
      this.node = new _xml_parser.SimpleXMLParser({
        hasAttributes: true
      }).parseFromString(data.datasets).documentElement;
    } else {
      const parser = new DatasetXMLParser({
        hasAttributes: true
      });
      try {
        parser.parseFromString(data["xdp:xdp"]);
      } catch (_) {}
      this.node = parser.node;
    }
  }
  getValue(path) {
    if (!this.node || !path) {
      return "";
    }
    const node = this.node.searchNode((0, _core_utils.parseXFAPath)(path), 0);
    if (!node) {
      return "";
    }
    const first = node.firstChild;
    if (first && first.nodeName === "value") {
      return node.children.map(child => decodeString(child.textContent));
    }
    return decodeString(node.textContent);
  }
}
exports.DatasetReader = DatasetReader;