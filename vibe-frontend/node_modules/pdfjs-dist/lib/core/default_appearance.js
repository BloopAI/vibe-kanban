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
exports.FakeUnicodeFont = void 0;
exports.createDefaultAppearance = createDefaultAppearance;
exports.getPdfColor = getPdfColor;
exports.parseDefaultAppearance = parseDefaultAppearance;
var _primitives = require("./primitives.js");
var _core_utils = require("./core_utils.js");
var _util = require("../shared/util.js");
var _colorspace = require("./colorspace.js");
var _evaluator = require("./evaluator.js");
var _stream = require("./stream.js");
class DefaultAppearanceEvaluator extends _evaluator.EvaluatorPreprocessor {
  constructor(str) {
    super(new _stream.StringStream(str));
  }
  parse() {
    const operation = {
      fn: 0,
      args: []
    };
    const result = {
      fontSize: 0,
      fontName: "",
      fontColor: new Uint8ClampedArray(3)
    };
    try {
      while (true) {
        operation.args.length = 0;
        if (!this.read(operation)) {
          break;
        }
        if (this.savedStatesDepth !== 0) {
          continue;
        }
        const {
          fn,
          args
        } = operation;
        switch (fn | 0) {
          case _util.OPS.setFont:
            const [fontName, fontSize] = args;
            if (fontName instanceof _primitives.Name) {
              result.fontName = fontName.name;
            }
            if (typeof fontSize === "number" && fontSize > 0) {
              result.fontSize = fontSize;
            }
            break;
          case _util.OPS.setFillRGBColor:
            _colorspace.ColorSpace.singletons.rgb.getRgbItem(args, 0, result.fontColor, 0);
            break;
          case _util.OPS.setFillGray:
            _colorspace.ColorSpace.singletons.gray.getRgbItem(args, 0, result.fontColor, 0);
            break;
          case _util.OPS.setFillColorSpace:
            _colorspace.ColorSpace.singletons.cmyk.getRgbItem(args, 0, result.fontColor, 0);
            break;
        }
      }
    } catch (reason) {
      (0, _util.warn)(`parseDefaultAppearance - ignoring errors: "${reason}".`);
    }
    return result;
  }
}
function parseDefaultAppearance(str) {
  return new DefaultAppearanceEvaluator(str).parse();
}
function getPdfColor(color, isFill) {
  if (color[0] === color[1] && color[1] === color[2]) {
    const gray = color[0] / 255;
    return `${(0, _core_utils.numberToString)(gray)} ${isFill ? "g" : "G"}`;
  }
  return Array.from(color, c => (0, _core_utils.numberToString)(c / 255)).join(" ") + ` ${isFill ? "rg" : "RG"}`;
}
function createDefaultAppearance({
  fontSize,
  fontName,
  fontColor
}) {
  return `/${(0, _core_utils.escapePDFName)(fontName)} ${fontSize} Tf ${getPdfColor(fontColor, true)}`;
}
class FakeUnicodeFont {
  constructor(xref, fontFamily) {
    this.xref = xref;
    this.widths = null;
    this.firstChar = Infinity;
    this.lastChar = -Infinity;
    this.fontFamily = fontFamily;
    const canvas = new OffscreenCanvas(1, 1);
    this.ctxMeasure = canvas.getContext("2d");
    if (!FakeUnicodeFont._fontNameId) {
      FakeUnicodeFont._fontNameId = 1;
    }
    this.fontName = _primitives.Name.get(`InvalidPDFjsFont_${fontFamily}_${FakeUnicodeFont._fontNameId++}`);
  }
  get toUnicodeRef() {
    if (!FakeUnicodeFont._toUnicodeRef) {
      const toUnicode = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo
<< /Registry (Adobe)
/Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap CMapName currentdict /CMap defineresource pop end end`;
      const toUnicodeStream = FakeUnicodeFont.toUnicodeStream = new _stream.StringStream(toUnicode);
      const toUnicodeDict = new _primitives.Dict(this.xref);
      toUnicodeStream.dict = toUnicodeDict;
      toUnicodeDict.set("Length", toUnicode.length);
      FakeUnicodeFont._toUnicodeRef = this.xref.getNewPersistentRef(toUnicodeStream);
    }
    return FakeUnicodeFont._toUnicodeRef;
  }
  get fontDescriptorRef() {
    if (!FakeUnicodeFont._fontDescriptorRef) {
      const fontDescriptor = new _primitives.Dict(this.xref);
      fontDescriptor.set("Type", _primitives.Name.get("FontDescriptor"));
      fontDescriptor.set("FontName", this.fontName);
      fontDescriptor.set("FontFamily", "MyriadPro Regular");
      fontDescriptor.set("FontBBox", [0, 0, 0, 0]);
      fontDescriptor.set("FontStretch", _primitives.Name.get("Normal"));
      fontDescriptor.set("FontWeight", 400);
      fontDescriptor.set("ItalicAngle", 0);
      FakeUnicodeFont._fontDescriptorRef = this.xref.getNewPersistentRef(fontDescriptor);
    }
    return FakeUnicodeFont._fontDescriptorRef;
  }
  get descendantFontRef() {
    const descendantFont = new _primitives.Dict(this.xref);
    descendantFont.set("BaseFont", this.fontName);
    descendantFont.set("Type", _primitives.Name.get("Font"));
    descendantFont.set("Subtype", _primitives.Name.get("CIDFontType0"));
    descendantFont.set("CIDToGIDMap", _primitives.Name.get("Identity"));
    descendantFont.set("FirstChar", this.firstChar);
    descendantFont.set("LastChar", this.lastChar);
    descendantFont.set("FontDescriptor", this.fontDescriptorRef);
    descendantFont.set("DW", 1000);
    const widths = [];
    const chars = [...this.widths.entries()].sort();
    let currentChar = null;
    let currentWidths = null;
    for (const [char, width] of chars) {
      if (!currentChar) {
        currentChar = char;
        currentWidths = [width];
        continue;
      }
      if (char === currentChar + currentWidths.length) {
        currentWidths.push(width);
      } else {
        widths.push(currentChar, currentWidths);
        currentChar = char;
        currentWidths = [width];
      }
    }
    if (currentChar) {
      widths.push(currentChar, currentWidths);
    }
    descendantFont.set("W", widths);
    const cidSystemInfo = new _primitives.Dict(this.xref);
    cidSystemInfo.set("Ordering", "Identity");
    cidSystemInfo.set("Registry", "Adobe");
    cidSystemInfo.set("Supplement", 0);
    descendantFont.set("CIDSystemInfo", cidSystemInfo);
    return this.xref.getNewPersistentRef(descendantFont);
  }
  get baseFontRef() {
    const baseFont = new _primitives.Dict(this.xref);
    baseFont.set("BaseFont", this.fontName);
    baseFont.set("Type", _primitives.Name.get("Font"));
    baseFont.set("Subtype", _primitives.Name.get("Type0"));
    baseFont.set("Encoding", _primitives.Name.get("Identity-H"));
    baseFont.set("DescendantFonts", [this.descendantFontRef]);
    baseFont.set("ToUnicode", this.toUnicodeRef);
    return this.xref.getNewPersistentRef(baseFont);
  }
  get resources() {
    const resources = new _primitives.Dict(this.xref);
    const font = new _primitives.Dict(this.xref);
    font.set(this.fontName.name, this.baseFontRef);
    resources.set("Font", font);
    return resources;
  }
  _createContext() {
    this.widths = new Map();
    this.ctxMeasure.font = `1000px ${this.fontFamily}`;
    return this.ctxMeasure;
  }
  createFontResources(text) {
    const ctx = this._createContext();
    for (const line of text.split(/\r\n?|\n/)) {
      for (const char of line.split("")) {
        const code = char.charCodeAt(0);
        if (this.widths.has(code)) {
          continue;
        }
        const metrics = ctx.measureText(char);
        const width = Math.ceil(metrics.width);
        this.widths.set(code, width);
        this.firstChar = Math.min(code, this.firstChar);
        this.lastChar = Math.max(code, this.lastChar);
      }
    }
    return this.resources;
  }
  createAppearance(text, rect, rotation, fontSize, bgColor, strokeAlpha) {
    const ctx = this._createContext();
    const lines = [];
    let maxWidth = -Infinity;
    for (const line of text.split(/\r\n?|\n/)) {
      lines.push(line);
      const lineWidth = ctx.measureText(line).width;
      maxWidth = Math.max(maxWidth, lineWidth);
      for (const char of line.split("")) {
        const code = char.charCodeAt(0);
        let width = this.widths.get(code);
        if (width === undefined) {
          const metrics = ctx.measureText(char);
          width = Math.ceil(metrics.width);
          this.widths.set(code, width);
          this.firstChar = Math.min(code, this.firstChar);
          this.lastChar = Math.max(code, this.lastChar);
        }
      }
    }
    maxWidth *= fontSize / 1000;
    const [x1, y1, x2, y2] = rect;
    let w = x2 - x1;
    let h = y2 - y1;
    if (rotation % 180 !== 0) {
      [w, h] = [h, w];
    }
    let hscale = 1;
    if (maxWidth > w) {
      hscale = w / maxWidth;
    }
    let vscale = 1;
    const lineHeight = _util.LINE_FACTOR * fontSize;
    const lineDescent = _util.LINE_DESCENT_FACTOR * fontSize;
    const maxHeight = lineHeight * lines.length;
    if (maxHeight > h) {
      vscale = h / maxHeight;
    }
    const fscale = Math.min(hscale, vscale);
    const newFontSize = fontSize * fscale;
    const buffer = ["q", `0 0 ${(0, _core_utils.numberToString)(w)} ${(0, _core_utils.numberToString)(h)} re W n`, `BT`, `1 0 0 1 0 ${(0, _core_utils.numberToString)(h + lineDescent)} Tm 0 Tc ${getPdfColor(bgColor, true)}`, `/${this.fontName.name} ${(0, _core_utils.numberToString)(newFontSize)} Tf`];
    const {
      resources
    } = this;
    strokeAlpha = typeof strokeAlpha === "number" && strokeAlpha >= 0 && strokeAlpha <= 1 ? strokeAlpha : 1;
    if (strokeAlpha !== 1) {
      buffer.push("/R0 gs");
      const extGState = new _primitives.Dict(this.xref);
      const r0 = new _primitives.Dict(this.xref);
      r0.set("ca", strokeAlpha);
      r0.set("CA", strokeAlpha);
      r0.set("Type", _primitives.Name.get("ExtGState"));
      extGState.set("R0", r0);
      resources.set("ExtGState", extGState);
    }
    const vShift = (0, _core_utils.numberToString)(lineHeight);
    for (const line of lines) {
      buffer.push(`0 -${vShift} Td <${(0, _core_utils.stringToUTF16HexString)(line)}> Tj`);
    }
    buffer.push("ET", "Q");
    const appearance = buffer.join("\n");
    const appearanceStreamDict = new _primitives.Dict(this.xref);
    appearanceStreamDict.set("Subtype", _primitives.Name.get("Form"));
    appearanceStreamDict.set("Type", _primitives.Name.get("XObject"));
    appearanceStreamDict.set("BBox", [0, 0, w, h]);
    appearanceStreamDict.set("Length", appearance.length);
    appearanceStreamDict.set("Resources", resources);
    if (rotation) {
      const matrix = (0, _core_utils.getRotationMatrix)(rotation, w, h);
      appearanceStreamDict.set("Matrix", matrix);
    }
    const ap = new _stream.StringStream(appearance);
    ap.dict = appearanceStreamDict;
    return ap;
  }
}
exports.FakeUnicodeFont = FakeUnicodeFont;