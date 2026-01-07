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
exports.XFAParser = void 0;
var _xfa_object = require("./xfa_object.js");
var _xml_parser = require("../xml_parser.js");
var _builder = require("./builder.js");
var _util = require("../../shared/util.js");
class XFAParser extends _xml_parser.XMLParserBase {
  constructor(rootNameSpace = null, richText = false) {
    super();
    this._builder = new _builder.Builder(rootNameSpace);
    this._stack = [];
    this._globalData = {
      usedTypefaces: new Set()
    };
    this._ids = new Map();
    this._current = this._builder.buildRoot(this._ids);
    this._errorCode = _xml_parser.XMLParserErrorCode.NoError;
    this._whiteRegex = /^\s+$/;
    this._nbsps = /\xa0+/g;
    this._richText = richText;
  }
  parse(data) {
    this.parseXml(data);
    if (this._errorCode !== _xml_parser.XMLParserErrorCode.NoError) {
      return undefined;
    }
    this._current[_xfa_object.$finalize]();
    return this._current.element;
  }
  onText(text) {
    text = text.replace(this._nbsps, match => match.slice(1) + " ");
    if (this._richText || this._current[_xfa_object.$acceptWhitespace]()) {
      this._current[_xfa_object.$onText](text, this._richText);
      return;
    }
    if (this._whiteRegex.test(text)) {
      return;
    }
    this._current[_xfa_object.$onText](text.trim());
  }
  onCdata(text) {
    this._current[_xfa_object.$onText](text);
  }
  _mkAttributes(attributes, tagName) {
    let namespace = null;
    let prefixes = null;
    const attributeObj = Object.create({});
    for (const {
      name,
      value
    } of attributes) {
      if (name === "xmlns") {
        if (!namespace) {
          namespace = value;
        } else {
          (0, _util.warn)(`XFA - multiple namespace definition in <${tagName}>`);
        }
      } else if (name.startsWith("xmlns:")) {
        const prefix = name.substring("xmlns:".length);
        if (!prefixes) {
          prefixes = [];
        }
        prefixes.push({
          prefix,
          value
        });
      } else {
        const i = name.indexOf(":");
        if (i === -1) {
          attributeObj[name] = value;
        } else {
          let nsAttrs = attributeObj[_xfa_object.$nsAttributes];
          if (!nsAttrs) {
            nsAttrs = attributeObj[_xfa_object.$nsAttributes] = Object.create(null);
          }
          const [ns, attrName] = [name.slice(0, i), name.slice(i + 1)];
          let attrs = nsAttrs[ns];
          if (!attrs) {
            attrs = nsAttrs[ns] = Object.create(null);
          }
          attrs[attrName] = value;
        }
      }
    }
    return [namespace, prefixes, attributeObj];
  }
  _getNameAndPrefix(name, nsAgnostic) {
    const i = name.indexOf(":");
    if (i === -1) {
      return [name, null];
    }
    return [name.substring(i + 1), nsAgnostic ? "" : name.substring(0, i)];
  }
  onBeginElement(tagName, attributes, isEmpty) {
    const [namespace, prefixes, attributesObj] = this._mkAttributes(attributes, tagName);
    const [name, nsPrefix] = this._getNameAndPrefix(tagName, this._builder.isNsAgnostic());
    const node = this._builder.build({
      nsPrefix,
      name,
      attributes: attributesObj,
      namespace,
      prefixes
    });
    node[_xfa_object.$globalData] = this._globalData;
    if (isEmpty) {
      node[_xfa_object.$finalize]();
      if (this._current[_xfa_object.$onChild](node)) {
        node[_xfa_object.$setId](this._ids);
      }
      node[_xfa_object.$clean](this._builder);
      return;
    }
    this._stack.push(this._current);
    this._current = node;
  }
  onEndElement(name) {
    const node = this._current;
    if (node[_xfa_object.$isCDATAXml]() && typeof node[_xfa_object.$content] === "string") {
      const parser = new XFAParser();
      parser._globalData = this._globalData;
      const root = parser.parse(node[_xfa_object.$content]);
      node[_xfa_object.$content] = null;
      node[_xfa_object.$onChild](root);
    }
    node[_xfa_object.$finalize]();
    this._current = this._stack.pop();
    if (this._current[_xfa_object.$onChild](node)) {
      node[_xfa_object.$setId](this._ids);
    }
    node[_xfa_object.$clean](this._builder);
  }
  onError(code) {
    this._errorCode = code;
  }
}
exports.XFAParser = XFAParser;