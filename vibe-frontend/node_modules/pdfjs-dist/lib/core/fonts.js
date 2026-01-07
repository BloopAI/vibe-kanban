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
exports.Font = exports.ErrorFont = void 0;
var _util = require("../shared/util.js");
var _cff_parser = require("./cff_parser.js");
var _fonts_utils = require("./fonts_utils.js");
var _unicode = require("./unicode.js");
var _glyphlist = require("./glyphlist.js");
var _encodings = require("./encodings.js");
var _standard_fonts = require("./standard_fonts.js");
var _to_unicode_map = require("./to_unicode_map.js");
var _cff_font = require("./cff_font.js");
var _font_renderer = require("./font_renderer.js");
var _metrics = require("./metrics.js");
var _glyf = require("./glyf.js");
var _cmap = require("./cmap.js");
var _opentype_file_builder = require("./opentype_file_builder.js");
var _core_utils = require("./core_utils.js");
var _stream = require("./stream.js");
var _type1_font = require("./type1_font.js");
const PRIVATE_USE_AREAS = [[0xe000, 0xf8ff], [0x100000, 0x10fffd]];
const PDF_GLYPH_SPACE_UNITS = 1000;
const EXPORT_DATA_PROPERTIES = ["ascent", "bbox", "black", "bold", "charProcOperatorList", "composite", "cssFontInfo", "data", "defaultVMetrics", "defaultWidth", "descent", "fallbackName", "fontMatrix", "isInvalidPDFjsFont", "isType3Font", "italic", "loadedName", "mimetype", "missingFile", "name", "remeasure", "subtype", "type", "vertical"];
const EXPORT_DATA_EXTRA_PROPERTIES = ["cMap", "defaultEncoding", "differences", "isMonospace", "isSerifFont", "isSymbolicFont", "seacMap", "toFontChar", "toUnicode", "vmetrics", "widths"];
function adjustWidths(properties) {
  if (!properties.fontMatrix) {
    return;
  }
  if (properties.fontMatrix[0] === _util.FONT_IDENTITY_MATRIX[0]) {
    return;
  }
  const scale = 0.001 / properties.fontMatrix[0];
  const glyphsWidths = properties.widths;
  for (const glyph in glyphsWidths) {
    glyphsWidths[glyph] *= scale;
  }
  properties.defaultWidth *= scale;
}
function adjustTrueTypeToUnicode(properties, isSymbolicFont, nameRecords) {
  if (properties.isInternalFont) {
    return;
  }
  if (properties.hasIncludedToUnicodeMap) {
    return;
  }
  if (properties.hasEncoding) {
    return;
  }
  if (properties.toUnicode instanceof _to_unicode_map.IdentityToUnicodeMap) {
    return;
  }
  if (!isSymbolicFont) {
    return;
  }
  if (nameRecords.length === 0) {
    return;
  }
  if (properties.defaultEncoding === _encodings.WinAnsiEncoding) {
    return;
  }
  for (const r of nameRecords) {
    if (!isWinNameRecord(r)) {
      return;
    }
  }
  const encoding = _encodings.WinAnsiEncoding;
  const toUnicode = [],
    glyphsUnicodeMap = (0, _glyphlist.getGlyphsUnicode)();
  for (const charCode in encoding) {
    const glyphName = encoding[charCode];
    if (glyphName === "") {
      continue;
    }
    const unicode = glyphsUnicodeMap[glyphName];
    if (unicode === undefined) {
      continue;
    }
    toUnicode[charCode] = String.fromCharCode(unicode);
  }
  if (toUnicode.length > 0) {
    properties.toUnicode.amend(toUnicode);
  }
}
function adjustType1ToUnicode(properties, builtInEncoding) {
  if (properties.isInternalFont) {
    return;
  }
  if (properties.hasIncludedToUnicodeMap) {
    return;
  }
  if (builtInEncoding === properties.defaultEncoding) {
    return;
  }
  if (properties.toUnicode instanceof _to_unicode_map.IdentityToUnicodeMap) {
    return;
  }
  const toUnicode = [],
    glyphsUnicodeMap = (0, _glyphlist.getGlyphsUnicode)();
  for (const charCode in builtInEncoding) {
    if (properties.hasEncoding) {
      if (properties.baseEncodingName || properties.differences[charCode] !== undefined) {
        continue;
      }
    }
    const glyphName = builtInEncoding[charCode];
    const unicode = (0, _unicode.getUnicodeForGlyph)(glyphName, glyphsUnicodeMap);
    if (unicode !== -1) {
      toUnicode[charCode] = String.fromCharCode(unicode);
    }
  }
  if (toUnicode.length > 0) {
    properties.toUnicode.amend(toUnicode);
  }
}
function amendFallbackToUnicode(properties) {
  if (!properties.fallbackToUnicode) {
    return;
  }
  if (properties.toUnicode instanceof _to_unicode_map.IdentityToUnicodeMap) {
    return;
  }
  const toUnicode = [];
  for (const charCode in properties.fallbackToUnicode) {
    if (properties.toUnicode.has(charCode)) {
      continue;
    }
    toUnicode[charCode] = properties.fallbackToUnicode[charCode];
  }
  if (toUnicode.length > 0) {
    properties.toUnicode.amend(toUnicode);
  }
}
class Glyph {
  constructor(originalCharCode, fontChar, unicode, accent, width, vmetric, operatorListId, isSpace, isInFont) {
    this.originalCharCode = originalCharCode;
    this.fontChar = fontChar;
    this.unicode = unicode;
    this.accent = accent;
    this.width = width;
    this.vmetric = vmetric;
    this.operatorListId = operatorListId;
    this.isSpace = isSpace;
    this.isInFont = isInFont;
  }
  get category() {
    return (0, _util.shadow)(this, "category", (0, _unicode.getCharUnicodeCategory)(this.unicode), true);
  }
  get normalizedUnicode() {
    return (0, _util.shadow)(this, "normalizedUnicode", (0, _unicode.reverseIfRtl)(Glyph._NormalizedUnicodes[this.unicode] || this.unicode), true);
  }
  static get _NormalizedUnicodes() {
    return (0, _util.shadow)(this, "_NormalizedUnicodes", (0, _unicode.getNormalizedUnicodes)());
  }
}
function int16(b0, b1) {
  return (b0 << 8) + b1;
}
function writeSignedInt16(bytes, index, value) {
  bytes[index + 1] = value;
  bytes[index] = value >>> 8;
}
function signedInt16(b0, b1) {
  const value = (b0 << 8) + b1;
  return value & 1 << 15 ? value - 0x10000 : value;
}
function int32(b0, b1, b2, b3) {
  return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
}
function string16(value) {
  return String.fromCharCode(value >> 8 & 0xff, value & 0xff);
}
function safeString16(value) {
  if (value > 0x7fff) {
    value = 0x7fff;
  } else if (value < -0x8000) {
    value = -0x8000;
  }
  return String.fromCharCode(value >> 8 & 0xff, value & 0xff);
}
function isTrueTypeFile(file) {
  const header = file.peekBytes(4);
  return (0, _core_utils.readUint32)(header, 0) === 0x00010000 || (0, _util.bytesToString)(header) === "true";
}
function isTrueTypeCollectionFile(file) {
  const header = file.peekBytes(4);
  return (0, _util.bytesToString)(header) === "ttcf";
}
function isOpenTypeFile(file) {
  const header = file.peekBytes(4);
  return (0, _util.bytesToString)(header) === "OTTO";
}
function isType1File(file) {
  const header = file.peekBytes(2);
  if (header[0] === 0x25 && header[1] === 0x21) {
    return true;
  }
  if (header[0] === 0x80 && header[1] === 0x01) {
    return true;
  }
  return false;
}
function isCFFFile(file) {
  const header = file.peekBytes(4);
  if (header[0] >= 1 && header[3] >= 1 && header[3] <= 4) {
    return true;
  }
  return false;
}
function getFontFileType(file, {
  type,
  subtype,
  composite
}) {
  let fileType, fileSubtype;
  if (isTrueTypeFile(file) || isTrueTypeCollectionFile(file)) {
    if (composite) {
      fileType = "CIDFontType2";
    } else {
      fileType = "TrueType";
    }
  } else if (isOpenTypeFile(file)) {
    if (composite) {
      fileType = "CIDFontType2";
    } else {
      fileType = "OpenType";
    }
  } else if (isType1File(file)) {
    if (composite) {
      fileType = "CIDFontType0";
    } else {
      fileType = type === "MMType1" ? "MMType1" : "Type1";
    }
  } else if (isCFFFile(file)) {
    if (composite) {
      fileType = "CIDFontType0";
      fileSubtype = "CIDFontType0C";
    } else {
      fileType = type === "MMType1" ? "MMType1" : "Type1";
      fileSubtype = "Type1C";
    }
  } else {
    (0, _util.warn)("getFontFileType: Unable to detect correct font file Type/Subtype.");
    fileType = type;
    fileSubtype = subtype;
  }
  return [fileType, fileSubtype];
}
function applyStandardFontGlyphMap(map, glyphMap) {
  for (const charCode in glyphMap) {
    map[+charCode] = glyphMap[charCode];
  }
}
function buildToFontChar(encoding, glyphsUnicodeMap, differences) {
  const toFontChar = [];
  let unicode;
  for (let i = 0, ii = encoding.length; i < ii; i++) {
    unicode = (0, _unicode.getUnicodeForGlyph)(encoding[i], glyphsUnicodeMap);
    if (unicode !== -1) {
      toFontChar[i] = unicode;
    }
  }
  for (const charCode in differences) {
    unicode = (0, _unicode.getUnicodeForGlyph)(differences[charCode], glyphsUnicodeMap);
    if (unicode !== -1) {
      toFontChar[+charCode] = unicode;
    }
  }
  return toFontChar;
}
function isMacNameRecord(r) {
  return r.platform === 1 && r.encoding === 0 && r.language === 0;
}
function isWinNameRecord(r) {
  return r.platform === 3 && r.encoding === 1 && r.language === 0x409;
}
function convertCidString(charCode, cid, shouldThrow = false) {
  switch (cid.length) {
    case 1:
      return cid.charCodeAt(0);
    case 2:
      return cid.charCodeAt(0) << 8 | cid.charCodeAt(1);
  }
  const msg = `Unsupported CID string (charCode ${charCode}): "${cid}".`;
  if (shouldThrow) {
    throw new _util.FormatError(msg);
  }
  (0, _util.warn)(msg);
  return cid;
}
function adjustMapping(charCodeToGlyphId, hasGlyph, newGlyphZeroId, toUnicode) {
  const newMap = Object.create(null);
  const toUnicodeExtraMap = new Map();
  const toFontChar = [];
  const usedGlyphIds = new Set();
  let privateUseAreaIndex = 0;
  const privateUseOffetStart = PRIVATE_USE_AREAS[privateUseAreaIndex][0];
  let nextAvailableFontCharCode = privateUseOffetStart;
  let privateUseOffetEnd = PRIVATE_USE_AREAS[privateUseAreaIndex][1];
  for (let originalCharCode in charCodeToGlyphId) {
    originalCharCode |= 0;
    let glyphId = charCodeToGlyphId[originalCharCode];
    if (!hasGlyph(glyphId)) {
      continue;
    }
    if (nextAvailableFontCharCode > privateUseOffetEnd) {
      privateUseAreaIndex++;
      if (privateUseAreaIndex >= PRIVATE_USE_AREAS.length) {
        (0, _util.warn)("Ran out of space in font private use area.");
        break;
      }
      nextAvailableFontCharCode = PRIVATE_USE_AREAS[privateUseAreaIndex][0];
      privateUseOffetEnd = PRIVATE_USE_AREAS[privateUseAreaIndex][1];
    }
    const fontCharCode = nextAvailableFontCharCode++;
    if (glyphId === 0) {
      glyphId = newGlyphZeroId;
    }
    let unicode = toUnicode.get(originalCharCode);
    if (typeof unicode === "string") {
      unicode = unicode.codePointAt(0);
    }
    if (unicode && unicode < privateUseOffetStart && !usedGlyphIds.has(glyphId)) {
      toUnicodeExtraMap.set(unicode, glyphId);
      usedGlyphIds.add(glyphId);
    }
    newMap[fontCharCode] = glyphId;
    toFontChar[originalCharCode] = fontCharCode;
  }
  return {
    toFontChar,
    charCodeToGlyphId: newMap,
    toUnicodeExtraMap,
    nextAvailableFontCharCode
  };
}
function getRanges(glyphs, toUnicodeExtraMap, numGlyphs) {
  const codes = [];
  for (const charCode in glyphs) {
    if (glyphs[charCode] >= numGlyphs) {
      continue;
    }
    codes.push({
      fontCharCode: charCode | 0,
      glyphId: glyphs[charCode]
    });
  }
  if (toUnicodeExtraMap) {
    for (const [unicode, glyphId] of toUnicodeExtraMap) {
      if (glyphId >= numGlyphs) {
        continue;
      }
      codes.push({
        fontCharCode: unicode,
        glyphId
      });
    }
  }
  if (codes.length === 0) {
    codes.push({
      fontCharCode: 0,
      glyphId: 0
    });
  }
  codes.sort(function fontGetRangesSort(a, b) {
    return a.fontCharCode - b.fontCharCode;
  });
  const ranges = [];
  const length = codes.length;
  for (let n = 0; n < length;) {
    const start = codes[n].fontCharCode;
    const codeIndices = [codes[n].glyphId];
    ++n;
    let end = start;
    while (n < length && end + 1 === codes[n].fontCharCode) {
      codeIndices.push(codes[n].glyphId);
      ++end;
      ++n;
      if (end === 0xffff) {
        break;
      }
    }
    ranges.push([start, end, codeIndices]);
  }
  return ranges;
}
function createCmapTable(glyphs, toUnicodeExtraMap, numGlyphs) {
  const ranges = getRanges(glyphs, toUnicodeExtraMap, numGlyphs);
  const numTables = ranges.at(-1)[1] > 0xffff ? 2 : 1;
  let cmap = "\x00\x00" + string16(numTables) + "\x00\x03" + "\x00\x01" + (0, _util.string32)(4 + numTables * 8);
  let i, ii, j, jj;
  for (i = ranges.length - 1; i >= 0; --i) {
    if (ranges[i][0] <= 0xffff) {
      break;
    }
  }
  const bmpLength = i + 1;
  if (ranges[i][0] < 0xffff && ranges[i][1] === 0xffff) {
    ranges[i][1] = 0xfffe;
  }
  const trailingRangesCount = ranges[i][1] < 0xffff ? 1 : 0;
  const segCount = bmpLength + trailingRangesCount;
  const searchParams = _opentype_file_builder.OpenTypeFileBuilder.getSearchParams(segCount, 2);
  let startCount = "";
  let endCount = "";
  let idDeltas = "";
  let idRangeOffsets = "";
  let glyphsIds = "";
  let bias = 0;
  let range, start, end, codes;
  for (i = 0, ii = bmpLength; i < ii; i++) {
    range = ranges[i];
    start = range[0];
    end = range[1];
    startCount += string16(start);
    endCount += string16(end);
    codes = range[2];
    let contiguous = true;
    for (j = 1, jj = codes.length; j < jj; ++j) {
      if (codes[j] !== codes[j - 1] + 1) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) {
      const offset = (segCount - i) * 2 + bias * 2;
      bias += end - start + 1;
      idDeltas += string16(0);
      idRangeOffsets += string16(offset);
      for (j = 0, jj = codes.length; j < jj; ++j) {
        glyphsIds += string16(codes[j]);
      }
    } else {
      const startCode = codes[0];
      idDeltas += string16(startCode - start & 0xffff);
      idRangeOffsets += string16(0);
    }
  }
  if (trailingRangesCount > 0) {
    endCount += "\xFF\xFF";
    startCount += "\xFF\xFF";
    idDeltas += "\x00\x01";
    idRangeOffsets += "\x00\x00";
  }
  const format314 = "\x00\x00" + string16(2 * segCount) + string16(searchParams.range) + string16(searchParams.entry) + string16(searchParams.rangeShift) + endCount + "\x00\x00" + startCount + idDeltas + idRangeOffsets + glyphsIds;
  let format31012 = "";
  let header31012 = "";
  if (numTables > 1) {
    cmap += "\x00\x03" + "\x00\x0A" + (0, _util.string32)(4 + numTables * 8 + 4 + format314.length);
    format31012 = "";
    for (i = 0, ii = ranges.length; i < ii; i++) {
      range = ranges[i];
      start = range[0];
      codes = range[2];
      let code = codes[0];
      for (j = 1, jj = codes.length; j < jj; ++j) {
        if (codes[j] !== codes[j - 1] + 1) {
          end = range[0] + j - 1;
          format31012 += (0, _util.string32)(start) + (0, _util.string32)(end) + (0, _util.string32)(code);
          start = end + 1;
          code = codes[j];
        }
      }
      format31012 += (0, _util.string32)(start) + (0, _util.string32)(range[1]) + (0, _util.string32)(code);
    }
    header31012 = "\x00\x0C" + "\x00\x00" + (0, _util.string32)(format31012.length + 16) + "\x00\x00\x00\x00" + (0, _util.string32)(format31012.length / 12);
  }
  return cmap + "\x00\x04" + string16(format314.length + 4) + format314 + header31012 + format31012;
}
function validateOS2Table(os2, file) {
  file.pos = (file.start || 0) + os2.offset;
  const version = file.getUint16();
  file.skip(60);
  const selection = file.getUint16();
  if (version < 4 && selection & 0x0300) {
    return false;
  }
  const firstChar = file.getUint16();
  const lastChar = file.getUint16();
  if (firstChar > lastChar) {
    return false;
  }
  file.skip(6);
  const usWinAscent = file.getUint16();
  if (usWinAscent === 0) {
    return false;
  }
  os2.data[8] = os2.data[9] = 0;
  return true;
}
function createOS2Table(properties, charstrings, override) {
  override = override || {
    unitsPerEm: 0,
    yMax: 0,
    yMin: 0,
    ascent: 0,
    descent: 0
  };
  let ulUnicodeRange1 = 0;
  let ulUnicodeRange2 = 0;
  let ulUnicodeRange3 = 0;
  let ulUnicodeRange4 = 0;
  let firstCharIndex = null;
  let lastCharIndex = 0;
  if (charstrings) {
    for (let code in charstrings) {
      code |= 0;
      if (firstCharIndex > code || !firstCharIndex) {
        firstCharIndex = code;
      }
      if (lastCharIndex < code) {
        lastCharIndex = code;
      }
      const position = (0, _unicode.getUnicodeRangeFor)(code);
      if (position < 32) {
        ulUnicodeRange1 |= 1 << position;
      } else if (position < 64) {
        ulUnicodeRange2 |= 1 << position - 32;
      } else if (position < 96) {
        ulUnicodeRange3 |= 1 << position - 64;
      } else if (position < 123) {
        ulUnicodeRange4 |= 1 << position - 96;
      } else {
        throw new _util.FormatError("Unicode ranges Bits > 123 are reserved for internal usage");
      }
    }
    if (lastCharIndex > 0xffff) {
      lastCharIndex = 0xffff;
    }
  } else {
    firstCharIndex = 0;
    lastCharIndex = 255;
  }
  const bbox = properties.bbox || [0, 0, 0, 0];
  const unitsPerEm = override.unitsPerEm || 1 / (properties.fontMatrix || _util.FONT_IDENTITY_MATRIX)[0];
  const scale = properties.ascentScaled ? 1.0 : unitsPerEm / PDF_GLYPH_SPACE_UNITS;
  const typoAscent = override.ascent || Math.round(scale * (properties.ascent || bbox[3]));
  let typoDescent = override.descent || Math.round(scale * (properties.descent || bbox[1]));
  if (typoDescent > 0 && properties.descent > 0 && bbox[1] < 0) {
    typoDescent = -typoDescent;
  }
  const winAscent = override.yMax || typoAscent;
  const winDescent = -override.yMin || -typoDescent;
  return "\x00\x03" + "\x02\x24" + "\x01\xF4" + "\x00\x05" + "\x00\x00" + "\x02\x8A" + "\x02\xBB" + "\x00\x00" + "\x00\x8C" + "\x02\x8A" + "\x02\xBB" + "\x00\x00" + "\x01\xDF" + "\x00\x31" + "\x01\x02" + "\x00\x00" + "\x00\x00\x06" + String.fromCharCode(properties.fixedPitch ? 0x09 : 0x00) + "\x00\x00\x00\x00\x00\x00" + (0, _util.string32)(ulUnicodeRange1) + (0, _util.string32)(ulUnicodeRange2) + (0, _util.string32)(ulUnicodeRange3) + (0, _util.string32)(ulUnicodeRange4) + "\x2A\x32\x31\x2A" + string16(properties.italicAngle ? 1 : 0) + string16(firstCharIndex || properties.firstChar) + string16(lastCharIndex || properties.lastChar) + string16(typoAscent) + string16(typoDescent) + "\x00\x64" + string16(winAscent) + string16(winDescent) + "\x00\x00\x00\x00" + "\x00\x00\x00\x00" + string16(properties.xHeight) + string16(properties.capHeight) + string16(0) + string16(firstCharIndex || properties.firstChar) + "\x00\x03";
}
function createPostTable(properties) {
  const angle = Math.floor(properties.italicAngle * 2 ** 16);
  return "\x00\x03\x00\x00" + (0, _util.string32)(angle) + "\x00\x00" + "\x00\x00" + (0, _util.string32)(properties.fixedPitch ? 1 : 0) + "\x00\x00\x00\x00" + "\x00\x00\x00\x00" + "\x00\x00\x00\x00" + "\x00\x00\x00\x00";
}
function createPostscriptName(name) {
  return name.replace(/[^\x21-\x7E]|[[\](){}<>/%]/g, "").slice(0, 63);
}
function createNameTable(name, proto) {
  if (!proto) {
    proto = [[], []];
  }
  const strings = [proto[0][0] || "Original licence", proto[0][1] || name, proto[0][2] || "Unknown", proto[0][3] || "uniqueID", proto[0][4] || name, proto[0][5] || "Version 0.11", proto[0][6] || createPostscriptName(name), proto[0][7] || "Unknown", proto[0][8] || "Unknown", proto[0][9] || "Unknown"];
  const stringsUnicode = [];
  let i, ii, j, jj, str;
  for (i = 0, ii = strings.length; i < ii; i++) {
    str = proto[1][i] || strings[i];
    const strBufUnicode = [];
    for (j = 0, jj = str.length; j < jj; j++) {
      strBufUnicode.push(string16(str.charCodeAt(j)));
    }
    stringsUnicode.push(strBufUnicode.join(""));
  }
  const names = [strings, stringsUnicode];
  const platforms = ["\x00\x01", "\x00\x03"];
  const encodings = ["\x00\x00", "\x00\x01"];
  const languages = ["\x00\x00", "\x04\x09"];
  const namesRecordCount = strings.length * platforms.length;
  let nameTable = "\x00\x00" + string16(namesRecordCount) + string16(namesRecordCount * 12 + 6);
  let strOffset = 0;
  for (i = 0, ii = platforms.length; i < ii; i++) {
    const strs = names[i];
    for (j = 0, jj = strs.length; j < jj; j++) {
      str = strs[j];
      const nameRecord = platforms[i] + encodings[i] + languages[i] + string16(j) + string16(str.length) + string16(strOffset);
      nameTable += nameRecord;
      strOffset += str.length;
    }
  }
  nameTable += strings.join("") + stringsUnicode.join("");
  return nameTable;
}
class Font {
  constructor(name, file, properties) {
    this.name = name;
    this.psName = null;
    this.mimetype = null;
    this.disableFontFace = false;
    this.loadedName = properties.loadedName;
    this.isType3Font = properties.isType3Font;
    this.missingFile = false;
    this.cssFontInfo = properties.cssFontInfo;
    this._charsCache = Object.create(null);
    this._glyphCache = Object.create(null);
    let isSerifFont = !!(properties.flags & _fonts_utils.FontFlags.Serif);
    if (!isSerifFont && !properties.isSimulatedFlags) {
      const baseName = name.replace(/[,_]/g, "-").split("-")[0],
        serifFonts = (0, _standard_fonts.getSerifFonts)();
      for (const namePart of baseName.split("+")) {
        if (serifFonts[namePart]) {
          isSerifFont = true;
          break;
        }
      }
    }
    this.isSerifFont = isSerifFont;
    this.isSymbolicFont = !!(properties.flags & _fonts_utils.FontFlags.Symbolic);
    this.isMonospace = !!(properties.flags & _fonts_utils.FontFlags.FixedPitch);
    let {
      type,
      subtype
    } = properties;
    this.type = type;
    this.subtype = subtype;
    const matches = name.match(/^InvalidPDFjsFont_(.*)_\d+$/);
    this.isInvalidPDFjsFont = !!matches;
    if (this.isInvalidPDFjsFont) {
      this.fallbackName = matches[1];
    } else if (this.isMonospace) {
      this.fallbackName = "monospace";
    } else if (this.isSerifFont) {
      this.fallbackName = "serif";
    } else {
      this.fallbackName = "sans-serif";
    }
    this.differences = properties.differences;
    this.widths = properties.widths;
    this.defaultWidth = properties.defaultWidth;
    this.composite = properties.composite;
    this.cMap = properties.cMap;
    this.capHeight = properties.capHeight / PDF_GLYPH_SPACE_UNITS;
    this.ascent = properties.ascent / PDF_GLYPH_SPACE_UNITS;
    this.descent = properties.descent / PDF_GLYPH_SPACE_UNITS;
    this.lineHeight = this.ascent - this.descent;
    this.fontMatrix = properties.fontMatrix;
    this.bbox = properties.bbox;
    this.defaultEncoding = properties.defaultEncoding;
    this.toUnicode = properties.toUnicode;
    this.toFontChar = [];
    if (properties.type === "Type3") {
      for (let charCode = 0; charCode < 256; charCode++) {
        this.toFontChar[charCode] = this.differences[charCode] || properties.defaultEncoding[charCode];
      }
      return;
    }
    this.cidEncoding = properties.cidEncoding || "";
    this.vertical = !!properties.vertical;
    if (this.vertical) {
      this.vmetrics = properties.vmetrics;
      this.defaultVMetrics = properties.defaultVMetrics;
    }
    if (!file || file.isEmpty) {
      if (file) {
        (0, _util.warn)('Font file is empty in "' + name + '" (' + this.loadedName + ")");
      }
      this.fallbackToSystemFont(properties);
      return;
    }
    [type, subtype] = getFontFileType(file, properties);
    if (type !== this.type || subtype !== this.subtype) {
      (0, _util.info)("Inconsistent font file Type/SubType, expected: " + `${this.type}/${this.subtype} but found: ${type}/${subtype}.`);
    }
    let data;
    try {
      switch (type) {
        case "MMType1":
          (0, _util.info)("MMType1 font (" + name + "), falling back to Type1.");
        case "Type1":
        case "CIDFontType0":
          this.mimetype = "font/opentype";
          const cff = subtype === "Type1C" || subtype === "CIDFontType0C" ? new _cff_font.CFFFont(file, properties) : new _type1_font.Type1Font(name, file, properties);
          adjustWidths(properties);
          data = this.convert(name, cff, properties);
          break;
        case "OpenType":
        case "TrueType":
        case "CIDFontType2":
          this.mimetype = "font/opentype";
          data = this.checkAndRepair(name, file, properties);
          if (this.isOpenType) {
            adjustWidths(properties);
            type = "OpenType";
          }
          break;
        default:
          throw new _util.FormatError(`Font ${type} is not supported`);
      }
    } catch (e) {
      (0, _util.warn)(e);
      this.fallbackToSystemFont(properties);
      return;
    }
    amendFallbackToUnicode(properties);
    this.data = data;
    this.type = type;
    this.subtype = subtype;
    this.fontMatrix = properties.fontMatrix;
    this.widths = properties.widths;
    this.defaultWidth = properties.defaultWidth;
    this.toUnicode = properties.toUnicode;
    this.seacMap = properties.seacMap;
  }
  get renderer() {
    const renderer = _font_renderer.FontRendererFactory.create(this, _fonts_utils.SEAC_ANALYSIS_ENABLED);
    return (0, _util.shadow)(this, "renderer", renderer);
  }
  exportData(extraProperties = false) {
    const exportDataProperties = extraProperties ? [...EXPORT_DATA_PROPERTIES, ...EXPORT_DATA_EXTRA_PROPERTIES] : EXPORT_DATA_PROPERTIES;
    const data = Object.create(null);
    let property, value;
    for (property of exportDataProperties) {
      value = this[property];
      if (value !== undefined) {
        data[property] = value;
      }
    }
    return data;
  }
  fallbackToSystemFont(properties) {
    this.missingFile = true;
    const {
      name,
      type
    } = this;
    let fontName = (0, _fonts_utils.normalizeFontName)(name);
    const stdFontMap = (0, _standard_fonts.getStdFontMap)(),
      nonStdFontMap = (0, _standard_fonts.getNonStdFontMap)();
    const isStandardFont = !!stdFontMap[fontName];
    const isMappedToStandardFont = !!(nonStdFontMap[fontName] && stdFontMap[nonStdFontMap[fontName]]);
    fontName = stdFontMap[fontName] || nonStdFontMap[fontName] || fontName;
    const fontBasicMetricsMap = (0, _metrics.getFontBasicMetrics)();
    const metrics = fontBasicMetricsMap[fontName];
    if (metrics) {
      if (isNaN(this.ascent)) {
        this.ascent = metrics.ascent / PDF_GLYPH_SPACE_UNITS;
      }
      if (isNaN(this.descent)) {
        this.descent = metrics.descent / PDF_GLYPH_SPACE_UNITS;
      }
      if (isNaN(this.capHeight)) {
        this.capHeight = metrics.capHeight / PDF_GLYPH_SPACE_UNITS;
      }
    }
    this.bold = /bold/gi.test(fontName);
    this.italic = /oblique|italic/gi.test(fontName);
    this.black = /Black/g.test(name);
    const isNarrow = /Narrow/g.test(name);
    this.remeasure = (!isStandardFont || isNarrow) && Object.keys(this.widths).length > 0;
    if ((isStandardFont || isMappedToStandardFont) && type === "CIDFontType2" && this.cidEncoding.startsWith("Identity-")) {
      const cidToGidMap = properties.cidToGidMap;
      const map = [];
      applyStandardFontGlyphMap(map, (0, _standard_fonts.getGlyphMapForStandardFonts)());
      if (/Arial-?Black/i.test(name)) {
        applyStandardFontGlyphMap(map, (0, _standard_fonts.getSupplementalGlyphMapForArialBlack)());
      } else if (/Calibri/i.test(name)) {
        applyStandardFontGlyphMap(map, (0, _standard_fonts.getSupplementalGlyphMapForCalibri)());
      }
      if (cidToGidMap) {
        for (const charCode in map) {
          const cid = map[charCode];
          if (cidToGidMap[cid] !== undefined) {
            map[+charCode] = cidToGidMap[cid];
          }
        }
        if (cidToGidMap.length !== this.toUnicode.length && properties.hasIncludedToUnicodeMap && this.toUnicode instanceof _to_unicode_map.IdentityToUnicodeMap) {
          this.toUnicode.forEach(function (charCode, unicodeCharCode) {
            const cid = map[charCode];
            if (cidToGidMap[cid] === undefined) {
              map[+charCode] = unicodeCharCode;
            }
          });
        }
      }
      if (!(this.toUnicode instanceof _to_unicode_map.IdentityToUnicodeMap)) {
        this.toUnicode.forEach(function (charCode, unicodeCharCode) {
          map[+charCode] = unicodeCharCode;
        });
      }
      this.toFontChar = map;
      this.toUnicode = new _to_unicode_map.ToUnicodeMap(map);
    } else if (/Symbol/i.test(fontName)) {
      this.toFontChar = buildToFontChar(_encodings.SymbolSetEncoding, (0, _glyphlist.getGlyphsUnicode)(), this.differences);
    } else if (/Dingbats/i.test(fontName)) {
      if (/Wingdings/i.test(name)) {
        (0, _util.warn)("Non-embedded Wingdings font, falling back to ZapfDingbats.");
      }
      this.toFontChar = buildToFontChar(_encodings.ZapfDingbatsEncoding, (0, _glyphlist.getDingbatsGlyphsUnicode)(), this.differences);
    } else if (isStandardFont) {
      const map = buildToFontChar(this.defaultEncoding, (0, _glyphlist.getGlyphsUnicode)(), this.differences);
      if (type === "CIDFontType2" && !this.cidEncoding.startsWith("Identity-") && !(this.toUnicode instanceof _to_unicode_map.IdentityToUnicodeMap)) {
        this.toUnicode.forEach(function (charCode, unicodeCharCode) {
          map[+charCode] = unicodeCharCode;
        });
      }
      this.toFontChar = map;
    } else {
      const glyphsUnicodeMap = (0, _glyphlist.getGlyphsUnicode)();
      const map = [];
      this.toUnicode.forEach((charCode, unicodeCharCode) => {
        if (!this.composite) {
          const glyphName = this.differences[charCode] || this.defaultEncoding[charCode];
          const unicode = (0, _unicode.getUnicodeForGlyph)(glyphName, glyphsUnicodeMap);
          if (unicode !== -1) {
            unicodeCharCode = unicode;
          }
        }
        map[+charCode] = unicodeCharCode;
      });
      if (this.composite && this.toUnicode instanceof _to_unicode_map.IdentityToUnicodeMap) {
        if (/Tahoma|Verdana/i.test(name)) {
          applyStandardFontGlyphMap(map, (0, _standard_fonts.getGlyphMapForStandardFonts)());
        }
      }
      this.toFontChar = map;
    }
    amendFallbackToUnicode(properties);
    this.loadedName = fontName.split("-")[0];
  }
  checkAndRepair(name, font, properties) {
    const VALID_TABLES = ["OS/2", "cmap", "head", "hhea", "hmtx", "maxp", "name", "post", "loca", "glyf", "fpgm", "prep", "cvt ", "CFF "];
    function readTables(file, numTables) {
      const tables = Object.create(null);
      tables["OS/2"] = null;
      tables.cmap = null;
      tables.head = null;
      tables.hhea = null;
      tables.hmtx = null;
      tables.maxp = null;
      tables.name = null;
      tables.post = null;
      for (let i = 0; i < numTables; i++) {
        const table = readTableEntry(file);
        if (!VALID_TABLES.includes(table.tag)) {
          continue;
        }
        if (table.length === 0) {
          continue;
        }
        tables[table.tag] = table;
      }
      return tables;
    }
    function readTableEntry(file) {
      const tag = file.getString(4);
      const checksum = file.getInt32() >>> 0;
      const offset = file.getInt32() >>> 0;
      const length = file.getInt32() >>> 0;
      const previousPosition = file.pos;
      file.pos = file.start || 0;
      file.skip(offset);
      const data = file.getBytes(length);
      file.pos = previousPosition;
      if (tag === "head") {
        data[8] = data[9] = data[10] = data[11] = 0;
        data[17] |= 0x20;
      }
      return {
        tag,
        checksum,
        length,
        offset,
        data
      };
    }
    function readOpenTypeHeader(ttf) {
      return {
        version: ttf.getString(4),
        numTables: ttf.getUint16(),
        searchRange: ttf.getUint16(),
        entrySelector: ttf.getUint16(),
        rangeShift: ttf.getUint16()
      };
    }
    function readTrueTypeCollectionHeader(ttc) {
      const ttcTag = ttc.getString(4);
      (0, _util.assert)(ttcTag === "ttcf", "Must be a TrueType Collection font.");
      const majorVersion = ttc.getUint16();
      const minorVersion = ttc.getUint16();
      const numFonts = ttc.getInt32() >>> 0;
      const offsetTable = [];
      for (let i = 0; i < numFonts; i++) {
        offsetTable.push(ttc.getInt32() >>> 0);
      }
      const header = {
        ttcTag,
        majorVersion,
        minorVersion,
        numFonts,
        offsetTable
      };
      switch (majorVersion) {
        case 1:
          return header;
        case 2:
          header.dsigTag = ttc.getInt32() >>> 0;
          header.dsigLength = ttc.getInt32() >>> 0;
          header.dsigOffset = ttc.getInt32() >>> 0;
          return header;
      }
      throw new _util.FormatError(`Invalid TrueType Collection majorVersion: ${majorVersion}.`);
    }
    function readTrueTypeCollectionData(ttc, fontName) {
      const {
        numFonts,
        offsetTable
      } = readTrueTypeCollectionHeader(ttc);
      const fontNameParts = fontName.split("+");
      let fallbackData;
      for (let i = 0; i < numFonts; i++) {
        ttc.pos = (ttc.start || 0) + offsetTable[i];
        const potentialHeader = readOpenTypeHeader(ttc);
        const potentialTables = readTables(ttc, potentialHeader.numTables);
        if (!potentialTables.name) {
          throw new _util.FormatError('TrueType Collection font must contain a "name" table.');
        }
        const [nameTable] = readNameTable(potentialTables.name);
        for (let j = 0, jj = nameTable.length; j < jj; j++) {
          for (let k = 0, kk = nameTable[j].length; k < kk; k++) {
            const nameEntry = nameTable[j][k] && nameTable[j][k].replace(/\s/g, "");
            if (!nameEntry) {
              continue;
            }
            if (nameEntry === fontName) {
              return {
                header: potentialHeader,
                tables: potentialTables
              };
            }
            if (fontNameParts.length < 2) {
              continue;
            }
            for (const part of fontNameParts) {
              if (nameEntry === part) {
                fallbackData = {
                  name: part,
                  header: potentialHeader,
                  tables: potentialTables
                };
              }
            }
          }
        }
      }
      if (fallbackData) {
        (0, _util.warn)(`TrueType Collection does not contain "${fontName}" font, ` + `falling back to "${fallbackData.name}" font instead.`);
        return {
          header: fallbackData.header,
          tables: fallbackData.tables
        };
      }
      throw new _util.FormatError(`TrueType Collection does not contain "${fontName}" font.`);
    }
    function readCmapTable(cmap, file, isSymbolicFont, hasEncoding) {
      if (!cmap) {
        (0, _util.warn)("No cmap table available.");
        return {
          platformId: -1,
          encodingId: -1,
          mappings: [],
          hasShortCmap: false
        };
      }
      let segment;
      let start = (file.start || 0) + cmap.offset;
      file.pos = start;
      file.skip(2);
      const numTables = file.getUint16();
      let potentialTable;
      let canBreak = false;
      for (let i = 0; i < numTables; i++) {
        const platformId = file.getUint16();
        const encodingId = file.getUint16();
        const offset = file.getInt32() >>> 0;
        let useTable = false;
        if (potentialTable && potentialTable.platformId === platformId && potentialTable.encodingId === encodingId) {
          continue;
        }
        if (platformId === 0 && (encodingId === 0 || encodingId === 1 || encodingId === 3)) {
          useTable = true;
        } else if (platformId === 1 && encodingId === 0) {
          useTable = true;
        } else if (platformId === 3 && encodingId === 1 && (hasEncoding || !potentialTable)) {
          useTable = true;
          if (!isSymbolicFont) {
            canBreak = true;
          }
        } else if (isSymbolicFont && platformId === 3 && encodingId === 0) {
          useTable = true;
          let correctlySorted = true;
          if (i < numTables - 1) {
            const nextBytes = file.peekBytes(2),
              nextPlatformId = int16(nextBytes[0], nextBytes[1]);
            if (nextPlatformId < platformId) {
              correctlySorted = false;
            }
          }
          if (correctlySorted) {
            canBreak = true;
          }
        }
        if (useTable) {
          potentialTable = {
            platformId,
            encodingId,
            offset
          };
        }
        if (canBreak) {
          break;
        }
      }
      if (potentialTable) {
        file.pos = start + potentialTable.offset;
      }
      if (!potentialTable || file.peekByte() === -1) {
        (0, _util.warn)("Could not find a preferred cmap table.");
        return {
          platformId: -1,
          encodingId: -1,
          mappings: [],
          hasShortCmap: false
        };
      }
      const format = file.getUint16();
      let hasShortCmap = false;
      const mappings = [];
      let j, glyphId;
      if (format === 0) {
        file.skip(2 + 2);
        for (j = 0; j < 256; j++) {
          const index = file.getByte();
          if (!index) {
            continue;
          }
          mappings.push({
            charCode: j,
            glyphId: index
          });
        }
        hasShortCmap = true;
      } else if (format === 2) {
        file.skip(2 + 2);
        const subHeaderKeys = [];
        let maxSubHeaderKey = 0;
        for (let i = 0; i < 256; i++) {
          const subHeaderKey = file.getUint16() >> 3;
          subHeaderKeys.push(subHeaderKey);
          maxSubHeaderKey = Math.max(subHeaderKey, maxSubHeaderKey);
        }
        const subHeaders = [];
        for (let i = 0; i <= maxSubHeaderKey; i++) {
          subHeaders.push({
            firstCode: file.getUint16(),
            entryCount: file.getUint16(),
            idDelta: signedInt16(file.getByte(), file.getByte()),
            idRangePos: file.pos + file.getUint16()
          });
        }
        for (let i = 0; i < 256; i++) {
          if (subHeaderKeys[i] === 0) {
            file.pos = subHeaders[0].idRangePos + 2 * i;
            glyphId = file.getUint16();
            mappings.push({
              charCode: i,
              glyphId
            });
          } else {
            const s = subHeaders[subHeaderKeys[i]];
            for (j = 0; j < s.entryCount; j++) {
              const charCode = (i << 8) + j + s.firstCode;
              file.pos = s.idRangePos + 2 * j;
              glyphId = file.getUint16();
              if (glyphId !== 0) {
                glyphId = (glyphId + s.idDelta) % 65536;
              }
              mappings.push({
                charCode,
                glyphId
              });
            }
          }
        }
      } else if (format === 4) {
        file.skip(2 + 2);
        const segCount = file.getUint16() >> 1;
        file.skip(6);
        const segments = [];
        let segIndex;
        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segments.push({
            end: file.getUint16()
          });
        }
        file.skip(2);
        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segments[segIndex].start = file.getUint16();
        }
        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segments[segIndex].delta = file.getUint16();
        }
        let offsetsCount = 0,
          offsetIndex;
        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segment = segments[segIndex];
          const rangeOffset = file.getUint16();
          if (!rangeOffset) {
            segment.offsetIndex = -1;
            continue;
          }
          offsetIndex = (rangeOffset >> 1) - (segCount - segIndex);
          segment.offsetIndex = offsetIndex;
          offsetsCount = Math.max(offsetsCount, offsetIndex + segment.end - segment.start + 1);
        }
        const offsets = [];
        for (j = 0; j < offsetsCount; j++) {
          offsets.push(file.getUint16());
        }
        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segment = segments[segIndex];
          start = segment.start;
          const end = segment.end;
          const delta = segment.delta;
          offsetIndex = segment.offsetIndex;
          for (j = start; j <= end; j++) {
            if (j === 0xffff) {
              continue;
            }
            glyphId = offsetIndex < 0 ? j : offsets[offsetIndex + j - start];
            glyphId = glyphId + delta & 0xffff;
            mappings.push({
              charCode: j,
              glyphId
            });
          }
        }
      } else if (format === 6) {
        file.skip(2 + 2);
        const firstCode = file.getUint16();
        const entryCount = file.getUint16();
        for (j = 0; j < entryCount; j++) {
          glyphId = file.getUint16();
          const charCode = firstCode + j;
          mappings.push({
            charCode,
            glyphId
          });
        }
      } else if (format === 12) {
        file.skip(2 + 4 + 4);
        const nGroups = file.getInt32() >>> 0;
        for (j = 0; j < nGroups; j++) {
          const startCharCode = file.getInt32() >>> 0;
          const endCharCode = file.getInt32() >>> 0;
          let glyphCode = file.getInt32() >>> 0;
          for (let charCode = startCharCode; charCode <= endCharCode; charCode++) {
            mappings.push({
              charCode,
              glyphId: glyphCode++
            });
          }
        }
      } else {
        (0, _util.warn)("cmap table has unsupported format: " + format);
        return {
          platformId: -1,
          encodingId: -1,
          mappings: [],
          hasShortCmap: false
        };
      }
      mappings.sort(function (a, b) {
        return a.charCode - b.charCode;
      });
      for (let i = 1; i < mappings.length; i++) {
        if (mappings[i - 1].charCode === mappings[i].charCode) {
          mappings.splice(i, 1);
          i--;
        }
      }
      return {
        platformId: potentialTable.platformId,
        encodingId: potentialTable.encodingId,
        mappings,
        hasShortCmap
      };
    }
    function sanitizeMetrics(file, header, metrics, headTable, numGlyphs, dupFirstEntry) {
      if (!header) {
        if (metrics) {
          metrics.data = null;
        }
        return;
      }
      file.pos = (file.start || 0) + header.offset;
      file.pos += 4;
      file.pos += 2;
      file.pos += 2;
      file.pos += 2;
      file.pos += 2;
      file.pos += 2;
      file.pos += 2;
      file.pos += 2;
      file.pos += 2;
      file.pos += 2;
      const caretOffset = file.getUint16();
      file.pos += 8;
      file.pos += 2;
      let numOfMetrics = file.getUint16();
      if (caretOffset !== 0) {
        const macStyle = int16(headTable.data[44], headTable.data[45]);
        if (!(macStyle & 2)) {
          header.data[22] = 0;
          header.data[23] = 0;
        }
      }
      if (numOfMetrics > numGlyphs) {
        (0, _util.info)(`The numOfMetrics (${numOfMetrics}) should not be ` + `greater than the numGlyphs (${numGlyphs}).`);
        numOfMetrics = numGlyphs;
        header.data[34] = (numOfMetrics & 0xff00) >> 8;
        header.data[35] = numOfMetrics & 0x00ff;
      }
      const numOfSidebearings = numGlyphs - numOfMetrics;
      const numMissing = numOfSidebearings - (metrics.length - numOfMetrics * 4 >> 1);
      if (numMissing > 0) {
        const entries = new Uint8Array(metrics.length + numMissing * 2);
        entries.set(metrics.data);
        if (dupFirstEntry) {
          entries[metrics.length] = metrics.data[2];
          entries[metrics.length + 1] = metrics.data[3];
        }
        metrics.data = entries;
      }
    }
    function sanitizeGlyph(source, sourceStart, sourceEnd, dest, destStart, hintsValid) {
      const glyphProfile = {
        length: 0,
        sizeOfInstructions: 0
      };
      if (sourceEnd - sourceStart <= 12) {
        return glyphProfile;
      }
      const glyf = source.subarray(sourceStart, sourceEnd);
      let contoursCount = signedInt16(glyf[0], glyf[1]);
      if (contoursCount < 0) {
        contoursCount = -1;
        writeSignedInt16(glyf, 0, contoursCount);
        dest.set(glyf, destStart);
        glyphProfile.length = glyf.length;
        return glyphProfile;
      }
      let i,
        j = 10,
        flagsCount = 0;
      for (i = 0; i < contoursCount; i++) {
        const endPoint = glyf[j] << 8 | glyf[j + 1];
        flagsCount = endPoint + 1;
        j += 2;
      }
      const instructionsStart = j;
      const instructionsLength = glyf[j] << 8 | glyf[j + 1];
      glyphProfile.sizeOfInstructions = instructionsLength;
      j += 2 + instructionsLength;
      const instructionsEnd = j;
      let coordinatesLength = 0;
      for (i = 0; i < flagsCount; i++) {
        const flag = glyf[j++];
        if (flag & 0xc0) {
          glyf[j - 1] = flag & 0x3f;
        }
        let xLength = 2;
        if (flag & 2) {
          xLength = 1;
        } else if (flag & 16) {
          xLength = 0;
        }
        let yLength = 2;
        if (flag & 4) {
          yLength = 1;
        } else if (flag & 32) {
          yLength = 0;
        }
        const xyLength = xLength + yLength;
        coordinatesLength += xyLength;
        if (flag & 8) {
          const repeat = glyf[j++];
          i += repeat;
          coordinatesLength += repeat * xyLength;
        }
      }
      if (coordinatesLength === 0) {
        return glyphProfile;
      }
      let glyphDataLength = j + coordinatesLength;
      if (glyphDataLength > glyf.length) {
        return glyphProfile;
      }
      if (!hintsValid && instructionsLength > 0) {
        dest.set(glyf.subarray(0, instructionsStart), destStart);
        dest.set([0, 0], destStart + instructionsStart);
        dest.set(glyf.subarray(instructionsEnd, glyphDataLength), destStart + instructionsStart + 2);
        glyphDataLength -= instructionsLength;
        if (glyf.length - glyphDataLength > 3) {
          glyphDataLength = glyphDataLength + 3 & ~3;
        }
        glyphProfile.length = glyphDataLength;
        return glyphProfile;
      }
      if (glyf.length - glyphDataLength > 3) {
        glyphDataLength = glyphDataLength + 3 & ~3;
        dest.set(glyf.subarray(0, glyphDataLength), destStart);
        glyphProfile.length = glyphDataLength;
        return glyphProfile;
      }
      dest.set(glyf, destStart);
      glyphProfile.length = glyf.length;
      return glyphProfile;
    }
    function sanitizeHead(head, numGlyphs, locaLength) {
      const data = head.data;
      const version = int32(data[0], data[1], data[2], data[3]);
      if (version >> 16 !== 1) {
        (0, _util.info)("Attempting to fix invalid version in head table: " + version);
        data[0] = 0;
        data[1] = 1;
        data[2] = 0;
        data[3] = 0;
      }
      const indexToLocFormat = int16(data[50], data[51]);
      if (indexToLocFormat < 0 || indexToLocFormat > 1) {
        (0, _util.info)("Attempting to fix invalid indexToLocFormat in head table: " + indexToLocFormat);
        const numGlyphsPlusOne = numGlyphs + 1;
        if (locaLength === numGlyphsPlusOne << 1) {
          data[50] = 0;
          data[51] = 0;
        } else if (locaLength === numGlyphsPlusOne << 2) {
          data[50] = 0;
          data[51] = 1;
        } else {
          throw new _util.FormatError("Could not fix indexToLocFormat: " + indexToLocFormat);
        }
      }
    }
    function sanitizeGlyphLocations(loca, glyf, numGlyphs, isGlyphLocationsLong, hintsValid, dupFirstEntry, maxSizeOfInstructions) {
      let itemSize, itemDecode, itemEncode;
      if (isGlyphLocationsLong) {
        itemSize = 4;
        itemDecode = function fontItemDecodeLong(data, offset) {
          return data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3];
        };
        itemEncode = function fontItemEncodeLong(data, offset, value) {
          data[offset] = value >>> 24 & 0xff;
          data[offset + 1] = value >> 16 & 0xff;
          data[offset + 2] = value >> 8 & 0xff;
          data[offset + 3] = value & 0xff;
        };
      } else {
        itemSize = 2;
        itemDecode = function fontItemDecode(data, offset) {
          return data[offset] << 9 | data[offset + 1] << 1;
        };
        itemEncode = function fontItemEncode(data, offset, value) {
          data[offset] = value >> 9 & 0xff;
          data[offset + 1] = value >> 1 & 0xff;
        };
      }
      const numGlyphsOut = dupFirstEntry ? numGlyphs + 1 : numGlyphs;
      const locaDataSize = itemSize * (1 + numGlyphsOut);
      const locaData = new Uint8Array(locaDataSize);
      locaData.set(loca.data.subarray(0, locaDataSize));
      loca.data = locaData;
      const oldGlyfData = glyf.data;
      const oldGlyfDataLength = oldGlyfData.length;
      const newGlyfData = new Uint8Array(oldGlyfDataLength);
      let i, j;
      const locaEntries = [];
      for (i = 0, j = 0; i < numGlyphs + 1; i++, j += itemSize) {
        let offset = itemDecode(locaData, j);
        if (offset > oldGlyfDataLength) {
          offset = oldGlyfDataLength;
        }
        locaEntries.push({
          index: i,
          offset,
          endOffset: 0
        });
      }
      locaEntries.sort((a, b) => {
        return a.offset - b.offset;
      });
      for (i = 0; i < numGlyphs; i++) {
        locaEntries[i].endOffset = locaEntries[i + 1].offset;
      }
      locaEntries.sort((a, b) => {
        return a.index - b.index;
      });
      for (i = 0; i < numGlyphs; i++) {
        const {
          offset,
          endOffset
        } = locaEntries[i];
        if (offset !== 0 || endOffset !== 0) {
          break;
        }
        const nextOffset = locaEntries[i + 1].offset;
        if (nextOffset === 0) {
          continue;
        }
        locaEntries[i].endOffset = nextOffset;
        break;
      }
      const missingGlyphs = Object.create(null);
      let writeOffset = 0;
      itemEncode(locaData, 0, writeOffset);
      for (i = 0, j = itemSize; i < numGlyphs; i++, j += itemSize) {
        const glyphProfile = sanitizeGlyph(oldGlyfData, locaEntries[i].offset, locaEntries[i].endOffset, newGlyfData, writeOffset, hintsValid);
        const newLength = glyphProfile.length;
        if (newLength === 0) {
          missingGlyphs[i] = true;
        }
        if (glyphProfile.sizeOfInstructions > maxSizeOfInstructions) {
          maxSizeOfInstructions = glyphProfile.sizeOfInstructions;
        }
        writeOffset += newLength;
        itemEncode(locaData, j, writeOffset);
      }
      if (writeOffset === 0) {
        const simpleGlyph = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 49, 0]);
        for (i = 0, j = itemSize; i < numGlyphsOut; i++, j += itemSize) {
          itemEncode(locaData, j, simpleGlyph.length);
        }
        glyf.data = simpleGlyph;
      } else if (dupFirstEntry) {
        const firstEntryLength = itemDecode(locaData, itemSize);
        if (newGlyfData.length > firstEntryLength + writeOffset) {
          glyf.data = newGlyfData.subarray(0, firstEntryLength + writeOffset);
        } else {
          glyf.data = new Uint8Array(firstEntryLength + writeOffset);
          glyf.data.set(newGlyfData.subarray(0, writeOffset));
        }
        glyf.data.set(newGlyfData.subarray(0, firstEntryLength), writeOffset);
        itemEncode(loca.data, locaData.length - itemSize, writeOffset + firstEntryLength);
      } else {
        glyf.data = newGlyfData.subarray(0, writeOffset);
      }
      return {
        missingGlyphs,
        maxSizeOfInstructions
      };
    }
    function readPostScriptTable(post, propertiesObj, maxpNumGlyphs) {
      const start = (font.start || 0) + post.offset;
      font.pos = start;
      const length = post.length,
        end = start + length;
      const version = font.getInt32();
      font.skip(28);
      let glyphNames;
      let valid = true;
      let i;
      switch (version) {
        case 0x00010000:
          glyphNames = _fonts_utils.MacStandardGlyphOrdering;
          break;
        case 0x00020000:
          const numGlyphs = font.getUint16();
          if (numGlyphs !== maxpNumGlyphs) {
            valid = false;
            break;
          }
          const glyphNameIndexes = [];
          for (i = 0; i < numGlyphs; ++i) {
            const index = font.getUint16();
            if (index >= 32768) {
              valid = false;
              break;
            }
            glyphNameIndexes.push(index);
          }
          if (!valid) {
            break;
          }
          const customNames = [],
            strBuf = [];
          while (font.pos < end) {
            const stringLength = font.getByte();
            strBuf.length = stringLength;
            for (i = 0; i < stringLength; ++i) {
              strBuf[i] = String.fromCharCode(font.getByte());
            }
            customNames.push(strBuf.join(""));
          }
          glyphNames = [];
          for (i = 0; i < numGlyphs; ++i) {
            const j = glyphNameIndexes[i];
            if (j < 258) {
              glyphNames.push(_fonts_utils.MacStandardGlyphOrdering[j]);
              continue;
            }
            glyphNames.push(customNames[j - 258]);
          }
          break;
        case 0x00030000:
          break;
        default:
          (0, _util.warn)("Unknown/unsupported post table version " + version);
          valid = false;
          if (propertiesObj.defaultEncoding) {
            glyphNames = propertiesObj.defaultEncoding;
          }
          break;
      }
      propertiesObj.glyphNames = glyphNames;
      return valid;
    }
    function readNameTable(nameTable) {
      const start = (font.start || 0) + nameTable.offset;
      font.pos = start;
      const names = [[], []],
        records = [];
      const length = nameTable.length,
        end = start + length;
      const format = font.getUint16();
      const FORMAT_0_HEADER_LENGTH = 6;
      if (format !== 0 || length < FORMAT_0_HEADER_LENGTH) {
        return [names, records];
      }
      const numRecords = font.getUint16();
      const stringsStart = font.getUint16();
      const NAME_RECORD_LENGTH = 12;
      let i, ii;
      for (i = 0; i < numRecords && font.pos + NAME_RECORD_LENGTH <= end; i++) {
        const r = {
          platform: font.getUint16(),
          encoding: font.getUint16(),
          language: font.getUint16(),
          name: font.getUint16(),
          length: font.getUint16(),
          offset: font.getUint16()
        };
        if (isMacNameRecord(r) || isWinNameRecord(r)) {
          records.push(r);
        }
      }
      for (i = 0, ii = records.length; i < ii; i++) {
        const record = records[i];
        if (record.length <= 0) {
          continue;
        }
        const pos = start + stringsStart + record.offset;
        if (pos + record.length > end) {
          continue;
        }
        font.pos = pos;
        const nameIndex = record.name;
        if (record.encoding) {
          let str = "";
          for (let j = 0, jj = record.length; j < jj; j += 2) {
            str += String.fromCharCode(font.getUint16());
          }
          names[1][nameIndex] = str;
        } else {
          names[0][nameIndex] = font.getString(record.length);
        }
      }
      return [names, records];
    }
    const TTOpsStackDeltas = [0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -2, -2, 0, 0, -2, -5, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, 0, -1, -1, -1, -1, 1, -1, -999, 0, 1, 0, -1, -2, 0, -1, -2, -1, -1, 0, -1, -1, 0, 0, -999, -999, -1, -1, -1, -1, -2, -999, -2, -2, -999, 0, -2, -2, 0, 0, -2, 0, -2, 0, 0, 0, -2, -1, -1, 1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, 0, -1, -1, 0, -999, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -999, -999, -999, -999, -999, -1, -1, -2, -2, 0, 0, 0, 0, -1, -1, -999, -2, -2, 0, 0, -1, -2, -2, 0, 0, 0, -1, -1, -1, -2];
    function sanitizeTTProgram(table, ttContext) {
      let data = table.data;
      let i = 0,
        j,
        n,
        b,
        funcId,
        pc,
        lastEndf = 0,
        lastDeff = 0;
      const stack = [];
      const callstack = [];
      const functionsCalled = [];
      let tooComplexToFollowFunctions = ttContext.tooComplexToFollowFunctions;
      let inFDEF = false,
        ifLevel = 0,
        inELSE = 0;
      for (let ii = data.length; i < ii;) {
        const op = data[i++];
        if (op === 0x40) {
          n = data[i++];
          if (inFDEF || inELSE) {
            i += n;
          } else {
            for (j = 0; j < n; j++) {
              stack.push(data[i++]);
            }
          }
        } else if (op === 0x41) {
          n = data[i++];
          if (inFDEF || inELSE) {
            i += n * 2;
          } else {
            for (j = 0; j < n; j++) {
              b = data[i++];
              stack.push(b << 8 | data[i++]);
            }
          }
        } else if ((op & 0xf8) === 0xb0) {
          n = op - 0xb0 + 1;
          if (inFDEF || inELSE) {
            i += n;
          } else {
            for (j = 0; j < n; j++) {
              stack.push(data[i++]);
            }
          }
        } else if ((op & 0xf8) === 0xb8) {
          n = op - 0xb8 + 1;
          if (inFDEF || inELSE) {
            i += n * 2;
          } else {
            for (j = 0; j < n; j++) {
              b = data[i++];
              stack.push(b << 8 | data[i++]);
            }
          }
        } else if (op === 0x2b && !tooComplexToFollowFunctions) {
          if (!inFDEF && !inELSE) {
            funcId = stack.at(-1);
            if (isNaN(funcId)) {
              (0, _util.info)("TT: CALL empty stack (or invalid entry).");
            } else {
              ttContext.functionsUsed[funcId] = true;
              if (funcId in ttContext.functionsStackDeltas) {
                const newStackLength = stack.length + ttContext.functionsStackDeltas[funcId];
                if (newStackLength < 0) {
                  (0, _util.warn)("TT: CALL invalid functions stack delta.");
                  ttContext.hintsValid = false;
                  return;
                }
                stack.length = newStackLength;
              } else if (funcId in ttContext.functionsDefined && !functionsCalled.includes(funcId)) {
                callstack.push({
                  data,
                  i,
                  stackTop: stack.length - 1
                });
                functionsCalled.push(funcId);
                pc = ttContext.functionsDefined[funcId];
                if (!pc) {
                  (0, _util.warn)("TT: CALL non-existent function");
                  ttContext.hintsValid = false;
                  return;
                }
                data = pc.data;
                i = pc.i;
              }
            }
          }
        } else if (op === 0x2c && !tooComplexToFollowFunctions) {
          if (inFDEF || inELSE) {
            (0, _util.warn)("TT: nested FDEFs not allowed");
            tooComplexToFollowFunctions = true;
          }
          inFDEF = true;
          lastDeff = i;
          funcId = stack.pop();
          ttContext.functionsDefined[funcId] = {
            data,
            i
          };
        } else if (op === 0x2d) {
          if (inFDEF) {
            inFDEF = false;
            lastEndf = i;
          } else {
            pc = callstack.pop();
            if (!pc) {
              (0, _util.warn)("TT: ENDF bad stack");
              ttContext.hintsValid = false;
              return;
            }
            funcId = functionsCalled.pop();
            data = pc.data;
            i = pc.i;
            ttContext.functionsStackDeltas[funcId] = stack.length - pc.stackTop;
          }
        } else if (op === 0x89) {
          if (inFDEF || inELSE) {
            (0, _util.warn)("TT: nested IDEFs not allowed");
            tooComplexToFollowFunctions = true;
          }
          inFDEF = true;
          lastDeff = i;
        } else if (op === 0x58) {
          ++ifLevel;
        } else if (op === 0x1b) {
          inELSE = ifLevel;
        } else if (op === 0x59) {
          if (inELSE === ifLevel) {
            inELSE = 0;
          }
          --ifLevel;
        } else if (op === 0x1c) {
          if (!inFDEF && !inELSE) {
            const offset = stack.at(-1);
            if (offset > 0) {
              i += offset - 1;
            }
          }
        }
        if (!inFDEF && !inELSE) {
          let stackDelta = 0;
          if (op <= 0x8e) {
            stackDelta = TTOpsStackDeltas[op];
          } else if (op >= 0xc0 && op <= 0xdf) {
            stackDelta = -1;
          } else if (op >= 0xe0) {
            stackDelta = -2;
          }
          if (op >= 0x71 && op <= 0x75) {
            n = stack.pop();
            if (!isNaN(n)) {
              stackDelta = -n * 2;
            }
          }
          while (stackDelta < 0 && stack.length > 0) {
            stack.pop();
            stackDelta++;
          }
          while (stackDelta > 0) {
            stack.push(NaN);
            stackDelta--;
          }
        }
      }
      ttContext.tooComplexToFollowFunctions = tooComplexToFollowFunctions;
      const content = [data];
      if (i > data.length) {
        content.push(new Uint8Array(i - data.length));
      }
      if (lastDeff > lastEndf) {
        (0, _util.warn)("TT: complementing a missing function tail");
        content.push(new Uint8Array([0x22, 0x2d]));
      }
      foldTTTable(table, content);
    }
    function checkInvalidFunctions(ttContext, maxFunctionDefs) {
      if (ttContext.tooComplexToFollowFunctions) {
        return;
      }
      if (ttContext.functionsDefined.length > maxFunctionDefs) {
        (0, _util.warn)("TT: more functions defined than expected");
        ttContext.hintsValid = false;
        return;
      }
      for (let j = 0, jj = ttContext.functionsUsed.length; j < jj; j++) {
        if (j > maxFunctionDefs) {
          (0, _util.warn)("TT: invalid function id: " + j);
          ttContext.hintsValid = false;
          return;
        }
        if (ttContext.functionsUsed[j] && !ttContext.functionsDefined[j]) {
          (0, _util.warn)("TT: undefined function: " + j);
          ttContext.hintsValid = false;
          return;
        }
      }
    }
    function foldTTTable(table, content) {
      if (content.length > 1) {
        let newLength = 0;
        let j, jj;
        for (j = 0, jj = content.length; j < jj; j++) {
          newLength += content[j].length;
        }
        newLength = newLength + 3 & ~3;
        const result = new Uint8Array(newLength);
        let pos = 0;
        for (j = 0, jj = content.length; j < jj; j++) {
          result.set(content[j], pos);
          pos += content[j].length;
        }
        table.data = result;
        table.length = newLength;
      }
    }
    function sanitizeTTPrograms(fpgm, prep, cvt, maxFunctionDefs) {
      const ttContext = {
        functionsDefined: [],
        functionsUsed: [],
        functionsStackDeltas: [],
        tooComplexToFollowFunctions: false,
        hintsValid: true
      };
      if (fpgm) {
        sanitizeTTProgram(fpgm, ttContext);
      }
      if (prep) {
        sanitizeTTProgram(prep, ttContext);
      }
      if (fpgm) {
        checkInvalidFunctions(ttContext, maxFunctionDefs);
      }
      if (cvt && cvt.length & 1) {
        const cvtData = new Uint8Array(cvt.length + 1);
        cvtData.set(cvt.data);
        cvt.data = cvtData;
      }
      return ttContext.hintsValid;
    }
    font = new _stream.Stream(new Uint8Array(font.getBytes()));
    let header, tables;
    if (isTrueTypeCollectionFile(font)) {
      const ttcData = readTrueTypeCollectionData(font, this.name);
      header = ttcData.header;
      tables = ttcData.tables;
    } else {
      header = readOpenTypeHeader(font);
      tables = readTables(font, header.numTables);
    }
    let cff, cffFile;
    const isTrueType = !tables["CFF "];
    if (!isTrueType) {
      const isComposite = properties.composite && ((properties.cidToGidMap || []).length > 0 || !(properties.cMap instanceof _cmap.IdentityCMap));
      if (header.version === "OTTO" && !isComposite || !tables.head || !tables.hhea || !tables.maxp || !tables.post) {
        cffFile = new _stream.Stream(tables["CFF "].data);
        cff = new _cff_font.CFFFont(cffFile, properties);
        adjustWidths(properties);
        return this.convert(name, cff, properties);
      }
      delete tables.glyf;
      delete tables.loca;
      delete tables.fpgm;
      delete tables.prep;
      delete tables["cvt "];
      this.isOpenType = true;
    } else {
      if (!tables.loca) {
        throw new _util.FormatError('Required "loca" table is not found');
      }
      if (!tables.glyf) {
        (0, _util.warn)('Required "glyf" table is not found -- trying to recover.');
        tables.glyf = {
          tag: "glyf",
          data: new Uint8Array(0)
        };
      }
      this.isOpenType = false;
    }
    if (!tables.maxp) {
      throw new _util.FormatError('Required "maxp" table is not found');
    }
    font.pos = (font.start || 0) + tables.maxp.offset;
    const version = font.getInt32();
    const numGlyphs = font.getUint16();
    if (properties.scaleFactors && properties.scaleFactors.length === numGlyphs && isTrueType) {
      const {
        scaleFactors
      } = properties;
      const isGlyphLocationsLong = int16(tables.head.data[50], tables.head.data[51]);
      const glyphs = new _glyf.GlyfTable({
        glyfTable: tables.glyf.data,
        isGlyphLocationsLong,
        locaTable: tables.loca.data,
        numGlyphs
      });
      glyphs.scale(scaleFactors);
      const {
        glyf,
        loca,
        isLocationLong
      } = glyphs.write();
      tables.glyf.data = glyf;
      tables.loca.data = loca;
      if (isLocationLong !== !!isGlyphLocationsLong) {
        tables.head.data[50] = 0;
        tables.head.data[51] = isLocationLong ? 1 : 0;
      }
      const metrics = tables.hmtx.data;
      for (let i = 0; i < numGlyphs; i++) {
        const j = 4 * i;
        const advanceWidth = Math.round(scaleFactors[i] * int16(metrics[j], metrics[j + 1]));
        metrics[j] = advanceWidth >> 8 & 0xff;
        metrics[j + 1] = advanceWidth & 0xff;
        const lsb = Math.round(scaleFactors[i] * signedInt16(metrics[j + 2], metrics[j + 3]));
        writeSignedInt16(metrics, j + 2, lsb);
      }
    }
    let numGlyphsOut = numGlyphs + 1;
    let dupFirstEntry = true;
    if (numGlyphsOut > 0xffff) {
      dupFirstEntry = false;
      numGlyphsOut = numGlyphs;
      (0, _util.warn)("Not enough space in glyfs to duplicate first glyph.");
    }
    let maxFunctionDefs = 0;
    let maxSizeOfInstructions = 0;
    if (version >= 0x00010000 && tables.maxp.length >= 22) {
      font.pos += 8;
      const maxZones = font.getUint16();
      if (maxZones > 2) {
        tables.maxp.data[14] = 0;
        tables.maxp.data[15] = 2;
      }
      font.pos += 4;
      maxFunctionDefs = font.getUint16();
      font.pos += 4;
      maxSizeOfInstructions = font.getUint16();
    }
    tables.maxp.data[4] = numGlyphsOut >> 8;
    tables.maxp.data[5] = numGlyphsOut & 255;
    const hintsValid = sanitizeTTPrograms(tables.fpgm, tables.prep, tables["cvt "], maxFunctionDefs);
    if (!hintsValid) {
      delete tables.fpgm;
      delete tables.prep;
      delete tables["cvt "];
    }
    sanitizeMetrics(font, tables.hhea, tables.hmtx, tables.head, numGlyphsOut, dupFirstEntry);
    if (!tables.head) {
      throw new _util.FormatError('Required "head" table is not found');
    }
    sanitizeHead(tables.head, numGlyphs, isTrueType ? tables.loca.length : 0);
    let missingGlyphs = Object.create(null);
    if (isTrueType) {
      const isGlyphLocationsLong = int16(tables.head.data[50], tables.head.data[51]);
      const glyphsInfo = sanitizeGlyphLocations(tables.loca, tables.glyf, numGlyphs, isGlyphLocationsLong, hintsValid, dupFirstEntry, maxSizeOfInstructions);
      missingGlyphs = glyphsInfo.missingGlyphs;
      if (version >= 0x00010000 && tables.maxp.length >= 22) {
        tables.maxp.data[26] = glyphsInfo.maxSizeOfInstructions >> 8;
        tables.maxp.data[27] = glyphsInfo.maxSizeOfInstructions & 255;
      }
    }
    if (!tables.hhea) {
      throw new _util.FormatError('Required "hhea" table is not found');
    }
    if (tables.hhea.data[10] === 0 && tables.hhea.data[11] === 0) {
      tables.hhea.data[10] = 0xff;
      tables.hhea.data[11] = 0xff;
    }
    const metricsOverride = {
      unitsPerEm: int16(tables.head.data[18], tables.head.data[19]),
      yMax: int16(tables.head.data[42], tables.head.data[43]),
      yMin: signedInt16(tables.head.data[38], tables.head.data[39]),
      ascent: signedInt16(tables.hhea.data[4], tables.hhea.data[5]),
      descent: signedInt16(tables.hhea.data[6], tables.hhea.data[7]),
      lineGap: signedInt16(tables.hhea.data[8], tables.hhea.data[9])
    };
    this.ascent = metricsOverride.ascent / metricsOverride.unitsPerEm;
    this.descent = metricsOverride.descent / metricsOverride.unitsPerEm;
    this.lineGap = metricsOverride.lineGap / metricsOverride.unitsPerEm;
    if (this.cssFontInfo && this.cssFontInfo.lineHeight) {
      this.lineHeight = this.cssFontInfo.metrics.lineHeight;
      this.lineGap = this.cssFontInfo.metrics.lineGap;
    } else {
      this.lineHeight = this.ascent - this.descent + this.lineGap;
    }
    if (tables.post) {
      readPostScriptTable(tables.post, properties, numGlyphs);
    }
    tables.post = {
      tag: "post",
      data: createPostTable(properties)
    };
    const charCodeToGlyphId = [];
    function hasGlyph(glyphId) {
      return !missingGlyphs[glyphId];
    }
    if (properties.composite) {
      const cidToGidMap = properties.cidToGidMap || [];
      const isCidToGidMapEmpty = cidToGidMap.length === 0;
      properties.cMap.forEach(function (charCode, cid) {
        if (typeof cid === "string") {
          cid = convertCidString(charCode, cid, true);
        }
        if (cid > 0xffff) {
          throw new _util.FormatError("Max size of CID is 65,535");
        }
        let glyphId = -1;
        if (isCidToGidMapEmpty) {
          glyphId = cid;
        } else if (cidToGidMap[cid] !== undefined) {
          glyphId = cidToGidMap[cid];
        }
        if (glyphId >= 0 && glyphId < numGlyphs && hasGlyph(glyphId)) {
          charCodeToGlyphId[charCode] = glyphId;
        }
      });
    } else {
      const cmapTable = readCmapTable(tables.cmap, font, this.isSymbolicFont, properties.hasEncoding);
      const cmapPlatformId = cmapTable.platformId;
      const cmapEncodingId = cmapTable.encodingId;
      const cmapMappings = cmapTable.mappings;
      let baseEncoding = [],
        forcePostTable = false;
      if (properties.hasEncoding && (properties.baseEncodingName === "MacRomanEncoding" || properties.baseEncodingName === "WinAnsiEncoding")) {
        baseEncoding = (0, _encodings.getEncoding)(properties.baseEncodingName);
      }
      if (properties.hasEncoding && !this.isSymbolicFont && (cmapPlatformId === 3 && cmapEncodingId === 1 || cmapPlatformId === 1 && cmapEncodingId === 0)) {
        const glyphsUnicodeMap = (0, _glyphlist.getGlyphsUnicode)();
        for (let charCode = 0; charCode < 256; charCode++) {
          let glyphName;
          if (this.differences[charCode] !== undefined) {
            glyphName = this.differences[charCode];
          } else if (baseEncoding.length && baseEncoding[charCode] !== "") {
            glyphName = baseEncoding[charCode];
          } else {
            glyphName = _encodings.StandardEncoding[charCode];
          }
          if (!glyphName) {
            continue;
          }
          const standardGlyphName = (0, _fonts_utils.recoverGlyphName)(glyphName, glyphsUnicodeMap);
          let unicodeOrCharCode;
          if (cmapPlatformId === 3 && cmapEncodingId === 1) {
            unicodeOrCharCode = glyphsUnicodeMap[standardGlyphName];
          } else if (cmapPlatformId === 1 && cmapEncodingId === 0) {
            unicodeOrCharCode = _encodings.MacRomanEncoding.indexOf(standardGlyphName);
          }
          if (unicodeOrCharCode === undefined) {
            if (!properties.glyphNames && properties.hasIncludedToUnicodeMap && !(this.toUnicode instanceof _to_unicode_map.IdentityToUnicodeMap)) {
              const unicode = this.toUnicode.get(charCode);
              if (unicode) {
                unicodeOrCharCode = unicode.codePointAt(0);
              }
            }
            if (unicodeOrCharCode === undefined) {
              continue;
            }
          }
          for (const mapping of cmapMappings) {
            if (mapping.charCode !== unicodeOrCharCode) {
              continue;
            }
            charCodeToGlyphId[charCode] = mapping.glyphId;
            break;
          }
        }
      } else if (cmapPlatformId === 0) {
        for (const mapping of cmapMappings) {
          charCodeToGlyphId[mapping.charCode] = mapping.glyphId;
        }
        forcePostTable = true;
      } else {
        for (const mapping of cmapMappings) {
          let charCode = mapping.charCode;
          if (cmapPlatformId === 3 && charCode >= 0xf000 && charCode <= 0xf0ff) {
            charCode &= 0xff;
          }
          charCodeToGlyphId[charCode] = mapping.glyphId;
        }
      }
      if (properties.glyphNames && (baseEncoding.length || this.differences.length)) {
        for (let i = 0; i < 256; ++i) {
          if (!forcePostTable && charCodeToGlyphId[i] !== undefined) {
            continue;
          }
          const glyphName = this.differences[i] || baseEncoding[i];
          if (!glyphName) {
            continue;
          }
          const glyphId = properties.glyphNames.indexOf(glyphName);
          if (glyphId > 0 && hasGlyph(glyphId)) {
            charCodeToGlyphId[i] = glyphId;
          }
        }
      }
    }
    if (charCodeToGlyphId.length === 0) {
      charCodeToGlyphId[0] = 0;
    }
    let glyphZeroId = numGlyphsOut - 1;
    if (!dupFirstEntry) {
      glyphZeroId = 0;
    }
    if (!properties.cssFontInfo) {
      const newMapping = adjustMapping(charCodeToGlyphId, hasGlyph, glyphZeroId, this.toUnicode);
      this.toFontChar = newMapping.toFontChar;
      tables.cmap = {
        tag: "cmap",
        data: createCmapTable(newMapping.charCodeToGlyphId, newMapping.toUnicodeExtraMap, numGlyphsOut)
      };
      if (!tables["OS/2"] || !validateOS2Table(tables["OS/2"], font)) {
        tables["OS/2"] = {
          tag: "OS/2",
          data: createOS2Table(properties, newMapping.charCodeToGlyphId, metricsOverride)
        };
      }
    }
    if (!isTrueType) {
      try {
        cffFile = new _stream.Stream(tables["CFF "].data);
        const parser = new _cff_parser.CFFParser(cffFile, properties, _fonts_utils.SEAC_ANALYSIS_ENABLED);
        cff = parser.parse();
        cff.duplicateFirstGlyph();
        const compiler = new _cff_parser.CFFCompiler(cff);
        tables["CFF "].data = compiler.compile();
      } catch (e) {
        (0, _util.warn)("Failed to compile font " + properties.loadedName);
      }
    }
    if (!tables.name) {
      tables.name = {
        tag: "name",
        data: createNameTable(this.name)
      };
    } else {
      const [namePrototype, nameRecords] = readNameTable(tables.name);
      tables.name.data = createNameTable(name, namePrototype);
      this.psName = namePrototype[0][6] || null;
      if (!properties.composite) {
        adjustTrueTypeToUnicode(properties, this.isSymbolicFont, nameRecords);
      }
    }
    const builder = new _opentype_file_builder.OpenTypeFileBuilder(header.version);
    for (const tableTag in tables) {
      builder.addTable(tableTag, tables[tableTag].data);
    }
    return builder.toArray();
  }
  convert(fontName, font, properties) {
    properties.fixedPitch = false;
    if (properties.builtInEncoding) {
      adjustType1ToUnicode(properties, properties.builtInEncoding);
    }
    let glyphZeroId = 1;
    if (font instanceof _cff_font.CFFFont) {
      glyphZeroId = font.numGlyphs - 1;
    }
    const mapping = font.getGlyphMapping(properties);
    let newMapping = null;
    let newCharCodeToGlyphId = mapping;
    let toUnicodeExtraMap = null;
    if (!properties.cssFontInfo) {
      newMapping = adjustMapping(mapping, font.hasGlyphId.bind(font), glyphZeroId, this.toUnicode);
      this.toFontChar = newMapping.toFontChar;
      newCharCodeToGlyphId = newMapping.charCodeToGlyphId;
      toUnicodeExtraMap = newMapping.toUnicodeExtraMap;
    }
    const numGlyphs = font.numGlyphs;
    function getCharCodes(charCodeToGlyphId, glyphId) {
      let charCodes = null;
      for (const charCode in charCodeToGlyphId) {
        if (glyphId === charCodeToGlyphId[charCode]) {
          if (!charCodes) {
            charCodes = [];
          }
          charCodes.push(charCode | 0);
        }
      }
      return charCodes;
    }
    function createCharCode(charCodeToGlyphId, glyphId) {
      for (const charCode in charCodeToGlyphId) {
        if (glyphId === charCodeToGlyphId[charCode]) {
          return charCode | 0;
        }
      }
      newMapping.charCodeToGlyphId[newMapping.nextAvailableFontCharCode] = glyphId;
      return newMapping.nextAvailableFontCharCode++;
    }
    const seacs = font.seacs;
    if (newMapping && _fonts_utils.SEAC_ANALYSIS_ENABLED && seacs && seacs.length) {
      const matrix = properties.fontMatrix || _util.FONT_IDENTITY_MATRIX;
      const charset = font.getCharset();
      const seacMap = Object.create(null);
      for (let glyphId in seacs) {
        glyphId |= 0;
        const seac = seacs[glyphId];
        const baseGlyphName = _encodings.StandardEncoding[seac[2]];
        const accentGlyphName = _encodings.StandardEncoding[seac[3]];
        const baseGlyphId = charset.indexOf(baseGlyphName);
        const accentGlyphId = charset.indexOf(accentGlyphName);
        if (baseGlyphId < 0 || accentGlyphId < 0) {
          continue;
        }
        const accentOffset = {
          x: seac[0] * matrix[0] + seac[1] * matrix[2] + matrix[4],
          y: seac[0] * matrix[1] + seac[1] * matrix[3] + matrix[5]
        };
        const charCodes = getCharCodes(mapping, glyphId);
        if (!charCodes) {
          continue;
        }
        for (const charCode of charCodes) {
          const charCodeToGlyphId = newMapping.charCodeToGlyphId;
          const baseFontCharCode = createCharCode(charCodeToGlyphId, baseGlyphId);
          const accentFontCharCode = createCharCode(charCodeToGlyphId, accentGlyphId);
          seacMap[charCode] = {
            baseFontCharCode,
            accentFontCharCode,
            accentOffset
          };
        }
      }
      properties.seacMap = seacMap;
    }
    const unitsPerEm = 1 / (properties.fontMatrix || _util.FONT_IDENTITY_MATRIX)[0];
    const builder = new _opentype_file_builder.OpenTypeFileBuilder("\x4F\x54\x54\x4F");
    builder.addTable("CFF ", font.data);
    builder.addTable("OS/2", createOS2Table(properties, newCharCodeToGlyphId));
    builder.addTable("cmap", createCmapTable(newCharCodeToGlyphId, toUnicodeExtraMap, numGlyphs));
    builder.addTable("head", "\x00\x01\x00\x00" + "\x00\x00\x10\x00" + "\x00\x00\x00\x00" + "\x5F\x0F\x3C\xF5" + "\x00\x00" + safeString16(unitsPerEm) + "\x00\x00\x00\x00\x9e\x0b\x7e\x27" + "\x00\x00\x00\x00\x9e\x0b\x7e\x27" + "\x00\x00" + safeString16(properties.descent) + "\x0F\xFF" + safeString16(properties.ascent) + string16(properties.italicAngle ? 2 : 0) + "\x00\x11" + "\x00\x00" + "\x00\x00" + "\x00\x00");
    builder.addTable("hhea", "\x00\x01\x00\x00" + safeString16(properties.ascent) + safeString16(properties.descent) + "\x00\x00" + "\xFF\xFF" + "\x00\x00" + "\x00\x00" + "\x00\x00" + safeString16(properties.capHeight) + safeString16(Math.tan(properties.italicAngle) * properties.xHeight) + "\x00\x00" + "\x00\x00" + "\x00\x00" + "\x00\x00" + "\x00\x00" + "\x00\x00" + string16(numGlyphs));
    builder.addTable("hmtx", function fontFieldsHmtx() {
      const charstrings = font.charstrings;
      const cffWidths = font.cff ? font.cff.widths : null;
      let hmtx = "\x00\x00\x00\x00";
      for (let i = 1, ii = numGlyphs; i < ii; i++) {
        let width = 0;
        if (charstrings) {
          const charstring = charstrings[i - 1];
          width = "width" in charstring ? charstring.width : 0;
        } else if (cffWidths) {
          width = Math.ceil(cffWidths[i] || 0);
        }
        hmtx += string16(width) + string16(0);
      }
      return hmtx;
    }());
    builder.addTable("maxp", "\x00\x00\x50\x00" + string16(numGlyphs));
    builder.addTable("name", createNameTable(fontName));
    builder.addTable("post", createPostTable(properties));
    return builder.toArray();
  }
  get spaceWidth() {
    const possibleSpaceReplacements = ["space", "minus", "one", "i", "I"];
    let width;
    for (const glyphName of possibleSpaceReplacements) {
      if (glyphName in this.widths) {
        width = this.widths[glyphName];
        break;
      }
      const glyphsUnicodeMap = (0, _glyphlist.getGlyphsUnicode)();
      const glyphUnicode = glyphsUnicodeMap[glyphName];
      let charcode = 0;
      if (this.composite && this.cMap.contains(glyphUnicode)) {
        charcode = this.cMap.lookup(glyphUnicode);
        if (typeof charcode === "string") {
          charcode = convertCidString(glyphUnicode, charcode);
        }
      }
      if (!charcode && this.toUnicode) {
        charcode = this.toUnicode.charCodeOf(glyphUnicode);
      }
      if (charcode <= 0) {
        charcode = glyphUnicode;
      }
      width = this.widths[charcode];
      if (width) {
        break;
      }
    }
    width = width || this.defaultWidth;
    return (0, _util.shadow)(this, "spaceWidth", width);
  }
  _charToGlyph(charcode, isSpace = false) {
    let glyph = this._glyphCache[charcode];
    if (glyph && glyph.isSpace === isSpace) {
      return glyph;
    }
    let fontCharCode, width, operatorListId;
    let widthCode = charcode;
    if (this.cMap && this.cMap.contains(charcode)) {
      widthCode = this.cMap.lookup(charcode);
      if (typeof widthCode === "string") {
        widthCode = convertCidString(charcode, widthCode);
      }
    }
    width = this.widths[widthCode];
    if (typeof width !== "number") {
      width = this.defaultWidth;
    }
    const vmetric = this.vmetrics && this.vmetrics[widthCode];
    let unicode = this.toUnicode.get(charcode) || charcode;
    if (typeof unicode === "number") {
      unicode = String.fromCharCode(unicode);
    }
    let isInFont = this.toFontChar[charcode] !== undefined;
    fontCharCode = this.toFontChar[charcode] || charcode;
    if (this.missingFile) {
      const glyphName = this.differences[charcode] || this.defaultEncoding[charcode];
      if ((glyphName === ".notdef" || glyphName === "") && this.type === "Type1") {
        fontCharCode = 0x20;
      }
      fontCharCode = (0, _unicode.mapSpecialUnicodeValues)(fontCharCode);
    }
    if (this.isType3Font) {
      operatorListId = fontCharCode;
    }
    let accent = null;
    if (this.seacMap && this.seacMap[charcode]) {
      isInFont = true;
      const seac = this.seacMap[charcode];
      fontCharCode = seac.baseFontCharCode;
      accent = {
        fontChar: String.fromCodePoint(seac.accentFontCharCode),
        offset: seac.accentOffset
      };
    }
    let fontChar = "";
    if (typeof fontCharCode === "number") {
      if (fontCharCode <= 0x10ffff) {
        fontChar = String.fromCodePoint(fontCharCode);
      } else {
        (0, _util.warn)(`charToGlyph - invalid fontCharCode: ${fontCharCode}`);
      }
    }
    glyph = new Glyph(charcode, fontChar, unicode, accent, width, vmetric, operatorListId, isSpace, isInFont);
    return this._glyphCache[charcode] = glyph;
  }
  charsToGlyphs(chars) {
    let glyphs = this._charsCache[chars];
    if (glyphs) {
      return glyphs;
    }
    glyphs = [];
    if (this.cMap) {
      const c = Object.create(null),
        ii = chars.length;
      let i = 0;
      while (i < ii) {
        this.cMap.readCharCode(chars, i, c);
        const {
          charcode,
          length
        } = c;
        i += length;
        const glyph = this._charToGlyph(charcode, length === 1 && chars.charCodeAt(i - 1) === 0x20);
        glyphs.push(glyph);
      }
    } else {
      for (let i = 0, ii = chars.length; i < ii; ++i) {
        const charcode = chars.charCodeAt(i);
        const glyph = this._charToGlyph(charcode, charcode === 0x20);
        glyphs.push(glyph);
      }
    }
    return this._charsCache[chars] = glyphs;
  }
  getCharPositions(chars) {
    const positions = [];
    if (this.cMap) {
      const c = Object.create(null);
      let i = 0;
      while (i < chars.length) {
        this.cMap.readCharCode(chars, i, c);
        const length = c.length;
        positions.push([i, i + length]);
        i += length;
      }
    } else {
      for (let i = 0, ii = chars.length; i < ii; ++i) {
        positions.push([i, i + 1]);
      }
    }
    return positions;
  }
  get glyphCacheValues() {
    return Object.values(this._glyphCache);
  }
  encodeString(str) {
    const buffers = [];
    const currentBuf = [];
    const hasCurrentBufErrors = () => buffers.length % 2 === 1;
    const getCharCode = this.toUnicode instanceof _to_unicode_map.IdentityToUnicodeMap ? unicode => this.toUnicode.charCodeOf(unicode) : unicode => this.toUnicode.charCodeOf(String.fromCodePoint(unicode));
    for (let i = 0, ii = str.length; i < ii; i++) {
      const unicode = str.codePointAt(i);
      if (unicode > 0xd7ff && (unicode < 0xe000 || unicode > 0xfffd)) {
        i++;
      }
      if (this.toUnicode) {
        const charCode = getCharCode(unicode);
        if (charCode !== -1) {
          if (hasCurrentBufErrors()) {
            buffers.push(currentBuf.join(""));
            currentBuf.length = 0;
          }
          const charCodeLength = this.cMap ? this.cMap.getCharCodeLength(charCode) : 1;
          for (let j = charCodeLength - 1; j >= 0; j--) {
            currentBuf.push(String.fromCharCode(charCode >> 8 * j & 0xff));
          }
          continue;
        }
      }
      if (!hasCurrentBufErrors()) {
        buffers.push(currentBuf.join(""));
        currentBuf.length = 0;
      }
      currentBuf.push(String.fromCodePoint(unicode));
    }
    buffers.push(currentBuf.join(""));
    return buffers;
  }
}
exports.Font = Font;
class ErrorFont {
  constructor(error) {
    this.error = error;
    this.loadedName = "g_font_error";
    this.missingFile = true;
  }
  charsToGlyphs() {
    return [];
  }
  encodeString(chars) {
    return [chars];
  }
  exportData(extraProperties = false) {
    return {
      error: this.error
    };
  }
}
exports.ErrorFont = ErrorFont;