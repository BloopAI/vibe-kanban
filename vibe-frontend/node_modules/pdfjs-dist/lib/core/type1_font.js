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
exports.Type1Font = void 0;
var _cff_parser = require("./cff_parser.js");
var _util = require("../shared/util.js");
var _fonts_utils = require("./fonts_utils.js");
var _core_utils = require("./core_utils.js");
var _stream = require("./stream.js");
var _type1_parser = require("./type1_parser.js");
function findBlock(streamBytes, signature, startIndex) {
  const streamBytesLength = streamBytes.length;
  const signatureLength = signature.length;
  const scanLength = streamBytesLength - signatureLength;
  let i = startIndex,
    found = false;
  while (i < scanLength) {
    let j = 0;
    while (j < signatureLength && streamBytes[i + j] === signature[j]) {
      j++;
    }
    if (j >= signatureLength) {
      i += j;
      while (i < streamBytesLength && (0, _core_utils.isWhiteSpace)(streamBytes[i])) {
        i++;
      }
      found = true;
      break;
    }
    i++;
  }
  return {
    found,
    length: i
  };
}
function getHeaderBlock(stream, suggestedLength) {
  const EEXEC_SIGNATURE = [0x65, 0x65, 0x78, 0x65, 0x63];
  const streamStartPos = stream.pos;
  let headerBytes, headerBytesLength, block;
  try {
    headerBytes = stream.getBytes(suggestedLength);
    headerBytesLength = headerBytes.length;
  } catch (ex) {}
  if (headerBytesLength === suggestedLength) {
    block = findBlock(headerBytes, EEXEC_SIGNATURE, suggestedLength - 2 * EEXEC_SIGNATURE.length);
    if (block.found && block.length === suggestedLength) {
      return {
        stream: new _stream.Stream(headerBytes),
        length: suggestedLength
      };
    }
  }
  (0, _util.warn)('Invalid "Length1" property in Type1 font -- trying to recover.');
  stream.pos = streamStartPos;
  const SCAN_BLOCK_LENGTH = 2048;
  let actualLength;
  while (true) {
    const scanBytes = stream.peekBytes(SCAN_BLOCK_LENGTH);
    block = findBlock(scanBytes, EEXEC_SIGNATURE, 0);
    if (block.length === 0) {
      break;
    }
    stream.pos += block.length;
    if (block.found) {
      actualLength = stream.pos - streamStartPos;
      break;
    }
  }
  stream.pos = streamStartPos;
  if (actualLength) {
    return {
      stream: new _stream.Stream(stream.getBytes(actualLength)),
      length: actualLength
    };
  }
  (0, _util.warn)('Unable to recover "Length1" property in Type1 font -- using as is.');
  return {
    stream: new _stream.Stream(stream.getBytes(suggestedLength)),
    length: suggestedLength
  };
}
function getEexecBlock(stream, suggestedLength) {
  const eexecBytes = stream.getBytes();
  if (eexecBytes.length === 0) {
    throw new _util.FormatError("getEexecBlock - no font program found.");
  }
  return {
    stream: new _stream.Stream(eexecBytes),
    length: eexecBytes.length
  };
}
class Type1Font {
  constructor(name, file, properties) {
    const PFB_HEADER_SIZE = 6;
    let headerBlockLength = properties.length1;
    let eexecBlockLength = properties.length2;
    let pfbHeader = file.peekBytes(PFB_HEADER_SIZE);
    const pfbHeaderPresent = pfbHeader[0] === 0x80 && pfbHeader[1] === 0x01;
    if (pfbHeaderPresent) {
      file.skip(PFB_HEADER_SIZE);
      headerBlockLength = pfbHeader[5] << 24 | pfbHeader[4] << 16 | pfbHeader[3] << 8 | pfbHeader[2];
    }
    const headerBlock = getHeaderBlock(file, headerBlockLength);
    const headerBlockParser = new _type1_parser.Type1Parser(headerBlock.stream, false, _fonts_utils.SEAC_ANALYSIS_ENABLED);
    headerBlockParser.extractFontHeader(properties);
    if (pfbHeaderPresent) {
      pfbHeader = file.getBytes(PFB_HEADER_SIZE);
      eexecBlockLength = pfbHeader[5] << 24 | pfbHeader[4] << 16 | pfbHeader[3] << 8 | pfbHeader[2];
    }
    const eexecBlock = getEexecBlock(file, eexecBlockLength);
    const eexecBlockParser = new _type1_parser.Type1Parser(eexecBlock.stream, true, _fonts_utils.SEAC_ANALYSIS_ENABLED);
    const data = eexecBlockParser.extractFontProgram(properties);
    for (const key in data.properties) {
      properties[key] = data.properties[key];
    }
    const charstrings = data.charstrings;
    const type2Charstrings = this.getType2Charstrings(charstrings);
    const subrs = this.getType2Subrs(data.subrs);
    this.charstrings = charstrings;
    this.data = this.wrap(name, type2Charstrings, this.charstrings, subrs, properties);
    this.seacs = this.getSeacs(data.charstrings);
  }
  get numGlyphs() {
    return this.charstrings.length + 1;
  }
  getCharset() {
    const charset = [".notdef"];
    for (const {
      glyphName
    } of this.charstrings) {
      charset.push(glyphName);
    }
    return charset;
  }
  getGlyphMapping(properties) {
    const charstrings = this.charstrings;
    if (properties.composite) {
      const charCodeToGlyphId = Object.create(null);
      for (let glyphId = 0, charstringsLen = charstrings.length; glyphId < charstringsLen; glyphId++) {
        const charCode = properties.cMap.charCodeOf(glyphId);
        charCodeToGlyphId[charCode] = glyphId + 1;
      }
      return charCodeToGlyphId;
    }
    const glyphNames = [".notdef"];
    let builtInEncoding, glyphId;
    for (glyphId = 0; glyphId < charstrings.length; glyphId++) {
      glyphNames.push(charstrings[glyphId].glyphName);
    }
    const encoding = properties.builtInEncoding;
    if (encoding) {
      builtInEncoding = Object.create(null);
      for (const charCode in encoding) {
        glyphId = glyphNames.indexOf(encoding[charCode]);
        if (glyphId >= 0) {
          builtInEncoding[charCode] = glyphId;
        }
      }
    }
    return (0, _fonts_utils.type1FontGlyphMapping)(properties, builtInEncoding, glyphNames);
  }
  hasGlyphId(id) {
    if (id < 0 || id >= this.numGlyphs) {
      return false;
    }
    if (id === 0) {
      return true;
    }
    const glyph = this.charstrings[id - 1];
    return glyph.charstring.length > 0;
  }
  getSeacs(charstrings) {
    const seacMap = [];
    for (let i = 0, ii = charstrings.length; i < ii; i++) {
      const charstring = charstrings[i];
      if (charstring.seac) {
        seacMap[i + 1] = charstring.seac;
      }
    }
    return seacMap;
  }
  getType2Charstrings(type1Charstrings) {
    const type2Charstrings = [];
    for (const type1Charstring of type1Charstrings) {
      type2Charstrings.push(type1Charstring.charstring);
    }
    return type2Charstrings;
  }
  getType2Subrs(type1Subrs) {
    let bias = 0;
    const count = type1Subrs.length;
    if (count < 1133) {
      bias = 107;
    } else if (count < 33769) {
      bias = 1131;
    } else {
      bias = 32768;
    }
    const type2Subrs = [];
    let i;
    for (i = 0; i < bias; i++) {
      type2Subrs.push([0x0b]);
    }
    for (i = 0; i < count; i++) {
      type2Subrs.push(type1Subrs[i]);
    }
    return type2Subrs;
  }
  wrap(name, glyphs, charstrings, subrs, properties) {
    const cff = new _cff_parser.CFF();
    cff.header = new _cff_parser.CFFHeader(1, 0, 4, 4);
    cff.names = [name];
    const topDict = new _cff_parser.CFFTopDict();
    topDict.setByName("version", 391);
    topDict.setByName("Notice", 392);
    topDict.setByName("FullName", 393);
    topDict.setByName("FamilyName", 394);
    topDict.setByName("Weight", 395);
    topDict.setByName("Encoding", null);
    topDict.setByName("FontMatrix", properties.fontMatrix);
    topDict.setByName("FontBBox", properties.bbox);
    topDict.setByName("charset", null);
    topDict.setByName("CharStrings", null);
    topDict.setByName("Private", null);
    cff.topDict = topDict;
    const strings = new _cff_parser.CFFStrings();
    strings.add("Version 0.11");
    strings.add("See original notice");
    strings.add(name);
    strings.add(name);
    strings.add("Medium");
    cff.strings = strings;
    cff.globalSubrIndex = new _cff_parser.CFFIndex();
    const count = glyphs.length;
    const charsetArray = [".notdef"];
    let i, ii;
    for (i = 0; i < count; i++) {
      const glyphName = charstrings[i].glyphName;
      const index = _cff_parser.CFFStandardStrings.indexOf(glyphName);
      if (index === -1) {
        strings.add(glyphName);
      }
      charsetArray.push(glyphName);
    }
    cff.charset = new _cff_parser.CFFCharset(false, 0, charsetArray);
    const charStringsIndex = new _cff_parser.CFFIndex();
    charStringsIndex.add([0x8b, 0x0e]);
    for (i = 0; i < count; i++) {
      charStringsIndex.add(glyphs[i]);
    }
    cff.charStrings = charStringsIndex;
    const privateDict = new _cff_parser.CFFPrivateDict();
    privateDict.setByName("Subrs", null);
    const fields = ["BlueValues", "OtherBlues", "FamilyBlues", "FamilyOtherBlues", "StemSnapH", "StemSnapV", "BlueShift", "BlueFuzz", "BlueScale", "LanguageGroup", "ExpansionFactor", "ForceBold", "StdHW", "StdVW"];
    for (i = 0, ii = fields.length; i < ii; i++) {
      const field = fields[i];
      if (!(field in properties.privateData)) {
        continue;
      }
      const value = properties.privateData[field];
      if (Array.isArray(value)) {
        for (let j = value.length - 1; j > 0; j--) {
          value[j] -= value[j - 1];
        }
      }
      privateDict.setByName(field, value);
    }
    cff.topDict.privateDict = privateDict;
    const subrIndex = new _cff_parser.CFFIndex();
    for (i = 0, ii = subrs.length; i < ii; i++) {
      subrIndex.add(subrs[i]);
    }
    privateDict.subrsIndex = subrIndex;
    const compiler = new _cff_parser.CFFCompiler(cff);
    return compiler.compile();
  }
}
exports.Type1Font = Type1Font;