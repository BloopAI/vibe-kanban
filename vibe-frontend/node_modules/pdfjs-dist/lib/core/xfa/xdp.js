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
exports.XdpNamespace = void 0;
var _namespaces = require("./namespaces.js");
var _xfa_object = require("./xfa_object.js");
const XDP_NS_ID = _namespaces.NamespaceIds.xdp.id;
class Xdp extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(XDP_NS_ID, "xdp", true);
    this.uuid = attributes.uuid || "";
    this.timeStamp = attributes.timeStamp || "";
    this.config = null;
    this.connectionSet = null;
    this.datasets = null;
    this.localeSet = null;
    this.stylesheet = new _xfa_object.XFAObjectArray();
    this.template = null;
  }
  [_xfa_object.$onChildCheck](child) {
    const ns = _namespaces.NamespaceIds[child[_xfa_object.$nodeName]];
    return ns && child[_xfa_object.$namespaceId] === ns.id;
  }
}
class XdpNamespace {
  static [_namespaces.$buildXFAObject](name, attributes) {
    if (XdpNamespace.hasOwnProperty(name)) {
      return XdpNamespace[name](attributes);
    }
    return undefined;
  }
  static xdp(attributes) {
    return new Xdp(attributes);
  }
}
exports.XdpNamespace = XdpNamespace;