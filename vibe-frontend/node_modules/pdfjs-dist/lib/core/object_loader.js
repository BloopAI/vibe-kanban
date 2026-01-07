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
exports.ObjectLoader = void 0;
var _primitives = require("./primitives.js");
var _base_stream = require("./base_stream.js");
var _core_utils = require("./core_utils.js");
var _util = require("../shared/util.js");
function mayHaveChildren(value) {
  return value instanceof _primitives.Ref || value instanceof _primitives.Dict || value instanceof _base_stream.BaseStream || Array.isArray(value);
}
function addChildren(node, nodesToVisit) {
  if (node instanceof _primitives.Dict) {
    node = node.getRawValues();
  } else if (node instanceof _base_stream.BaseStream) {
    node = node.dict.getRawValues();
  } else if (!Array.isArray(node)) {
    return;
  }
  for (const rawValue of node) {
    if (mayHaveChildren(rawValue)) {
      nodesToVisit.push(rawValue);
    }
  }
}
class ObjectLoader {
  constructor(dict, keys, xref) {
    this.dict = dict;
    this.keys = keys;
    this.xref = xref;
    this.refSet = null;
  }
  async load() {
    if (this.xref.stream.isDataLoaded) {
      return undefined;
    }
    const {
      keys,
      dict
    } = this;
    this.refSet = new _primitives.RefSet();
    const nodesToVisit = [];
    for (const key of keys) {
      const rawValue = dict.getRaw(key);
      if (rawValue !== undefined) {
        nodesToVisit.push(rawValue);
      }
    }
    return this._walk(nodesToVisit);
  }
  async _walk(nodesToVisit) {
    const nodesToRevisit = [];
    const pendingRequests = [];
    while (nodesToVisit.length) {
      let currentNode = nodesToVisit.pop();
      if (currentNode instanceof _primitives.Ref) {
        if (this.refSet.has(currentNode)) {
          continue;
        }
        try {
          this.refSet.put(currentNode);
          currentNode = this.xref.fetch(currentNode);
        } catch (ex) {
          if (!(ex instanceof _core_utils.MissingDataException)) {
            (0, _util.warn)(`ObjectLoader._walk - requesting all data: "${ex}".`);
            this.refSet = null;
            const {
              manager
            } = this.xref.stream;
            return manager.requestAllChunks();
          }
          nodesToRevisit.push(currentNode);
          pendingRequests.push({
            begin: ex.begin,
            end: ex.end
          });
        }
      }
      if (currentNode instanceof _base_stream.BaseStream) {
        const baseStreams = currentNode.getBaseStreams();
        if (baseStreams) {
          let foundMissingData = false;
          for (const stream of baseStreams) {
            if (stream.isDataLoaded) {
              continue;
            }
            foundMissingData = true;
            pendingRequests.push({
              begin: stream.start,
              end: stream.end
            });
          }
          if (foundMissingData) {
            nodesToRevisit.push(currentNode);
          }
        }
      }
      addChildren(currentNode, nodesToVisit);
    }
    if (pendingRequests.length) {
      await this.xref.stream.manager.requestRanges(pendingRequests);
      for (const node of nodesToRevisit) {
        if (node instanceof _primitives.Ref) {
          this.refSet.remove(node);
        }
      }
      return this._walk(nodesToRevisit);
    }
    this.refSet = null;
    return undefined;
  }
}
exports.ObjectLoader = ObjectLoader;