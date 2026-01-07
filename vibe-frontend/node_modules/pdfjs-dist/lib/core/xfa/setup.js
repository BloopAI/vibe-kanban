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
exports.NamespaceSetUp = void 0;
var _config = require("./config.js");
var _connection_set = require("./connection_set.js");
var _datasets = require("./datasets.js");
var _locale_set = require("./locale_set.js");
var _signature = require("./signature.js");
var _stylesheet = require("./stylesheet.js");
var _template = require("./template.js");
var _xdp = require("./xdp.js");
var _xhtml = require("./xhtml.js");
const NamespaceSetUp = {
  config: _config.ConfigNamespace,
  connection: _connection_set.ConnectionSetNamespace,
  datasets: _datasets.DatasetsNamespace,
  localeSet: _locale_set.LocaleSetNamespace,
  signature: _signature.SignatureNamespace,
  stylesheet: _stylesheet.StylesheetNamespace,
  template: _template.TemplateNamespace,
  xdp: _xdp.XdpNamespace,
  xhtml: _xhtml.XhtmlNamespace
};
exports.NamespaceSetUp = NamespaceSetUp;