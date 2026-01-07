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
exports.StylesheetNamespace = void 0;
var _namespaces = require("./namespaces.js");
var _xfa_object = require("./xfa_object.js");
const STYLESHEET_NS_ID = _namespaces.NamespaceIds.stylesheet.id;
class Stylesheet extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(STYLESHEET_NS_ID, "stylesheet", true);
  }
}
class StylesheetNamespace {
  static [_namespaces.$buildXFAObject](name, attributes) {
    if (StylesheetNamespace.hasOwnProperty(name)) {
      return StylesheetNamespace[name](attributes);
    }
    return undefined;
  }
  static stylesheet(attributes) {
    return new Stylesheet(attributes);
  }
}
exports.StylesheetNamespace = StylesheetNamespace;