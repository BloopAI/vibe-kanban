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
exports.FontRendererFactory = void 0;
var _util = require("../shared/util.js");
var _cff_parser = require("./cff_parser.js");
var _glyphlist = require("./glyphlist.js");
var _encodings = require("./encodings.js");
var _stream = require("./stream.js");
function getUint32(data, offset) {
  return (data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]) >>> 0;
}
function getUint16(data, offset) {
  return data[offset] << 8 | data[offset + 1];
}
function getInt16(data, offset) {
  return (data[offset] << 24 | data[offset + 1] << 16) >> 16;
}
function getInt8(data, offset) {
  return data[offset] << 24 >> 24;
}
function getFloat214(data, offset) {
  return getInt16(data, offset) / 16384;
}
function getSubroutineBias(subrs) {
  const numSubrs = subrs.length;
  let bias = 32768;
  if (numSubrs < 1240) {
    bias = 107;
  } else if (numSubrs < 33900) {
    bias = 1131;
  }
  return bias;
}
function parseCmap(data, start, end) {
  const offset = getUint16(data, start + 2) === 1 ? getUint32(data, start + 8) : getUint32(data, start + 16);
  const format = getUint16(data, start + offset);
  let ranges, p, i;
  if (format === 4) {
    getUint16(data, start + offset + 2);
    const segCount = getUint16(data, start + offset + 6) >> 1;
    p = start + offset + 14;
    ranges = [];
    for (i = 0; i < segCount; i++, p += 2) {
      ranges[i] = {
        end: getUint16(data, p)
      };
    }
    p += 2;
    for (i = 0; i < segCount; i++, p += 2) {
      ranges[i].start = getUint16(data, p);
    }
    for (i = 0; i < segCount; i++, p += 2) {
      ranges[i].idDelta = getUint16(data, p);
    }
    for (i = 0; i < segCount; i++, p += 2) {
      let idOffset = getUint16(data, p);
      if (idOffset === 0) {
        continue;
      }
      ranges[i].ids = [];
      for (let j = 0, jj = ranges[i].end - ranges[i].start + 1; j < jj; j++) {
        ranges[i].ids[j] = getUint16(data, p + idOffset);
        idOffset += 2;
      }
    }
    return ranges;
  } else if (format === 12) {
    const groups = getUint32(data, start + offset + 12);
    p = start + offset + 16;
    ranges = [];
    for (i = 0; i < groups; i++) {
      start = getUint32(data, p);
      ranges.push({
        start,
        end: getUint32(data, p + 4),
        idDelta: getUint32(data, p + 8) - start
      });
      p += 12;
    }
    return ranges;
  }
  throw new _util.FormatError(`unsupported cmap: ${format}`);
}
function parseCff(data, start, end, seacAnalysisEnabled) {
  const properties = {};
  const parser = new _cff_parser.CFFParser(new _stream.Stream(data, start, end - start), properties, seacAnalysisEnabled);
  const cff = parser.parse();
  return {
    glyphs: cff.charStrings.objects,
    subrs: cff.topDict.privateDict && cff.topDict.privateDict.subrsIndex && cff.topDict.privateDict.subrsIndex.objects,
    gsubrs: cff.globalSubrIndex && cff.globalSubrIndex.objects,
    isCFFCIDFont: cff.isCIDFont,
    fdSelect: cff.fdSelect,
    fdArray: cff.fdArray
  };
}
function parseGlyfTable(glyf, loca, isGlyphLocationsLong) {
  let itemSize, itemDecode;
  if (isGlyphLocationsLong) {
    itemSize = 4;
    itemDecode = getUint32;
  } else {
    itemSize = 2;
    itemDecode = (data, offset) => 2 * getUint16(data, offset);
  }
  const glyphs = [];
  let startOffset = itemDecode(loca, 0);
  for (let j = itemSize; j < loca.length; j += itemSize) {
    const endOffset = itemDecode(loca, j);
    glyphs.push(glyf.subarray(startOffset, endOffset));
    startOffset = endOffset;
  }
  return glyphs;
}
function lookupCmap(ranges, unicode) {
  const code = unicode.codePointAt(0);
  let gid = 0,
    l = 0,
    r = ranges.length - 1;
  while (l < r) {
    const c = l + r + 1 >> 1;
    if (code < ranges[c].start) {
      r = c - 1;
    } else {
      l = c;
    }
  }
  if (ranges[l].start <= code && code <= ranges[l].end) {
    gid = ranges[l].idDelta + (ranges[l].ids ? ranges[l].ids[code - ranges[l].start] : code) & 0xffff;
  }
  return {
    charCode: code,
    glyphId: gid
  };
}
function compileGlyf(code, cmds, font) {
  function moveTo(x, y) {
    cmds.push({
      cmd: "moveTo",
      args: [x, y]
    });
  }
  function lineTo(x, y) {
    cmds.push({
      cmd: "lineTo",
      args: [x, y]
    });
  }
  function quadraticCurveTo(xa, ya, x, y) {
    cmds.push({
      cmd: "quadraticCurveTo",
      args: [xa, ya, x, y]
    });
  }
  let i = 0;
  const numberOfContours = getInt16(code, i);
  let flags;
  let x = 0,
    y = 0;
  i += 10;
  if (numberOfContours < 0) {
    do {
      flags = getUint16(code, i);
      const glyphIndex = getUint16(code, i + 2);
      i += 4;
      let arg1, arg2;
      if (flags & 0x01) {
        if (flags & 0x02) {
          arg1 = getInt16(code, i);
          arg2 = getInt16(code, i + 2);
        } else {
          arg1 = getUint16(code, i);
          arg2 = getUint16(code, i + 2);
        }
        i += 4;
      } else {
        if (flags & 0x02) {
          arg1 = getInt8(code, i++);
          arg2 = getInt8(code, i++);
        } else {
          arg1 = code[i++];
          arg2 = code[i++];
        }
      }
      if (flags & 0x02) {
        x = arg1;
        y = arg2;
      } else {
        x = 0;
        y = 0;
      }
      let scaleX = 1,
        scaleY = 1,
        scale01 = 0,
        scale10 = 0;
      if (flags & 0x08) {
        scaleX = scaleY = getFloat214(code, i);
        i += 2;
      } else if (flags & 0x40) {
        scaleX = getFloat214(code, i);
        scaleY = getFloat214(code, i + 2);
        i += 4;
      } else if (flags & 0x80) {
        scaleX = getFloat214(code, i);
        scale01 = getFloat214(code, i + 2);
        scale10 = getFloat214(code, i + 4);
        scaleY = getFloat214(code, i + 6);
        i += 8;
      }
      const subglyph = font.glyphs[glyphIndex];
      if (subglyph) {
        cmds.push({
          cmd: "save"
        }, {
          cmd: "transform",
          args: [scaleX, scale01, scale10, scaleY, x, y]
        });
        if (!(flags & 0x02)) {}
        compileGlyf(subglyph, cmds, font);
        cmds.push({
          cmd: "restore"
        });
      }
    } while (flags & 0x20);
  } else {
    const endPtsOfContours = [];
    let j, jj;
    for (j = 0; j < numberOfContours; j++) {
      endPtsOfContours.push(getUint16(code, i));
      i += 2;
    }
    const instructionLength = getUint16(code, i);
    i += 2 + instructionLength;
    const numberOfPoints = endPtsOfContours.at(-1) + 1;
    const points = [];
    while (points.length < numberOfPoints) {
      flags = code[i++];
      let repeat = 1;
      if (flags & 0x08) {
        repeat += code[i++];
      }
      while (repeat-- > 0) {
        points.push({
          flags
        });
      }
    }
    for (j = 0; j < numberOfPoints; j++) {
      switch (points[j].flags & 0x12) {
        case 0x00:
          x += getInt16(code, i);
          i += 2;
          break;
        case 0x02:
          x -= code[i++];
          break;
        case 0x12:
          x += code[i++];
          break;
      }
      points[j].x = x;
    }
    for (j = 0; j < numberOfPoints; j++) {
      switch (points[j].flags & 0x24) {
        case 0x00:
          y += getInt16(code, i);
          i += 2;
          break;
        case 0x04:
          y -= code[i++];
          break;
        case 0x24:
          y += code[i++];
          break;
      }
      points[j].y = y;
    }
    let startPoint = 0;
    for (i = 0; i < numberOfContours; i++) {
      const endPoint = endPtsOfContours[i];
      const contour = points.slice(startPoint, endPoint + 1);
      if (contour[0].flags & 1) {
        contour.push(contour[0]);
      } else if (contour.at(-1).flags & 1) {
        contour.unshift(contour.at(-1));
      } else {
        const p = {
          flags: 1,
          x: (contour[0].x + contour.at(-1).x) / 2,
          y: (contour[0].y + contour.at(-1).y) / 2
        };
        contour.unshift(p);
        contour.push(p);
      }
      moveTo(contour[0].x, contour[0].y);
      for (j = 1, jj = contour.length; j < jj; j++) {
        if (contour[j].flags & 1) {
          lineTo(contour[j].x, contour[j].y);
        } else if (contour[j + 1].flags & 1) {
          quadraticCurveTo(contour[j].x, contour[j].y, contour[j + 1].x, contour[j + 1].y);
          j++;
        } else {
          quadraticCurveTo(contour[j].x, contour[j].y, (contour[j].x + contour[j + 1].x) / 2, (contour[j].y + contour[j + 1].y) / 2);
        }
      }
      startPoint = endPoint + 1;
    }
  }
}
function compileCharString(charStringCode, cmds, font, glyphId) {
  function moveTo(x, y) {
    cmds.push({
      cmd: "moveTo",
      args: [x, y]
    });
  }
  function lineTo(x, y) {
    cmds.push({
      cmd: "lineTo",
      args: [x, y]
    });
  }
  function bezierCurveTo(x1, y1, x2, y2, x, y) {
    cmds.push({
      cmd: "bezierCurveTo",
      args: [x1, y1, x2, y2, x, y]
    });
  }
  const stack = [];
  let x = 0,
    y = 0;
  let stems = 0;
  function parse(code) {
    let i = 0;
    while (i < code.length) {
      let stackClean = false;
      let v = code[i++];
      let xa, xb, ya, yb, y1, y2, y3, n, subrCode;
      switch (v) {
        case 1:
          stems += stack.length >> 1;
          stackClean = true;
          break;
        case 3:
          stems += stack.length >> 1;
          stackClean = true;
          break;
        case 4:
          y += stack.pop();
          moveTo(x, y);
          stackClean = true;
          break;
        case 5:
          while (stack.length > 0) {
            x += stack.shift();
            y += stack.shift();
            lineTo(x, y);
          }
          break;
        case 6:
          while (stack.length > 0) {
            x += stack.shift();
            lineTo(x, y);
            if (stack.length === 0) {
              break;
            }
            y += stack.shift();
            lineTo(x, y);
          }
          break;
        case 7:
          while (stack.length > 0) {
            y += stack.shift();
            lineTo(x, y);
            if (stack.length === 0) {
              break;
            }
            x += stack.shift();
            lineTo(x, y);
          }
          break;
        case 8:
          while (stack.length > 0) {
            xa = x + stack.shift();
            ya = y + stack.shift();
            xb = xa + stack.shift();
            yb = ya + stack.shift();
            x = xb + stack.shift();
            y = yb + stack.shift();
            bezierCurveTo(xa, ya, xb, yb, x, y);
          }
          break;
        case 10:
          n = stack.pop();
          subrCode = null;
          if (font.isCFFCIDFont) {
            const fdIndex = font.fdSelect.getFDIndex(glyphId);
            if (fdIndex >= 0 && fdIndex < font.fdArray.length) {
              const fontDict = font.fdArray[fdIndex];
              let subrs;
              if (fontDict.privateDict && fontDict.privateDict.subrsIndex) {
                subrs = fontDict.privateDict.subrsIndex.objects;
              }
              if (subrs) {
                n += getSubroutineBias(subrs);
                subrCode = subrs[n];
              }
            } else {
              (0, _util.warn)("Invalid fd index for glyph index.");
            }
          } else {
            subrCode = font.subrs[n + font.subrsBias];
          }
          if (subrCode) {
            parse(subrCode);
          }
          break;
        case 11:
          return;
        case 12:
          v = code[i++];
          switch (v) {
            case 34:
              xa = x + stack.shift();
              xb = xa + stack.shift();
              y1 = y + stack.shift();
              x = xb + stack.shift();
              bezierCurveTo(xa, y, xb, y1, x, y1);
              xa = x + stack.shift();
              xb = xa + stack.shift();
              x = xb + stack.shift();
              bezierCurveTo(xa, y1, xb, y, x, y);
              break;
            case 35:
              xa = x + stack.shift();
              ya = y + stack.shift();
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb + stack.shift();
              y = yb + stack.shift();
              bezierCurveTo(xa, ya, xb, yb, x, y);
              xa = x + stack.shift();
              ya = y + stack.shift();
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb + stack.shift();
              y = yb + stack.shift();
              bezierCurveTo(xa, ya, xb, yb, x, y);
              stack.pop();
              break;
            case 36:
              xa = x + stack.shift();
              y1 = y + stack.shift();
              xb = xa + stack.shift();
              y2 = y1 + stack.shift();
              x = xb + stack.shift();
              bezierCurveTo(xa, y1, xb, y2, x, y2);
              xa = x + stack.shift();
              xb = xa + stack.shift();
              y3 = y2 + stack.shift();
              x = xb + stack.shift();
              bezierCurveTo(xa, y2, xb, y3, x, y);
              break;
            case 37:
              const x0 = x,
                y0 = y;
              xa = x + stack.shift();
              ya = y + stack.shift();
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb + stack.shift();
              y = yb + stack.shift();
              bezierCurveTo(xa, ya, xb, yb, x, y);
              xa = x + stack.shift();
              ya = y + stack.shift();
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb;
              y = yb;
              if (Math.abs(x - x0) > Math.abs(y - y0)) {
                x += stack.shift();
              } else {
                y += stack.shift();
              }
              bezierCurveTo(xa, ya, xb, yb, x, y);
              break;
            default:
              throw new _util.FormatError(`unknown operator: 12 ${v}`);
          }
          break;
        case 14:
          if (stack.length >= 4) {
            const achar = stack.pop();
            const bchar = stack.pop();
            y = stack.pop();
            x = stack.pop();
            cmds.push({
              cmd: "save"
            }, {
              cmd: "translate",
              args: [x, y]
            });
            let cmap = lookupCmap(font.cmap, String.fromCharCode(font.glyphNameMap[_encodings.StandardEncoding[achar]]));
            compileCharString(font.glyphs[cmap.glyphId], cmds, font, cmap.glyphId);
            cmds.push({
              cmd: "restore"
            });
            cmap = lookupCmap(font.cmap, String.fromCharCode(font.glyphNameMap[_encodings.StandardEncoding[bchar]]));
            compileCharString(font.glyphs[cmap.glyphId], cmds, font, cmap.glyphId);
          }
          return;
        case 18:
          stems += stack.length >> 1;
          stackClean = true;
          break;
        case 19:
          stems += stack.length >> 1;
          i += stems + 7 >> 3;
          stackClean = true;
          break;
        case 20:
          stems += stack.length >> 1;
          i += stems + 7 >> 3;
          stackClean = true;
          break;
        case 21:
          y += stack.pop();
          x += stack.pop();
          moveTo(x, y);
          stackClean = true;
          break;
        case 22:
          x += stack.pop();
          moveTo(x, y);
          stackClean = true;
          break;
        case 23:
          stems += stack.length >> 1;
          stackClean = true;
          break;
        case 24:
          while (stack.length > 2) {
            xa = x + stack.shift();
            ya = y + stack.shift();
            xb = xa + stack.shift();
            yb = ya + stack.shift();
            x = xb + stack.shift();
            y = yb + stack.shift();
            bezierCurveTo(xa, ya, xb, yb, x, y);
          }
          x += stack.shift();
          y += stack.shift();
          lineTo(x, y);
          break;
        case 25:
          while (stack.length > 6) {
            x += stack.shift();
            y += stack.shift();
            lineTo(x, y);
          }
          xa = x + stack.shift();
          ya = y + stack.shift();
          xb = xa + stack.shift();
          yb = ya + stack.shift();
          x = xb + stack.shift();
          y = yb + stack.shift();
          bezierCurveTo(xa, ya, xb, yb, x, y);
          break;
        case 26:
          if (stack.length % 2) {
            x += stack.shift();
          }
          while (stack.length > 0) {
            xa = x;
            ya = y + stack.shift();
            xb = xa + stack.shift();
            yb = ya + stack.shift();
            x = xb;
            y = yb + stack.shift();
            bezierCurveTo(xa, ya, xb, yb, x, y);
          }
          break;
        case 27:
          if (stack.length % 2) {
            y += stack.shift();
          }
          while (stack.length > 0) {
            xa = x + stack.shift();
            ya = y;
            xb = xa + stack.shift();
            yb = ya + stack.shift();
            x = xb + stack.shift();
            y = yb;
            bezierCurveTo(xa, ya, xb, yb, x, y);
          }
          break;
        case 28:
          stack.push((code[i] << 24 | code[i + 1] << 16) >> 16);
          i += 2;
          break;
        case 29:
          n = stack.pop() + font.gsubrsBias;
          subrCode = font.gsubrs[n];
          if (subrCode) {
            parse(subrCode);
          }
          break;
        case 30:
          while (stack.length > 0) {
            xa = x;
            ya = y + stack.shift();
            xb = xa + stack.shift();
            yb = ya + stack.shift();
            x = xb + stack.shift();
            y = yb + (stack.length === 1 ? stack.shift() : 0);
            bezierCurveTo(xa, ya, xb, yb, x, y);
            if (stack.length === 0) {
              break;
            }
            xa = x + stack.shift();
            ya = y;
            xb = xa + stack.shift();
            yb = ya + stack.shift();
            y = yb + stack.shift();
            x = xb + (stack.length === 1 ? stack.shift() : 0);
            bezierCurveTo(xa, ya, xb, yb, x, y);
          }
          break;
        case 31:
          while (stack.length > 0) {
            xa = x + stack.shift();
            ya = y;
            xb = xa + stack.shift();
            yb = ya + stack.shift();
            y = yb + stack.shift();
            x = xb + (stack.length === 1 ? stack.shift() : 0);
            bezierCurveTo(xa, ya, xb, yb, x, y);
            if (stack.length === 0) {
              break;
            }
            xa = x;
            ya = y + stack.shift();
            xb = xa + stack.shift();
            yb = ya + stack.shift();
            x = xb + stack.shift();
            y = yb + (stack.length === 1 ? stack.shift() : 0);
            bezierCurveTo(xa, ya, xb, yb, x, y);
          }
          break;
        default:
          if (v < 32) {
            throw new _util.FormatError(`unknown operator: ${v}`);
          }
          if (v < 247) {
            stack.push(v - 139);
          } else if (v < 251) {
            stack.push((v - 247) * 256 + code[i++] + 108);
          } else if (v < 255) {
            stack.push(-(v - 251) * 256 - code[i++] - 108);
          } else {
            stack.push((code[i] << 24 | code[i + 1] << 16 | code[i + 2] << 8 | code[i + 3]) / 65536);
            i += 4;
          }
          break;
      }
      if (stackClean) {
        stack.length = 0;
      }
    }
  }
  parse(charStringCode);
}
const NOOP = [];
class CompiledFont {
  constructor(fontMatrix) {
    if (this.constructor === CompiledFont) {
      (0, _util.unreachable)("Cannot initialize CompiledFont.");
    }
    this.fontMatrix = fontMatrix;
    this.compiledGlyphs = Object.create(null);
    this.compiledCharCodeToGlyphId = Object.create(null);
  }
  getPathJs(unicode) {
    const {
      charCode,
      glyphId
    } = lookupCmap(this.cmap, unicode);
    let fn = this.compiledGlyphs[glyphId];
    if (!fn) {
      try {
        fn = this.compileGlyph(this.glyphs[glyphId], glyphId);
        this.compiledGlyphs[glyphId] = fn;
      } catch (ex) {
        this.compiledGlyphs[glyphId] = NOOP;
        if (this.compiledCharCodeToGlyphId[charCode] === undefined) {
          this.compiledCharCodeToGlyphId[charCode] = glyphId;
        }
        throw ex;
      }
    }
    if (this.compiledCharCodeToGlyphId[charCode] === undefined) {
      this.compiledCharCodeToGlyphId[charCode] = glyphId;
    }
    return fn;
  }
  compileGlyph(code, glyphId) {
    if (!code || code.length === 0 || code[0] === 14) {
      return NOOP;
    }
    let fontMatrix = this.fontMatrix;
    if (this.isCFFCIDFont) {
      const fdIndex = this.fdSelect.getFDIndex(glyphId);
      if (fdIndex >= 0 && fdIndex < this.fdArray.length) {
        const fontDict = this.fdArray[fdIndex];
        fontMatrix = fontDict.getByName("FontMatrix") || _util.FONT_IDENTITY_MATRIX;
      } else {
        (0, _util.warn)("Invalid fd index for glyph index.");
      }
    }
    const cmds = [{
      cmd: "save"
    }, {
      cmd: "transform",
      args: fontMatrix.slice()
    }, {
      cmd: "scale",
      args: ["size", "-size"]
    }];
    this.compileGlyphImpl(code, cmds, glyphId);
    cmds.push({
      cmd: "restore"
    });
    return cmds;
  }
  compileGlyphImpl() {
    (0, _util.unreachable)("Children classes should implement this.");
  }
  hasBuiltPath(unicode) {
    const {
      charCode,
      glyphId
    } = lookupCmap(this.cmap, unicode);
    return this.compiledGlyphs[glyphId] !== undefined && this.compiledCharCodeToGlyphId[charCode] !== undefined;
  }
}
class TrueTypeCompiled extends CompiledFont {
  constructor(glyphs, cmap, fontMatrix) {
    super(fontMatrix || [0.000488, 0, 0, 0.000488, 0, 0]);
    this.glyphs = glyphs;
    this.cmap = cmap;
  }
  compileGlyphImpl(code, cmds) {
    compileGlyf(code, cmds, this);
  }
}
class Type2Compiled extends CompiledFont {
  constructor(cffInfo, cmap, fontMatrix, glyphNameMap) {
    super(fontMatrix || [0.001, 0, 0, 0.001, 0, 0]);
    this.glyphs = cffInfo.glyphs;
    this.gsubrs = cffInfo.gsubrs || [];
    this.subrs = cffInfo.subrs || [];
    this.cmap = cmap;
    this.glyphNameMap = glyphNameMap || (0, _glyphlist.getGlyphsUnicode)();
    this.gsubrsBias = getSubroutineBias(this.gsubrs);
    this.subrsBias = getSubroutineBias(this.subrs);
    this.isCFFCIDFont = cffInfo.isCFFCIDFont;
    this.fdSelect = cffInfo.fdSelect;
    this.fdArray = cffInfo.fdArray;
  }
  compileGlyphImpl(code, cmds, glyphId) {
    compileCharString(code, cmds, this, glyphId);
  }
}
class FontRendererFactory {
  static create(font, seacAnalysisEnabled) {
    const data = new Uint8Array(font.data);
    let cmap, glyf, loca, cff, indexToLocFormat, unitsPerEm;
    const numTables = getUint16(data, 4);
    for (let i = 0, p = 12; i < numTables; i++, p += 16) {
      const tag = (0, _util.bytesToString)(data.subarray(p, p + 4));
      const offset = getUint32(data, p + 8);
      const length = getUint32(data, p + 12);
      switch (tag) {
        case "cmap":
          cmap = parseCmap(data, offset, offset + length);
          break;
        case "glyf":
          glyf = data.subarray(offset, offset + length);
          break;
        case "loca":
          loca = data.subarray(offset, offset + length);
          break;
        case "head":
          unitsPerEm = getUint16(data, offset + 18);
          indexToLocFormat = getUint16(data, offset + 50);
          break;
        case "CFF ":
          cff = parseCff(data, offset, offset + length, seacAnalysisEnabled);
          break;
      }
    }
    if (glyf) {
      const fontMatrix = !unitsPerEm ? font.fontMatrix : [1 / unitsPerEm, 0, 0, 1 / unitsPerEm, 0, 0];
      return new TrueTypeCompiled(parseGlyfTable(glyf, loca, indexToLocFormat), cmap, fontMatrix);
    }
    return new Type2Compiled(cff, cmap, font.fontMatrix, font.glyphNameMap);
  }
}
exports.FontRendererFactory = FontRendererFactory;