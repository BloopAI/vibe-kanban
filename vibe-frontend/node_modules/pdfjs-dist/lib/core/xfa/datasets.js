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
exports.DatasetsNamespace = void 0;
var _xfa_object = require("./xfa_object.js");
var _namespaces = require("./namespaces.js");
const DATASETS_NS_ID = _namespaces.NamespaceIds.datasets.id;
class Data extends _xfa_object.XmlObject {
  constructor(attributes) {
    super(DATASETS_NS_ID, "data", attributes);
  }
  [_xfa_object.$isNsAgnostic]() {
    return true;
  }
}
class Datasets extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(DATASETS_NS_ID, "datasets", true);
    this.data = null;
    this.Signature = null;
  }
  [_xfa_object.$onChild](child) {
    const name = child[_xfa_object.$nodeName];
    if (name === "data" && child[_xfa_object.$namespaceId] === DATASETS_NS_ID || name === "Signature" && child[_xfa_object.$namespaceId] === _namespaces.NamespaceIds.signature.id) {
      this[name] = child;
    }
    this[_xfa_object.$appendChild](child);
  }
}
class DatasetsNamespace {
  static [_namespaces.$buildXFAObject](name, attributes) {
    if (DatasetsNamespace.hasOwnProperty(name)) {
      return DatasetsNamespace[name](attributes);
    }
    return undefined;
  }
  static datasets(attributes) {
    return new Datasets(attributes);
  }
  static data(attributes) {
    return new Data(attributes);
  }
}
exports.DatasetsNamespace = DatasetsNamespace;