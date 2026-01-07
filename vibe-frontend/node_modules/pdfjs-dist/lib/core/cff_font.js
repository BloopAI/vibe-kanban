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
exports.CFFFont = void 0;
var _cff_parser = require("./cff_parser.js");
var _fonts_utils = require("./fonts_utils.js");
var _util = require("../shared/util.js");
class CFFFont {
  constructor(file, properties) {
    this.properties = properties;
    const parser = new _cff_parser.CFFParser(file, properties, _fonts_utils.SEAC_ANALYSIS_ENABLED);
    this.cff = parser.parse();
    this.cff.duplicateFirstGlyph();
    const compiler = new _cff_parser.CFFCompiler(this.cff);
    this.seacs = this.cff.seacs;
    try {
      this.data = compiler.compile();
    } catch (e) {
      (0, _util.warn)("Failed to compile font " + properties.loadedName);
      this.data = file;
    }
    this._createBuiltInEncoding();
  }
  get numGlyphs() {
    return this.cff.charStrings.count;
  }
  getCharset() {
    return this.cff.charset.charset;
  }
  getGlyphMapping() {
    const cff = this.cff;
    const properties = this.properties;
    const {
      cidToGidMap,
      cMap
    } = properties;
    const charsets = cff.charset.charset;
    let charCodeToGlyphId;
    let glyphId;
    if (properties.composite) {
      let invCidToGidMap;
      if (cidToGidMap && cidToGidMap.length > 0) {
        invCidToGidMap = Object.create(null);
        for (let i = 0, ii = cidToGidMap.length; i < ii; i++) {
          const gid = cidToGidMap[i];
          if (gid !== undefined) {
            invCidToGidMap[gid] = i;
          }
        }
      }
      charCodeToGlyphId = Object.create(null);
      let charCode;
      if (cff.isCIDFont) {
        for (glyphId = 0; glyphId < charsets.length; glyphId++) {
          const cid = charsets[glyphId];
          charCode = cMap.charCodeOf(cid);
          if (invCidToGidMap && invCidToGidMap[charCode] !== undefined) {
            charCode = invCidToGidMap[charCode];
          }
          charCodeToGlyphId[charCode] = glyphId;
        }
      } else {
        for (glyphId = 0; glyphId < cff.charStrings.count; glyphId++) {
          charCode = cMap.charCodeOf(glyphId);
          charCodeToGlyphId[charCode] = glyphId;
        }
      }
      return charCodeToGlyphId;
    }
    let encoding = cff.encoding ? cff.encoding.encoding : null;
    if (properties.isInternalFont) {
      encoding = properties.defaultEncoding;
    }
    charCodeToGlyphId = (0, _fonts_utils.type1FontGlyphMapping)(properties, encoding, charsets);
    return charCodeToGlyphId;
  }
  hasGlyphId(id) {
    return this.cff.hasGlyphId(id);
  }
  _createBuiltInEncoding() {
    const {
      charset,
      encoding
    } = this.cff;
    if (!charset || !encoding) {
      return;
    }
    const charsets = charset.charset,
      encodings = encoding.encoding;
    const map = [];
    for (const charCode in encodings) {
      const glyphId = encodings[charCode];
      if (glyphId >= 0) {
        const glyphName = charsets[glyphId];
        if (glyphName) {
          map[charCode] = glyphName;
        }
      }
    }
    if (map.length > 0) {
      this.properties.builtInEncoding = map;
    }
  }
}
exports.CFFFont = CFFFont;