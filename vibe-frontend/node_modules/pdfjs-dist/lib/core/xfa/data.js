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
exports.DataHandler = void 0;
var _xfa_object = require("./xfa_object.js");
class DataHandler {
  constructor(root, data) {
    this.data = data;
    this.dataset = root.datasets || null;
  }
  serialize(storage) {
    const stack = [[-1, this.data[_xfa_object.$getChildren]()]];
    while (stack.length > 0) {
      const last = stack.at(-1);
      const [i, children] = last;
      if (i + 1 === children.length) {
        stack.pop();
        continue;
      }
      const child = children[++last[0]];
      const storageEntry = storage.get(child[_xfa_object.$uid]);
      if (storageEntry) {
        child[_xfa_object.$setValue](storageEntry);
      } else {
        const attributes = child[_xfa_object.$getAttributes]();
        for (const value of attributes.values()) {
          const entry = storage.get(value[_xfa_object.$uid]);
          if (entry) {
            value[_xfa_object.$setValue](entry);
            break;
          }
        }
      }
      const nodes = child[_xfa_object.$getChildren]();
      if (nodes.length > 0) {
        stack.push([-1, nodes]);
      }
    }
    const buf = [`<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">`];
    if (this.dataset) {
      for (const child of this.dataset[_xfa_object.$getChildren]()) {
        if (child[_xfa_object.$nodeName] !== "data") {
          child[_xfa_object.$toString](buf);
        }
      }
    }
    this.data[_xfa_object.$toString](buf);
    buf.push("</xfa:datasets>");
    return buf.join("");
  }
}
exports.DataHandler = DataHandler;