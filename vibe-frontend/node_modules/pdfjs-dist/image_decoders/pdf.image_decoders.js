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

(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("pdfjs-dist/image_decoders/pdf.image_decoders", [], factory);
	else if(typeof exports === 'object')
		exports["pdfjs-dist/image_decoders/pdf.image_decoders"] = factory();
	else
		root["pdfjs-dist/image_decoders/pdf.image_decoders"] = root.pdfjsImageDecoders = factory();
})(globalThis, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((__unused_webpack_module, exports) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.VerbosityLevel = exports.Util = exports.UnknownErrorException = exports.UnexpectedResponseException = exports.UNSUPPORTED_FEATURES = exports.TextRenderingMode = exports.RenderingIntentFlag = exports.PermissionFlag = exports.PasswordResponses = exports.PasswordException = exports.PageActionEventType = exports.OPS = exports.MissingPDFException = exports.LINE_FACTOR = exports.LINE_DESCENT_FACTOR = exports.InvalidPDFException = exports.ImageKind = exports.IDENTITY_MATRIX = exports.FormatError = exports.FeatureTest = exports.FONT_IDENTITY_MATRIX = exports.DocumentActionEventType = exports.CMapCompressionType = exports.BaseException = exports.BASELINE_FACTOR = exports.AnnotationType = exports.AnnotationStateModelType = exports.AnnotationReviewState = exports.AnnotationReplyType = exports.AnnotationMode = exports.AnnotationMarkedState = exports.AnnotationFlag = exports.AnnotationFieldFlag = exports.AnnotationEditorType = exports.AnnotationEditorPrefix = exports.AnnotationEditorParamsType = exports.AnnotationBorderStyleType = exports.AnnotationActionEventType = exports.AbortException = void 0;
exports.assert = assert;
exports.bytesToString = bytesToString;
exports.createPromiseCapability = createPromiseCapability;
exports.createValidAbsoluteUrl = createValidAbsoluteUrl;
exports.getModificationDate = getModificationDate;
exports.getVerbosityLevel = getVerbosityLevel;
exports.info = info;
exports.isArrayBuffer = isArrayBuffer;
exports.isArrayEqual = isArrayEqual;
exports.objectFromMap = objectFromMap;
exports.objectSize = objectSize;
exports.setVerbosityLevel = setVerbosityLevel;
exports.shadow = shadow;
exports.string32 = string32;
exports.stringToBytes = stringToBytes;
exports.stringToPDFString = stringToPDFString;
exports.stringToUTF8String = stringToUTF8String;
exports.unreachable = unreachable;
exports.utf8StringToString = utf8StringToString;
exports.warn = warn;
;
const IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0];
exports.IDENTITY_MATRIX = IDENTITY_MATRIX;
const FONT_IDENTITY_MATRIX = [0.001, 0, 0, 0.001, 0, 0];
exports.FONT_IDENTITY_MATRIX = FONT_IDENTITY_MATRIX;
const LINE_FACTOR = 1.35;
exports.LINE_FACTOR = LINE_FACTOR;
const LINE_DESCENT_FACTOR = 0.35;
exports.LINE_DESCENT_FACTOR = LINE_DESCENT_FACTOR;
const BASELINE_FACTOR = LINE_DESCENT_FACTOR / LINE_FACTOR;
exports.BASELINE_FACTOR = BASELINE_FACTOR;
const RenderingIntentFlag = {
  ANY: 0x01,
  DISPLAY: 0x02,
  PRINT: 0x04,
  SAVE: 0x08,
  ANNOTATIONS_FORMS: 0x10,
  ANNOTATIONS_STORAGE: 0x20,
  ANNOTATIONS_DISABLE: 0x40,
  OPLIST: 0x100
};
exports.RenderingIntentFlag = RenderingIntentFlag;
const AnnotationMode = {
  DISABLE: 0,
  ENABLE: 1,
  ENABLE_FORMS: 2,
  ENABLE_STORAGE: 3
};
exports.AnnotationMode = AnnotationMode;
const AnnotationEditorPrefix = "pdfjs_internal_editor_";
exports.AnnotationEditorPrefix = AnnotationEditorPrefix;
const AnnotationEditorType = {
  DISABLE: -1,
  NONE: 0,
  FREETEXT: 3,
  INK: 15
};
exports.AnnotationEditorType = AnnotationEditorType;
const AnnotationEditorParamsType = {
  FREETEXT_SIZE: 1,
  FREETEXT_COLOR: 2,
  FREETEXT_OPACITY: 3,
  INK_COLOR: 11,
  INK_THICKNESS: 12,
  INK_OPACITY: 13
};
exports.AnnotationEditorParamsType = AnnotationEditorParamsType;
const PermissionFlag = {
  PRINT: 0x04,
  MODIFY_CONTENTS: 0x08,
  COPY: 0x10,
  MODIFY_ANNOTATIONS: 0x20,
  FILL_INTERACTIVE_FORMS: 0x100,
  COPY_FOR_ACCESSIBILITY: 0x200,
  ASSEMBLE: 0x400,
  PRINT_HIGH_QUALITY: 0x800
};
exports.PermissionFlag = PermissionFlag;
const TextRenderingMode = {
  FILL: 0,
  STROKE: 1,
  FILL_STROKE: 2,
  INVISIBLE: 3,
  FILL_ADD_TO_PATH: 4,
  STROKE_ADD_TO_PATH: 5,
  FILL_STROKE_ADD_TO_PATH: 6,
  ADD_TO_PATH: 7,
  FILL_STROKE_MASK: 3,
  ADD_TO_PATH_FLAG: 4
};
exports.TextRenderingMode = TextRenderingMode;
const ImageKind = {
  GRAYSCALE_1BPP: 1,
  RGB_24BPP: 2,
  RGBA_32BPP: 3
};
exports.ImageKind = ImageKind;
const AnnotationType = {
  TEXT: 1,
  LINK: 2,
  FREETEXT: 3,
  LINE: 4,
  SQUARE: 5,
  CIRCLE: 6,
  POLYGON: 7,
  POLYLINE: 8,
  HIGHLIGHT: 9,
  UNDERLINE: 10,
  SQUIGGLY: 11,
  STRIKEOUT: 12,
  STAMP: 13,
  CARET: 14,
  INK: 15,
  POPUP: 16,
  FILEATTACHMENT: 17,
  SOUND: 18,
  MOVIE: 19,
  WIDGET: 20,
  SCREEN: 21,
  PRINTERMARK: 22,
  TRAPNET: 23,
  WATERMARK: 24,
  THREED: 25,
  REDACT: 26
};
exports.AnnotationType = AnnotationType;
const AnnotationStateModelType = {
  MARKED: "Marked",
  REVIEW: "Review"
};
exports.AnnotationStateModelType = AnnotationStateModelType;
const AnnotationMarkedState = {
  MARKED: "Marked",
  UNMARKED: "Unmarked"
};
exports.AnnotationMarkedState = AnnotationMarkedState;
const AnnotationReviewState = {
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NONE: "None"
};
exports.AnnotationReviewState = AnnotationReviewState;
const AnnotationReplyType = {
  GROUP: "Group",
  REPLY: "R"
};
exports.AnnotationReplyType = AnnotationReplyType;
const AnnotationFlag = {
  INVISIBLE: 0x01,
  HIDDEN: 0x02,
  PRINT: 0x04,
  NOZOOM: 0x08,
  NOROTATE: 0x10,
  NOVIEW: 0x20,
  READONLY: 0x40,
  LOCKED: 0x80,
  TOGGLENOVIEW: 0x100,
  LOCKEDCONTENTS: 0x200
};
exports.AnnotationFlag = AnnotationFlag;
const AnnotationFieldFlag = {
  READONLY: 0x0000001,
  REQUIRED: 0x0000002,
  NOEXPORT: 0x0000004,
  MULTILINE: 0x0001000,
  PASSWORD: 0x0002000,
  NOTOGGLETOOFF: 0x0004000,
  RADIO: 0x0008000,
  PUSHBUTTON: 0x0010000,
  COMBO: 0x0020000,
  EDIT: 0x0040000,
  SORT: 0x0080000,
  FILESELECT: 0x0100000,
  MULTISELECT: 0x0200000,
  DONOTSPELLCHECK: 0x0400000,
  DONOTSCROLL: 0x0800000,
  COMB: 0x1000000,
  RICHTEXT: 0x2000000,
  RADIOSINUNISON: 0x2000000,
  COMMITONSELCHANGE: 0x4000000
};
exports.AnnotationFieldFlag = AnnotationFieldFlag;
const AnnotationBorderStyleType = {
  SOLID: 1,
  DASHED: 2,
  BEVELED: 3,
  INSET: 4,
  UNDERLINE: 5
};
exports.AnnotationBorderStyleType = AnnotationBorderStyleType;
const AnnotationActionEventType = {
  E: "Mouse Enter",
  X: "Mouse Exit",
  D: "Mouse Down",
  U: "Mouse Up",
  Fo: "Focus",
  Bl: "Blur",
  PO: "PageOpen",
  PC: "PageClose",
  PV: "PageVisible",
  PI: "PageInvisible",
  K: "Keystroke",
  F: "Format",
  V: "Validate",
  C: "Calculate"
};
exports.AnnotationActionEventType = AnnotationActionEventType;
const DocumentActionEventType = {
  WC: "WillClose",
  WS: "WillSave",
  DS: "DidSave",
  WP: "WillPrint",
  DP: "DidPrint"
};
exports.DocumentActionEventType = DocumentActionEventType;
const PageActionEventType = {
  O: "PageOpen",
  C: "PageClose"
};
exports.PageActionEventType = PageActionEventType;
const VerbosityLevel = {
  ERRORS: 0,
  WARNINGS: 1,
  INFOS: 5
};
exports.VerbosityLevel = VerbosityLevel;
const CMapCompressionType = {
  NONE: 0,
  BINARY: 1
};
exports.CMapCompressionType = CMapCompressionType;
const OPS = {
  dependency: 1,
  setLineWidth: 2,
  setLineCap: 3,
  setLineJoin: 4,
  setMiterLimit: 5,
  setDash: 6,
  setRenderingIntent: 7,
  setFlatness: 8,
  setGState: 9,
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  clip: 29,
  eoClip: 30,
  beginText: 31,
  endText: 32,
  setCharSpacing: 33,
  setWordSpacing: 34,
  setHScale: 35,
  setLeading: 36,
  setFont: 37,
  setTextRenderingMode: 38,
  setTextRise: 39,
  moveText: 40,
  setLeadingMoveText: 41,
  setTextMatrix: 42,
  nextLine: 43,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  setCharWidth: 48,
  setCharWidthAndBounds: 49,
  setStrokeColorSpace: 50,
  setFillColorSpace: 51,
  setStrokeColor: 52,
  setStrokeColorN: 53,
  setFillColor: 54,
  setFillColorN: 55,
  setStrokeGray: 56,
  setFillGray: 57,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  setStrokeCMYKColor: 60,
  setFillCMYKColor: 61,
  shadingFill: 62,
  beginInlineImage: 63,
  beginImageData: 64,
  endInlineImage: 65,
  paintXObject: 66,
  markPoint: 67,
  markPointProps: 68,
  beginMarkedContent: 69,
  beginMarkedContentProps: 70,
  endMarkedContent: 71,
  beginCompat: 72,
  endCompat: 73,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginGroup: 76,
  endGroup: 77,
  beginAnnotation: 80,
  endAnnotation: 81,
  paintImageMaskXObject: 83,
  paintImageMaskXObjectGroup: 84,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintInlineImageXObjectGroup: 87,
  paintImageXObjectRepeat: 88,
  paintImageMaskXObjectRepeat: 89,
  paintSolidColorImageMask: 90,
  constructPath: 91
};
exports.OPS = OPS;
const UNSUPPORTED_FEATURES = {
  forms: "forms",
  javaScript: "javaScript",
  signatures: "signatures",
  smask: "smask",
  shadingPattern: "shadingPattern",
  errorTilingPattern: "errorTilingPattern",
  errorExtGState: "errorExtGState",
  errorXObject: "errorXObject",
  errorFontLoadType3: "errorFontLoadType3",
  errorFontState: "errorFontState",
  errorFontMissing: "errorFontMissing",
  errorFontTranslate: "errorFontTranslate",
  errorColorSpace: "errorColorSpace",
  errorOperatorList: "errorOperatorList",
  errorFontToUnicode: "errorFontToUnicode",
  errorFontLoadNative: "errorFontLoadNative",
  errorFontBuildPath: "errorFontBuildPath",
  errorFontGetPath: "errorFontGetPath",
  errorMarkedContent: "errorMarkedContent",
  errorContentSubStream: "errorContentSubStream"
};
exports.UNSUPPORTED_FEATURES = UNSUPPORTED_FEATURES;
const PasswordResponses = {
  NEED_PASSWORD: 1,
  INCORRECT_PASSWORD: 2
};
exports.PasswordResponses = PasswordResponses;
let verbosity = VerbosityLevel.WARNINGS;
function setVerbosityLevel(level) {
  if (Number.isInteger(level)) {
    verbosity = level;
  }
}
function getVerbosityLevel() {
  return verbosity;
}
function info(msg) {
  if (verbosity >= VerbosityLevel.INFOS) {
    console.log(`Info: ${msg}`);
  }
}
function warn(msg) {
  if (verbosity >= VerbosityLevel.WARNINGS) {
    console.log(`Warning: ${msg}`);
  }
}
function unreachable(msg) {
  throw new Error(msg);
}
function assert(cond, msg) {
  if (!cond) {
    unreachable(msg);
  }
}
function _isValidProtocol(url) {
  if (!url) {
    return false;
  }
  switch (url.protocol) {
    case "http:":
    case "https:":
    case "ftp:":
    case "mailto:":
    case "tel:":
      return true;
    default:
      return false;
  }
}
function createValidAbsoluteUrl(url, baseUrl = null, options = null) {
  if (!url) {
    return null;
  }
  try {
    if (options && typeof url === "string") {
      if (options.addDefaultProtocol && url.startsWith("www.")) {
        const dots = url.match(/\./g);
        if (dots && dots.length >= 2) {
          url = `http://${url}`;
        }
      }
      if (options.tryConvertEncoding) {
        try {
          url = stringToUTF8String(url);
        } catch (ex) {}
      }
    }
    const absoluteUrl = baseUrl ? new URL(url, baseUrl) : new URL(url);
    if (_isValidProtocol(absoluteUrl)) {
      return absoluteUrl;
    }
  } catch (ex) {}
  return null;
}
function shadow(obj, prop, value, nonSerializable = false) {
  Object.defineProperty(obj, prop, {
    value,
    enumerable: !nonSerializable,
    configurable: true,
    writable: false
  });
  return value;
}
const BaseException = function BaseExceptionClosure() {
  function BaseException(message, name) {
    if (this.constructor === BaseException) {
      unreachable("Cannot initialize BaseException.");
    }
    this.message = message;
    this.name = name;
  }
  BaseException.prototype = new Error();
  BaseException.constructor = BaseException;
  return BaseException;
}();
exports.BaseException = BaseException;
class PasswordException extends BaseException {
  constructor(msg, code) {
    super(msg, "PasswordException");
    this.code = code;
  }
}
exports.PasswordException = PasswordException;
class UnknownErrorException extends BaseException {
  constructor(msg, details) {
    super(msg, "UnknownErrorException");
    this.details = details;
  }
}
exports.UnknownErrorException = UnknownErrorException;
class InvalidPDFException extends BaseException {
  constructor(msg) {
    super(msg, "InvalidPDFException");
  }
}
exports.InvalidPDFException = InvalidPDFException;
class MissingPDFException extends BaseException {
  constructor(msg) {
    super(msg, "MissingPDFException");
  }
}
exports.MissingPDFException = MissingPDFException;
class UnexpectedResponseException extends BaseException {
  constructor(msg, status) {
    super(msg, "UnexpectedResponseException");
    this.status = status;
  }
}
exports.UnexpectedResponseException = UnexpectedResponseException;
class FormatError extends BaseException {
  constructor(msg) {
    super(msg, "FormatError");
  }
}
exports.FormatError = FormatError;
class AbortException extends BaseException {
  constructor(msg) {
    super(msg, "AbortException");
  }
}
exports.AbortException = AbortException;
function bytesToString(bytes) {
  if (typeof bytes !== "object" || bytes === null || bytes.length === undefined) {
    unreachable("Invalid argument for bytesToString");
  }
  const length = bytes.length;
  const MAX_ARGUMENT_COUNT = 8192;
  if (length < MAX_ARGUMENT_COUNT) {
    return String.fromCharCode.apply(null, bytes);
  }
  const strBuf = [];
  for (let i = 0; i < length; i += MAX_ARGUMENT_COUNT) {
    const chunkEnd = Math.min(i + MAX_ARGUMENT_COUNT, length);
    const chunk = bytes.subarray(i, chunkEnd);
    strBuf.push(String.fromCharCode.apply(null, chunk));
  }
  return strBuf.join("");
}
function stringToBytes(str) {
  if (typeof str !== "string") {
    unreachable("Invalid argument for stringToBytes");
  }
  const length = str.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; ++i) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}
function string32(value) {
  return String.fromCharCode(value >> 24 & 0xff, value >> 16 & 0xff, value >> 8 & 0xff, value & 0xff);
}
function objectSize(obj) {
  return Object.keys(obj).length;
}
function objectFromMap(map) {
  const obj = Object.create(null);
  for (const [key, value] of map) {
    obj[key] = value;
  }
  return obj;
}
function isLittleEndian() {
  const buffer8 = new Uint8Array(4);
  buffer8[0] = 1;
  const view32 = new Uint32Array(buffer8.buffer, 0, 1);
  return view32[0] === 1;
}
function isEvalSupported() {
  try {
    new Function("");
    return true;
  } catch (e) {
    return false;
  }
}
class FeatureTest {
  static get isLittleEndian() {
    return shadow(this, "isLittleEndian", isLittleEndian());
  }
  static get isEvalSupported() {
    return shadow(this, "isEvalSupported", isEvalSupported());
  }
  static get isOffscreenCanvasSupported() {
    return shadow(this, "isOffscreenCanvasSupported", typeof OffscreenCanvas !== "undefined");
  }
  static get platform() {
    if (typeof navigator === "undefined") {
      return shadow(this, "platform", {
        isWin: false,
        isMac: false
      });
    }
    return shadow(this, "platform", {
      isWin: navigator.platform.includes("Win"),
      isMac: navigator.platform.includes("Mac")
    });
  }
}
exports.FeatureTest = FeatureTest;
const hexNumbers = [...Array(256).keys()].map(n => n.toString(16).padStart(2, "0"));
class Util {
  static makeHexColor(r, g, b) {
    return `#${hexNumbers[r]}${hexNumbers[g]}${hexNumbers[b]}`;
  }
  static scaleMinMax(transform, minMax) {
    let temp;
    if (transform[0]) {
      if (transform[0] < 0) {
        temp = minMax[0];
        minMax[0] = minMax[1];
        minMax[1] = temp;
      }
      minMax[0] *= transform[0];
      minMax[1] *= transform[0];
      if (transform[3] < 0) {
        temp = minMax[2];
        minMax[2] = minMax[3];
        minMax[3] = temp;
      }
      minMax[2] *= transform[3];
      minMax[3] *= transform[3];
    } else {
      temp = minMax[0];
      minMax[0] = minMax[2];
      minMax[2] = temp;
      temp = minMax[1];
      minMax[1] = minMax[3];
      minMax[3] = temp;
      if (transform[1] < 0) {
        temp = minMax[2];
        minMax[2] = minMax[3];
        minMax[3] = temp;
      }
      minMax[2] *= transform[1];
      minMax[3] *= transform[1];
      if (transform[2] < 0) {
        temp = minMax[0];
        minMax[0] = minMax[1];
        minMax[1] = temp;
      }
      minMax[0] *= transform[2];
      minMax[1] *= transform[2];
    }
    minMax[0] += transform[4];
    minMax[1] += transform[4];
    minMax[2] += transform[5];
    minMax[3] += transform[5];
  }
  static transform(m1, m2) {
    return [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1], m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3], m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
  }
  static applyTransform(p, m) {
    const xt = p[0] * m[0] + p[1] * m[2] + m[4];
    const yt = p[0] * m[1] + p[1] * m[3] + m[5];
    return [xt, yt];
  }
  static applyInverseTransform(p, m) {
    const d = m[0] * m[3] - m[1] * m[2];
    const xt = (p[0] * m[3] - p[1] * m[2] + m[2] * m[5] - m[4] * m[3]) / d;
    const yt = (-p[0] * m[1] + p[1] * m[0] + m[4] * m[1] - m[5] * m[0]) / d;
    return [xt, yt];
  }
  static getAxialAlignedBoundingBox(r, m) {
    const p1 = Util.applyTransform(r, m);
    const p2 = Util.applyTransform(r.slice(2, 4), m);
    const p3 = Util.applyTransform([r[0], r[3]], m);
    const p4 = Util.applyTransform([r[2], r[1]], m);
    return [Math.min(p1[0], p2[0], p3[0], p4[0]), Math.min(p1[1], p2[1], p3[1], p4[1]), Math.max(p1[0], p2[0], p3[0], p4[0]), Math.max(p1[1], p2[1], p3[1], p4[1])];
  }
  static inverseTransform(m) {
    const d = m[0] * m[3] - m[1] * m[2];
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[4] * m[3]) / d, (m[4] * m[1] - m[5] * m[0]) / d];
  }
  static singularValueDecompose2dScale(m) {
    const transpose = [m[0], m[2], m[1], m[3]];
    const a = m[0] * transpose[0] + m[1] * transpose[2];
    const b = m[0] * transpose[1] + m[1] * transpose[3];
    const c = m[2] * transpose[0] + m[3] * transpose[2];
    const d = m[2] * transpose[1] + m[3] * transpose[3];
    const first = (a + d) / 2;
    const second = Math.sqrt((a + d) ** 2 - 4 * (a * d - c * b)) / 2;
    const sx = first + second || 1;
    const sy = first - second || 1;
    return [Math.sqrt(sx), Math.sqrt(sy)];
  }
  static normalizeRect(rect) {
    const r = rect.slice(0);
    if (rect[0] > rect[2]) {
      r[0] = rect[2];
      r[2] = rect[0];
    }
    if (rect[1] > rect[3]) {
      r[1] = rect[3];
      r[3] = rect[1];
    }
    return r;
  }
  static intersect(rect1, rect2) {
    const xLow = Math.max(Math.min(rect1[0], rect1[2]), Math.min(rect2[0], rect2[2]));
    const xHigh = Math.min(Math.max(rect1[0], rect1[2]), Math.max(rect2[0], rect2[2]));
    if (xLow > xHigh) {
      return null;
    }
    const yLow = Math.max(Math.min(rect1[1], rect1[3]), Math.min(rect2[1], rect2[3]));
    const yHigh = Math.min(Math.max(rect1[1], rect1[3]), Math.max(rect2[1], rect2[3]));
    if (yLow > yHigh) {
      return null;
    }
    return [xLow, yLow, xHigh, yHigh];
  }
  static bezierBoundingBox(x0, y0, x1, y1, x2, y2, x3, y3) {
    const tvalues = [],
      bounds = [[], []];
    let a, b, c, t, t1, t2, b2ac, sqrtb2ac;
    for (let i = 0; i < 2; ++i) {
      if (i === 0) {
        b = 6 * x0 - 12 * x1 + 6 * x2;
        a = -3 * x0 + 9 * x1 - 9 * x2 + 3 * x3;
        c = 3 * x1 - 3 * x0;
      } else {
        b = 6 * y0 - 12 * y1 + 6 * y2;
        a = -3 * y0 + 9 * y1 - 9 * y2 + 3 * y3;
        c = 3 * y1 - 3 * y0;
      }
      if (Math.abs(a) < 1e-12) {
        if (Math.abs(b) < 1e-12) {
          continue;
        }
        t = -c / b;
        if (0 < t && t < 1) {
          tvalues.push(t);
        }
        continue;
      }
      b2ac = b * b - 4 * c * a;
      sqrtb2ac = Math.sqrt(b2ac);
      if (b2ac < 0) {
        continue;
      }
      t1 = (-b + sqrtb2ac) / (2 * a);
      if (0 < t1 && t1 < 1) {
        tvalues.push(t1);
      }
      t2 = (-b - sqrtb2ac) / (2 * a);
      if (0 < t2 && t2 < 1) {
        tvalues.push(t2);
      }
    }
    let j = tvalues.length,
      mt;
    const jlen = j;
    while (j--) {
      t = tvalues[j];
      mt = 1 - t;
      bounds[0][j] = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
      bounds[1][j] = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
    }
    bounds[0][jlen] = x0;
    bounds[1][jlen] = y0;
    bounds[0][jlen + 1] = x3;
    bounds[1][jlen + 1] = y3;
    bounds[0].length = bounds[1].length = jlen + 2;
    return [Math.min(...bounds[0]), Math.min(...bounds[1]), Math.max(...bounds[0]), Math.max(...bounds[1])];
  }
}
exports.Util = Util;
const PDFStringTranslateTable = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2d8, 0x2c7, 0x2c6, 0x2d9, 0x2dd, 0x2db, 0x2da, 0x2dc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2022, 0x2020, 0x2021, 0x2026, 0x2014, 0x2013, 0x192, 0x2044, 0x2039, 0x203a, 0x2212, 0x2030, 0x201e, 0x201c, 0x201d, 0x2018, 0x2019, 0x201a, 0x2122, 0xfb01, 0xfb02, 0x141, 0x152, 0x160, 0x178, 0x17d, 0x131, 0x142, 0x153, 0x161, 0x17e, 0, 0x20ac];
function stringToPDFString(str) {
  if (str[0] >= "\xEF") {
    let encoding;
    if (str[0] === "\xFE" && str[1] === "\xFF") {
      encoding = "utf-16be";
    } else if (str[0] === "\xFF" && str[1] === "\xFE") {
      encoding = "utf-16le";
    } else if (str[0] === "\xEF" && str[1] === "\xBB" && str[2] === "\xBF") {
      encoding = "utf-8";
    }
    if (encoding) {
      try {
        const decoder = new TextDecoder(encoding, {
          fatal: true
        });
        const buffer = stringToBytes(str);
        return decoder.decode(buffer);
      } catch (ex) {
        warn(`stringToPDFString: "${ex}".`);
      }
    }
  }
  const strBuf = [];
  for (let i = 0, ii = str.length; i < ii; i++) {
    const code = PDFStringTranslateTable[str.charCodeAt(i)];
    strBuf.push(code ? String.fromCharCode(code) : str.charAt(i));
  }
  return strBuf.join("");
}
function stringToUTF8String(str) {
  return decodeURIComponent(escape(str));
}
function utf8StringToString(str) {
  return unescape(encodeURIComponent(str));
}
function isArrayBuffer(v) {
  return typeof v === "object" && v !== null && v.byteLength !== undefined;
}
function isArrayEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0, ii = arr1.length; i < ii; i++) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }
  return true;
}
function getModificationDate(date = new Date()) {
  const buffer = [date.getUTCFullYear().toString(), (date.getUTCMonth() + 1).toString().padStart(2, "0"), date.getUTCDate().toString().padStart(2, "0"), date.getUTCHours().toString().padStart(2, "0"), date.getUTCMinutes().toString().padStart(2, "0"), date.getUTCSeconds().toString().padStart(2, "0")];
  return buffer.join("");
}
function createPromiseCapability() {
  const capability = Object.create(null);
  let isSettled = false;
  Object.defineProperty(capability, "settled", {
    get() {
      return isSettled;
    }
  });
  capability.promise = new Promise(function (resolve, reject) {
    capability.resolve = function (data) {
      isSettled = true;
      resolve(data);
    };
    capability.reject = function (reason) {
      isSettled = true;
      reject(reason);
    };
  });
  return capability;
}

/***/ }),
/* 2 */
/***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.Jbig2Image = void 0;
var _util = __w_pdfjs_require__(1);
var _core_utils = __w_pdfjs_require__(3);
var _arithmetic_decoder = __w_pdfjs_require__(6);
var _ccitt = __w_pdfjs_require__(7);
class Jbig2Error extends _util.BaseException {
  constructor(msg) {
    super(`JBIG2 error: ${msg}`, "Jbig2Error");
  }
}
class ContextCache {
  getContexts(id) {
    if (id in this) {
      return this[id];
    }
    return this[id] = new Int8Array(1 << 16);
  }
}
class DecodingContext {
  constructor(data, start, end) {
    this.data = data;
    this.start = start;
    this.end = end;
  }
  get decoder() {
    const decoder = new _arithmetic_decoder.ArithmeticDecoder(this.data, this.start, this.end);
    return (0, _util.shadow)(this, "decoder", decoder);
  }
  get contextCache() {
    const cache = new ContextCache();
    return (0, _util.shadow)(this, "contextCache", cache);
  }
}
const MAX_INT_32 = 2 ** 31 - 1;
const MIN_INT_32 = -(2 ** 31);
function decodeInteger(contextCache, procedure, decoder) {
  const contexts = contextCache.getContexts(procedure);
  let prev = 1;
  function readBits(length) {
    let v = 0;
    for (let i = 0; i < length; i++) {
      const bit = decoder.readBit(contexts, prev);
      prev = prev < 256 ? prev << 1 | bit : (prev << 1 | bit) & 511 | 256;
      v = v << 1 | bit;
    }
    return v >>> 0;
  }
  const sign = readBits(1);
  const value = readBits(1) ? readBits(1) ? readBits(1) ? readBits(1) ? readBits(1) ? readBits(32) + 4436 : readBits(12) + 340 : readBits(8) + 84 : readBits(6) + 20 : readBits(4) + 4 : readBits(2);
  let signedValue;
  if (sign === 0) {
    signedValue = value;
  } else if (value > 0) {
    signedValue = -value;
  }
  if (signedValue >= MIN_INT_32 && signedValue <= MAX_INT_32) {
    return signedValue;
  }
  return null;
}
function decodeIAID(contextCache, decoder, codeLength) {
  const contexts = contextCache.getContexts("IAID");
  let prev = 1;
  for (let i = 0; i < codeLength; i++) {
    const bit = decoder.readBit(contexts, prev);
    prev = prev << 1 | bit;
  }
  if (codeLength < 31) {
    return prev & (1 << codeLength) - 1;
  }
  return prev & 0x7fffffff;
}
const SegmentTypes = ["SymbolDictionary", null, null, null, "IntermediateTextRegion", null, "ImmediateTextRegion", "ImmediateLosslessTextRegion", null, null, null, null, null, null, null, null, "PatternDictionary", null, null, null, "IntermediateHalftoneRegion", null, "ImmediateHalftoneRegion", "ImmediateLosslessHalftoneRegion", null, null, null, null, null, null, null, null, null, null, null, null, "IntermediateGenericRegion", null, "ImmediateGenericRegion", "ImmediateLosslessGenericRegion", "IntermediateGenericRefinementRegion", null, "ImmediateGenericRefinementRegion", "ImmediateLosslessGenericRefinementRegion", null, null, null, null, "PageInformation", "EndOfPage", "EndOfStripe", "EndOfFile", "Profiles", "Tables", null, null, null, null, null, null, null, null, "Extension"];
const CodingTemplates = [[{
  x: -1,
  y: -2
}, {
  x: 0,
  y: -2
}, {
  x: 1,
  y: -2
}, {
  x: -2,
  y: -1
}, {
  x: -1,
  y: -1
}, {
  x: 0,
  y: -1
}, {
  x: 1,
  y: -1
}, {
  x: 2,
  y: -1
}, {
  x: -4,
  y: 0
}, {
  x: -3,
  y: 0
}, {
  x: -2,
  y: 0
}, {
  x: -1,
  y: 0
}], [{
  x: -1,
  y: -2
}, {
  x: 0,
  y: -2
}, {
  x: 1,
  y: -2
}, {
  x: 2,
  y: -2
}, {
  x: -2,
  y: -1
}, {
  x: -1,
  y: -1
}, {
  x: 0,
  y: -1
}, {
  x: 1,
  y: -1
}, {
  x: 2,
  y: -1
}, {
  x: -3,
  y: 0
}, {
  x: -2,
  y: 0
}, {
  x: -1,
  y: 0
}], [{
  x: -1,
  y: -2
}, {
  x: 0,
  y: -2
}, {
  x: 1,
  y: -2
}, {
  x: -2,
  y: -1
}, {
  x: -1,
  y: -1
}, {
  x: 0,
  y: -1
}, {
  x: 1,
  y: -1
}, {
  x: -2,
  y: 0
}, {
  x: -1,
  y: 0
}], [{
  x: -3,
  y: -1
}, {
  x: -2,
  y: -1
}, {
  x: -1,
  y: -1
}, {
  x: 0,
  y: -1
}, {
  x: 1,
  y: -1
}, {
  x: -4,
  y: 0
}, {
  x: -3,
  y: 0
}, {
  x: -2,
  y: 0
}, {
  x: -1,
  y: 0
}]];
const RefinementTemplates = [{
  coding: [{
    x: 0,
    y: -1
  }, {
    x: 1,
    y: -1
  }, {
    x: -1,
    y: 0
  }],
  reference: [{
    x: 0,
    y: -1
  }, {
    x: 1,
    y: -1
  }, {
    x: -1,
    y: 0
  }, {
    x: 0,
    y: 0
  }, {
    x: 1,
    y: 0
  }, {
    x: -1,
    y: 1
  }, {
    x: 0,
    y: 1
  }, {
    x: 1,
    y: 1
  }]
}, {
  coding: [{
    x: -1,
    y: -1
  }, {
    x: 0,
    y: -1
  }, {
    x: 1,
    y: -1
  }, {
    x: -1,
    y: 0
  }],
  reference: [{
    x: 0,
    y: -1
  }, {
    x: -1,
    y: 0
  }, {
    x: 0,
    y: 0
  }, {
    x: 1,
    y: 0
  }, {
    x: 0,
    y: 1
  }, {
    x: 1,
    y: 1
  }]
}];
const ReusedContexts = [0x9b25, 0x0795, 0x00e5, 0x0195];
const RefinementReusedContexts = [0x0020, 0x0008];
function decodeBitmapTemplate0(width, height, decodingContext) {
  const decoder = decodingContext.decoder;
  const contexts = decodingContext.contextCache.getContexts("GB");
  const bitmap = [];
  let contextLabel, i, j, pixel, row, row1, row2;
  const OLD_PIXEL_MASK = 0x7bf7;
  for (i = 0; i < height; i++) {
    row = bitmap[i] = new Uint8Array(width);
    row1 = i < 1 ? row : bitmap[i - 1];
    row2 = i < 2 ? row : bitmap[i - 2];
    contextLabel = row2[0] << 13 | row2[1] << 12 | row2[2] << 11 | row1[0] << 7 | row1[1] << 6 | row1[2] << 5 | row1[3] << 4;
    for (j = 0; j < width; j++) {
      row[j] = pixel = decoder.readBit(contexts, contextLabel);
      contextLabel = (contextLabel & OLD_PIXEL_MASK) << 1 | (j + 3 < width ? row2[j + 3] << 11 : 0) | (j + 4 < width ? row1[j + 4] << 4 : 0) | pixel;
    }
  }
  return bitmap;
}
function decodeBitmap(mmr, width, height, templateIndex, prediction, skip, at, decodingContext) {
  if (mmr) {
    const input = new Reader(decodingContext.data, decodingContext.start, decodingContext.end);
    return decodeMMRBitmap(input, width, height, false);
  }
  if (templateIndex === 0 && !skip && !prediction && at.length === 4 && at[0].x === 3 && at[0].y === -1 && at[1].x === -3 && at[1].y === -1 && at[2].x === 2 && at[2].y === -2 && at[3].x === -2 && at[3].y === -2) {
    return decodeBitmapTemplate0(width, height, decodingContext);
  }
  const useskip = !!skip;
  const template = CodingTemplates[templateIndex].concat(at);
  template.sort(function (a, b) {
    return a.y - b.y || a.x - b.x;
  });
  const templateLength = template.length;
  const templateX = new Int8Array(templateLength);
  const templateY = new Int8Array(templateLength);
  const changingTemplateEntries = [];
  let reuseMask = 0,
    minX = 0,
    maxX = 0,
    minY = 0;
  let c, k;
  for (k = 0; k < templateLength; k++) {
    templateX[k] = template[k].x;
    templateY[k] = template[k].y;
    minX = Math.min(minX, template[k].x);
    maxX = Math.max(maxX, template[k].x);
    minY = Math.min(minY, template[k].y);
    if (k < templateLength - 1 && template[k].y === template[k + 1].y && template[k].x === template[k + 1].x - 1) {
      reuseMask |= 1 << templateLength - 1 - k;
    } else {
      changingTemplateEntries.push(k);
    }
  }
  const changingEntriesLength = changingTemplateEntries.length;
  const changingTemplateX = new Int8Array(changingEntriesLength);
  const changingTemplateY = new Int8Array(changingEntriesLength);
  const changingTemplateBit = new Uint16Array(changingEntriesLength);
  for (c = 0; c < changingEntriesLength; c++) {
    k = changingTemplateEntries[c];
    changingTemplateX[c] = template[k].x;
    changingTemplateY[c] = template[k].y;
    changingTemplateBit[c] = 1 << templateLength - 1 - k;
  }
  const sbb_left = -minX;
  const sbb_top = -minY;
  const sbb_right = width - maxX;
  const pseudoPixelContext = ReusedContexts[templateIndex];
  let row = new Uint8Array(width);
  const bitmap = [];
  const decoder = decodingContext.decoder;
  const contexts = decodingContext.contextCache.getContexts("GB");
  let ltp = 0,
    j,
    i0,
    j0,
    contextLabel = 0,
    bit,
    shift;
  for (let i = 0; i < height; i++) {
    if (prediction) {
      const sltp = decoder.readBit(contexts, pseudoPixelContext);
      ltp ^= sltp;
      if (ltp) {
        bitmap.push(row);
        continue;
      }
    }
    row = new Uint8Array(row);
    bitmap.push(row);
    for (j = 0; j < width; j++) {
      if (useskip && skip[i][j]) {
        row[j] = 0;
        continue;
      }
      if (j >= sbb_left && j < sbb_right && i >= sbb_top) {
        contextLabel = contextLabel << 1 & reuseMask;
        for (k = 0; k < changingEntriesLength; k++) {
          i0 = i + changingTemplateY[k];
          j0 = j + changingTemplateX[k];
          bit = bitmap[i0][j0];
          if (bit) {
            bit = changingTemplateBit[k];
            contextLabel |= bit;
          }
        }
      } else {
        contextLabel = 0;
        shift = templateLength - 1;
        for (k = 0; k < templateLength; k++, shift--) {
          j0 = j + templateX[k];
          if (j0 >= 0 && j0 < width) {
            i0 = i + templateY[k];
            if (i0 >= 0) {
              bit = bitmap[i0][j0];
              if (bit) {
                contextLabel |= bit << shift;
              }
            }
          }
        }
      }
      const pixel = decoder.readBit(contexts, contextLabel);
      row[j] = pixel;
    }
  }
  return bitmap;
}
function decodeRefinement(width, height, templateIndex, referenceBitmap, offsetX, offsetY, prediction, at, decodingContext) {
  let codingTemplate = RefinementTemplates[templateIndex].coding;
  if (templateIndex === 0) {
    codingTemplate = codingTemplate.concat([at[0]]);
  }
  const codingTemplateLength = codingTemplate.length;
  const codingTemplateX = new Int32Array(codingTemplateLength);
  const codingTemplateY = new Int32Array(codingTemplateLength);
  let k;
  for (k = 0; k < codingTemplateLength; k++) {
    codingTemplateX[k] = codingTemplate[k].x;
    codingTemplateY[k] = codingTemplate[k].y;
  }
  let referenceTemplate = RefinementTemplates[templateIndex].reference;
  if (templateIndex === 0) {
    referenceTemplate = referenceTemplate.concat([at[1]]);
  }
  const referenceTemplateLength = referenceTemplate.length;
  const referenceTemplateX = new Int32Array(referenceTemplateLength);
  const referenceTemplateY = new Int32Array(referenceTemplateLength);
  for (k = 0; k < referenceTemplateLength; k++) {
    referenceTemplateX[k] = referenceTemplate[k].x;
    referenceTemplateY[k] = referenceTemplate[k].y;
  }
  const referenceWidth = referenceBitmap[0].length;
  const referenceHeight = referenceBitmap.length;
  const pseudoPixelContext = RefinementReusedContexts[templateIndex];
  const bitmap = [];
  const decoder = decodingContext.decoder;
  const contexts = decodingContext.contextCache.getContexts("GR");
  let ltp = 0;
  for (let i = 0; i < height; i++) {
    if (prediction) {
      const sltp = decoder.readBit(contexts, pseudoPixelContext);
      ltp ^= sltp;
      if (ltp) {
        throw new Jbig2Error("prediction is not supported");
      }
    }
    const row = new Uint8Array(width);
    bitmap.push(row);
    for (let j = 0; j < width; j++) {
      let i0, j0;
      let contextLabel = 0;
      for (k = 0; k < codingTemplateLength; k++) {
        i0 = i + codingTemplateY[k];
        j0 = j + codingTemplateX[k];
        if (i0 < 0 || j0 < 0 || j0 >= width) {
          contextLabel <<= 1;
        } else {
          contextLabel = contextLabel << 1 | bitmap[i0][j0];
        }
      }
      for (k = 0; k < referenceTemplateLength; k++) {
        i0 = i + referenceTemplateY[k] - offsetY;
        j0 = j + referenceTemplateX[k] - offsetX;
        if (i0 < 0 || i0 >= referenceHeight || j0 < 0 || j0 >= referenceWidth) {
          contextLabel <<= 1;
        } else {
          contextLabel = contextLabel << 1 | referenceBitmap[i0][j0];
        }
      }
      const pixel = decoder.readBit(contexts, contextLabel);
      row[j] = pixel;
    }
  }
  return bitmap;
}
function decodeSymbolDictionary(huffman, refinement, symbols, numberOfNewSymbols, numberOfExportedSymbols, huffmanTables, templateIndex, at, refinementTemplateIndex, refinementAt, decodingContext, huffmanInput) {
  if (huffman && refinement) {
    throw new Jbig2Error("symbol refinement with Huffman is not supported");
  }
  const newSymbols = [];
  let currentHeight = 0;
  let symbolCodeLength = (0, _core_utils.log2)(symbols.length + numberOfNewSymbols);
  const decoder = decodingContext.decoder;
  const contextCache = decodingContext.contextCache;
  let tableB1, symbolWidths;
  if (huffman) {
    tableB1 = getStandardTable(1);
    symbolWidths = [];
    symbolCodeLength = Math.max(symbolCodeLength, 1);
  }
  while (newSymbols.length < numberOfNewSymbols) {
    const deltaHeight = huffman ? huffmanTables.tableDeltaHeight.decode(huffmanInput) : decodeInteger(contextCache, "IADH", decoder);
    currentHeight += deltaHeight;
    let currentWidth = 0,
      totalWidth = 0;
    const firstSymbol = huffman ? symbolWidths.length : 0;
    while (true) {
      const deltaWidth = huffman ? huffmanTables.tableDeltaWidth.decode(huffmanInput) : decodeInteger(contextCache, "IADW", decoder);
      if (deltaWidth === null) {
        break;
      }
      currentWidth += deltaWidth;
      totalWidth += currentWidth;
      let bitmap;
      if (refinement) {
        const numberOfInstances = decodeInteger(contextCache, "IAAI", decoder);
        if (numberOfInstances > 1) {
          bitmap = decodeTextRegion(huffman, refinement, currentWidth, currentHeight, 0, numberOfInstances, 1, symbols.concat(newSymbols), symbolCodeLength, 0, 0, 1, 0, huffmanTables, refinementTemplateIndex, refinementAt, decodingContext, 0, huffmanInput);
        } else {
          const symbolId = decodeIAID(contextCache, decoder, symbolCodeLength);
          const rdx = decodeInteger(contextCache, "IARDX", decoder);
          const rdy = decodeInteger(contextCache, "IARDY", decoder);
          const symbol = symbolId < symbols.length ? symbols[symbolId] : newSymbols[symbolId - symbols.length];
          bitmap = decodeRefinement(currentWidth, currentHeight, refinementTemplateIndex, symbol, rdx, rdy, false, refinementAt, decodingContext);
        }
        newSymbols.push(bitmap);
      } else if (huffman) {
        symbolWidths.push(currentWidth);
      } else {
        bitmap = decodeBitmap(false, currentWidth, currentHeight, templateIndex, false, null, at, decodingContext);
        newSymbols.push(bitmap);
      }
    }
    if (huffman && !refinement) {
      const bitmapSize = huffmanTables.tableBitmapSize.decode(huffmanInput);
      huffmanInput.byteAlign();
      let collectiveBitmap;
      if (bitmapSize === 0) {
        collectiveBitmap = readUncompressedBitmap(huffmanInput, totalWidth, currentHeight);
      } else {
        const originalEnd = huffmanInput.end;
        const bitmapEnd = huffmanInput.position + bitmapSize;
        huffmanInput.end = bitmapEnd;
        collectiveBitmap = decodeMMRBitmap(huffmanInput, totalWidth, currentHeight, false);
        huffmanInput.end = originalEnd;
        huffmanInput.position = bitmapEnd;
      }
      const numberOfSymbolsDecoded = symbolWidths.length;
      if (firstSymbol === numberOfSymbolsDecoded - 1) {
        newSymbols.push(collectiveBitmap);
      } else {
        let i,
          y,
          xMin = 0,
          xMax,
          bitmapWidth,
          symbolBitmap;
        for (i = firstSymbol; i < numberOfSymbolsDecoded; i++) {
          bitmapWidth = symbolWidths[i];
          xMax = xMin + bitmapWidth;
          symbolBitmap = [];
          for (y = 0; y < currentHeight; y++) {
            symbolBitmap.push(collectiveBitmap[y].subarray(xMin, xMax));
          }
          newSymbols.push(symbolBitmap);
          xMin = xMax;
        }
      }
    }
  }
  const exportedSymbols = [],
    flags = [];
  let currentFlag = false,
    i,
    ii;
  const totalSymbolsLength = symbols.length + numberOfNewSymbols;
  while (flags.length < totalSymbolsLength) {
    let runLength = huffman ? tableB1.decode(huffmanInput) : decodeInteger(contextCache, "IAEX", decoder);
    while (runLength--) {
      flags.push(currentFlag);
    }
    currentFlag = !currentFlag;
  }
  for (i = 0, ii = symbols.length; i < ii; i++) {
    if (flags[i]) {
      exportedSymbols.push(symbols[i]);
    }
  }
  for (let j = 0; j < numberOfNewSymbols; i++, j++) {
    if (flags[i]) {
      exportedSymbols.push(newSymbols[j]);
    }
  }
  return exportedSymbols;
}
function decodeTextRegion(huffman, refinement, width, height, defaultPixelValue, numberOfSymbolInstances, stripSize, inputSymbols, symbolCodeLength, transposed, dsOffset, referenceCorner, combinationOperator, huffmanTables, refinementTemplateIndex, refinementAt, decodingContext, logStripSize, huffmanInput) {
  if (huffman && refinement) {
    throw new Jbig2Error("refinement with Huffman is not supported");
  }
  const bitmap = [];
  let i, row;
  for (i = 0; i < height; i++) {
    row = new Uint8Array(width);
    if (defaultPixelValue) {
      for (let j = 0; j < width; j++) {
        row[j] = defaultPixelValue;
      }
    }
    bitmap.push(row);
  }
  const decoder = decodingContext.decoder;
  const contextCache = decodingContext.contextCache;
  let stripT = huffman ? -huffmanTables.tableDeltaT.decode(huffmanInput) : -decodeInteger(contextCache, "IADT", decoder);
  let firstS = 0;
  i = 0;
  while (i < numberOfSymbolInstances) {
    const deltaT = huffman ? huffmanTables.tableDeltaT.decode(huffmanInput) : decodeInteger(contextCache, "IADT", decoder);
    stripT += deltaT;
    const deltaFirstS = huffman ? huffmanTables.tableFirstS.decode(huffmanInput) : decodeInteger(contextCache, "IAFS", decoder);
    firstS += deltaFirstS;
    let currentS = firstS;
    do {
      let currentT = 0;
      if (stripSize > 1) {
        currentT = huffman ? huffmanInput.readBits(logStripSize) : decodeInteger(contextCache, "IAIT", decoder);
      }
      const t = stripSize * stripT + currentT;
      const symbolId = huffman ? huffmanTables.symbolIDTable.decode(huffmanInput) : decodeIAID(contextCache, decoder, symbolCodeLength);
      const applyRefinement = refinement && (huffman ? huffmanInput.readBit() : decodeInteger(contextCache, "IARI", decoder));
      let symbolBitmap = inputSymbols[symbolId];
      let symbolWidth = symbolBitmap[0].length;
      let symbolHeight = symbolBitmap.length;
      if (applyRefinement) {
        const rdw = decodeInteger(contextCache, "IARDW", decoder);
        const rdh = decodeInteger(contextCache, "IARDH", decoder);
        const rdx = decodeInteger(contextCache, "IARDX", decoder);
        const rdy = decodeInteger(contextCache, "IARDY", decoder);
        symbolWidth += rdw;
        symbolHeight += rdh;
        symbolBitmap = decodeRefinement(symbolWidth, symbolHeight, refinementTemplateIndex, symbolBitmap, (rdw >> 1) + rdx, (rdh >> 1) + rdy, false, refinementAt, decodingContext);
      }
      const offsetT = t - (referenceCorner & 1 ? 0 : symbolHeight - 1);
      const offsetS = currentS - (referenceCorner & 2 ? symbolWidth - 1 : 0);
      let s2, t2, symbolRow;
      if (transposed) {
        for (s2 = 0; s2 < symbolHeight; s2++) {
          row = bitmap[offsetS + s2];
          if (!row) {
            continue;
          }
          symbolRow = symbolBitmap[s2];
          const maxWidth = Math.min(width - offsetT, symbolWidth);
          switch (combinationOperator) {
            case 0:
              for (t2 = 0; t2 < maxWidth; t2++) {
                row[offsetT + t2] |= symbolRow[t2];
              }
              break;
            case 2:
              for (t2 = 0; t2 < maxWidth; t2++) {
                row[offsetT + t2] ^= symbolRow[t2];
              }
              break;
            default:
              throw new Jbig2Error(`operator ${combinationOperator} is not supported`);
          }
        }
        currentS += symbolHeight - 1;
      } else {
        for (t2 = 0; t2 < symbolHeight; t2++) {
          row = bitmap[offsetT + t2];
          if (!row) {
            continue;
          }
          symbolRow = symbolBitmap[t2];
          switch (combinationOperator) {
            case 0:
              for (s2 = 0; s2 < symbolWidth; s2++) {
                row[offsetS + s2] |= symbolRow[s2];
              }
              break;
            case 2:
              for (s2 = 0; s2 < symbolWidth; s2++) {
                row[offsetS + s2] ^= symbolRow[s2];
              }
              break;
            default:
              throw new Jbig2Error(`operator ${combinationOperator} is not supported`);
          }
        }
        currentS += symbolWidth - 1;
      }
      i++;
      const deltaS = huffman ? huffmanTables.tableDeltaS.decode(huffmanInput) : decodeInteger(contextCache, "IADS", decoder);
      if (deltaS === null) {
        break;
      }
      currentS += deltaS + dsOffset;
    } while (true);
  }
  return bitmap;
}
function decodePatternDictionary(mmr, patternWidth, patternHeight, maxPatternIndex, template, decodingContext) {
  const at = [];
  if (!mmr) {
    at.push({
      x: -patternWidth,
      y: 0
    });
    if (template === 0) {
      at.push({
        x: -3,
        y: -1
      }, {
        x: 2,
        y: -2
      }, {
        x: -2,
        y: -2
      });
    }
  }
  const collectiveWidth = (maxPatternIndex + 1) * patternWidth;
  const collectiveBitmap = decodeBitmap(mmr, collectiveWidth, patternHeight, template, false, null, at, decodingContext);
  const patterns = [];
  for (let i = 0; i <= maxPatternIndex; i++) {
    const patternBitmap = [];
    const xMin = patternWidth * i;
    const xMax = xMin + patternWidth;
    for (let y = 0; y < patternHeight; y++) {
      patternBitmap.push(collectiveBitmap[y].subarray(xMin, xMax));
    }
    patterns.push(patternBitmap);
  }
  return patterns;
}
function decodeHalftoneRegion(mmr, patterns, template, regionWidth, regionHeight, defaultPixelValue, enableSkip, combinationOperator, gridWidth, gridHeight, gridOffsetX, gridOffsetY, gridVectorX, gridVectorY, decodingContext) {
  const skip = null;
  if (enableSkip) {
    throw new Jbig2Error("skip is not supported");
  }
  if (combinationOperator !== 0) {
    throw new Jbig2Error(`operator "${combinationOperator}" is not supported in halftone region`);
  }
  const regionBitmap = [];
  let i, j, row;
  for (i = 0; i < regionHeight; i++) {
    row = new Uint8Array(regionWidth);
    if (defaultPixelValue) {
      for (j = 0; j < regionWidth; j++) {
        row[j] = defaultPixelValue;
      }
    }
    regionBitmap.push(row);
  }
  const numberOfPatterns = patterns.length;
  const pattern0 = patterns[0];
  const patternWidth = pattern0[0].length,
    patternHeight = pattern0.length;
  const bitsPerValue = (0, _core_utils.log2)(numberOfPatterns);
  const at = [];
  if (!mmr) {
    at.push({
      x: template <= 1 ? 3 : 2,
      y: -1
    });
    if (template === 0) {
      at.push({
        x: -3,
        y: -1
      }, {
        x: 2,
        y: -2
      }, {
        x: -2,
        y: -2
      });
    }
  }
  const grayScaleBitPlanes = [];
  let mmrInput, bitmap;
  if (mmr) {
    mmrInput = new Reader(decodingContext.data, decodingContext.start, decodingContext.end);
  }
  for (i = bitsPerValue - 1; i >= 0; i--) {
    if (mmr) {
      bitmap = decodeMMRBitmap(mmrInput, gridWidth, gridHeight, true);
    } else {
      bitmap = decodeBitmap(false, gridWidth, gridHeight, template, false, skip, at, decodingContext);
    }
    grayScaleBitPlanes[i] = bitmap;
  }
  let mg, ng, bit, patternIndex, patternBitmap, x, y, patternRow, regionRow;
  for (mg = 0; mg < gridHeight; mg++) {
    for (ng = 0; ng < gridWidth; ng++) {
      bit = 0;
      patternIndex = 0;
      for (j = bitsPerValue - 1; j >= 0; j--) {
        bit ^= grayScaleBitPlanes[j][mg][ng];
        patternIndex |= bit << j;
      }
      patternBitmap = patterns[patternIndex];
      x = gridOffsetX + mg * gridVectorY + ng * gridVectorX >> 8;
      y = gridOffsetY + mg * gridVectorX - ng * gridVectorY >> 8;
      if (x >= 0 && x + patternWidth <= regionWidth && y >= 0 && y + patternHeight <= regionHeight) {
        for (i = 0; i < patternHeight; i++) {
          regionRow = regionBitmap[y + i];
          patternRow = patternBitmap[i];
          for (j = 0; j < patternWidth; j++) {
            regionRow[x + j] |= patternRow[j];
          }
        }
      } else {
        let regionX, regionY;
        for (i = 0; i < patternHeight; i++) {
          regionY = y + i;
          if (regionY < 0 || regionY >= regionHeight) {
            continue;
          }
          regionRow = regionBitmap[regionY];
          patternRow = patternBitmap[i];
          for (j = 0; j < patternWidth; j++) {
            regionX = x + j;
            if (regionX >= 0 && regionX < regionWidth) {
              regionRow[regionX] |= patternRow[j];
            }
          }
        }
      }
    }
  }
  return regionBitmap;
}
function readSegmentHeader(data, start) {
  const segmentHeader = {};
  segmentHeader.number = (0, _core_utils.readUint32)(data, start);
  const flags = data[start + 4];
  const segmentType = flags & 0x3f;
  if (!SegmentTypes[segmentType]) {
    throw new Jbig2Error("invalid segment type: " + segmentType);
  }
  segmentHeader.type = segmentType;
  segmentHeader.typeName = SegmentTypes[segmentType];
  segmentHeader.deferredNonRetain = !!(flags & 0x80);
  const pageAssociationFieldSize = !!(flags & 0x40);
  const referredFlags = data[start + 5];
  let referredToCount = referredFlags >> 5 & 7;
  const retainBits = [referredFlags & 31];
  let position = start + 6;
  if (referredFlags === 7) {
    referredToCount = (0, _core_utils.readUint32)(data, position - 1) & 0x1fffffff;
    position += 3;
    let bytes = referredToCount + 7 >> 3;
    retainBits[0] = data[position++];
    while (--bytes > 0) {
      retainBits.push(data[position++]);
    }
  } else if (referredFlags === 5 || referredFlags === 6) {
    throw new Jbig2Error("invalid referred-to flags");
  }
  segmentHeader.retainBits = retainBits;
  let referredToSegmentNumberSize = 4;
  if (segmentHeader.number <= 256) {
    referredToSegmentNumberSize = 1;
  } else if (segmentHeader.number <= 65536) {
    referredToSegmentNumberSize = 2;
  }
  const referredTo = [];
  let i, ii;
  for (i = 0; i < referredToCount; i++) {
    let number;
    if (referredToSegmentNumberSize === 1) {
      number = data[position];
    } else if (referredToSegmentNumberSize === 2) {
      number = (0, _core_utils.readUint16)(data, position);
    } else {
      number = (0, _core_utils.readUint32)(data, position);
    }
    referredTo.push(number);
    position += referredToSegmentNumberSize;
  }
  segmentHeader.referredTo = referredTo;
  if (!pageAssociationFieldSize) {
    segmentHeader.pageAssociation = data[position++];
  } else {
    segmentHeader.pageAssociation = (0, _core_utils.readUint32)(data, position);
    position += 4;
  }
  segmentHeader.length = (0, _core_utils.readUint32)(data, position);
  position += 4;
  if (segmentHeader.length === 0xffffffff) {
    if (segmentType === 38) {
      const genericRegionInfo = readRegionSegmentInformation(data, position);
      const genericRegionSegmentFlags = data[position + RegionSegmentInformationFieldLength];
      const genericRegionMmr = !!(genericRegionSegmentFlags & 1);
      const searchPatternLength = 6;
      const searchPattern = new Uint8Array(searchPatternLength);
      if (!genericRegionMmr) {
        searchPattern[0] = 0xff;
        searchPattern[1] = 0xac;
      }
      searchPattern[2] = genericRegionInfo.height >>> 24 & 0xff;
      searchPattern[3] = genericRegionInfo.height >> 16 & 0xff;
      searchPattern[4] = genericRegionInfo.height >> 8 & 0xff;
      searchPattern[5] = genericRegionInfo.height & 0xff;
      for (i = position, ii = data.length; i < ii; i++) {
        let j = 0;
        while (j < searchPatternLength && searchPattern[j] === data[i + j]) {
          j++;
        }
        if (j === searchPatternLength) {
          segmentHeader.length = i + searchPatternLength;
          break;
        }
      }
      if (segmentHeader.length === 0xffffffff) {
        throw new Jbig2Error("segment end was not found");
      }
    } else {
      throw new Jbig2Error("invalid unknown segment length");
    }
  }
  segmentHeader.headerEnd = position;
  return segmentHeader;
}
function readSegments(header, data, start, end) {
  const segments = [];
  let position = start;
  while (position < end) {
    const segmentHeader = readSegmentHeader(data, position);
    position = segmentHeader.headerEnd;
    const segment = {
      header: segmentHeader,
      data
    };
    if (!header.randomAccess) {
      segment.start = position;
      position += segmentHeader.length;
      segment.end = position;
    }
    segments.push(segment);
    if (segmentHeader.type === 51) {
      break;
    }
  }
  if (header.randomAccess) {
    for (let i = 0, ii = segments.length; i < ii; i++) {
      segments[i].start = position;
      position += segments[i].header.length;
      segments[i].end = position;
    }
  }
  return segments;
}
function readRegionSegmentInformation(data, start) {
  return {
    width: (0, _core_utils.readUint32)(data, start),
    height: (0, _core_utils.readUint32)(data, start + 4),
    x: (0, _core_utils.readUint32)(data, start + 8),
    y: (0, _core_utils.readUint32)(data, start + 12),
    combinationOperator: data[start + 16] & 7
  };
}
const RegionSegmentInformationFieldLength = 17;
function processSegment(segment, visitor) {
  const header = segment.header;
  const data = segment.data,
    end = segment.end;
  let position = segment.start;
  let args, at, i, atLength;
  switch (header.type) {
    case 0:
      const dictionary = {};
      const dictionaryFlags = (0, _core_utils.readUint16)(data, position);
      dictionary.huffman = !!(dictionaryFlags & 1);
      dictionary.refinement = !!(dictionaryFlags & 2);
      dictionary.huffmanDHSelector = dictionaryFlags >> 2 & 3;
      dictionary.huffmanDWSelector = dictionaryFlags >> 4 & 3;
      dictionary.bitmapSizeSelector = dictionaryFlags >> 6 & 1;
      dictionary.aggregationInstancesSelector = dictionaryFlags >> 7 & 1;
      dictionary.bitmapCodingContextUsed = !!(dictionaryFlags & 256);
      dictionary.bitmapCodingContextRetained = !!(dictionaryFlags & 512);
      dictionary.template = dictionaryFlags >> 10 & 3;
      dictionary.refinementTemplate = dictionaryFlags >> 12 & 1;
      position += 2;
      if (!dictionary.huffman) {
        atLength = dictionary.template === 0 ? 4 : 1;
        at = [];
        for (i = 0; i < atLength; i++) {
          at.push({
            x: (0, _core_utils.readInt8)(data, position),
            y: (0, _core_utils.readInt8)(data, position + 1)
          });
          position += 2;
        }
        dictionary.at = at;
      }
      if (dictionary.refinement && !dictionary.refinementTemplate) {
        at = [];
        for (i = 0; i < 2; i++) {
          at.push({
            x: (0, _core_utils.readInt8)(data, position),
            y: (0, _core_utils.readInt8)(data, position + 1)
          });
          position += 2;
        }
        dictionary.refinementAt = at;
      }
      dictionary.numberOfExportedSymbols = (0, _core_utils.readUint32)(data, position);
      position += 4;
      dictionary.numberOfNewSymbols = (0, _core_utils.readUint32)(data, position);
      position += 4;
      args = [dictionary, header.number, header.referredTo, data, position, end];
      break;
    case 6:
    case 7:
      const textRegion = {};
      textRegion.info = readRegionSegmentInformation(data, position);
      position += RegionSegmentInformationFieldLength;
      const textRegionSegmentFlags = (0, _core_utils.readUint16)(data, position);
      position += 2;
      textRegion.huffman = !!(textRegionSegmentFlags & 1);
      textRegion.refinement = !!(textRegionSegmentFlags & 2);
      textRegion.logStripSize = textRegionSegmentFlags >> 2 & 3;
      textRegion.stripSize = 1 << textRegion.logStripSize;
      textRegion.referenceCorner = textRegionSegmentFlags >> 4 & 3;
      textRegion.transposed = !!(textRegionSegmentFlags & 64);
      textRegion.combinationOperator = textRegionSegmentFlags >> 7 & 3;
      textRegion.defaultPixelValue = textRegionSegmentFlags >> 9 & 1;
      textRegion.dsOffset = textRegionSegmentFlags << 17 >> 27;
      textRegion.refinementTemplate = textRegionSegmentFlags >> 15 & 1;
      if (textRegion.huffman) {
        const textRegionHuffmanFlags = (0, _core_utils.readUint16)(data, position);
        position += 2;
        textRegion.huffmanFS = textRegionHuffmanFlags & 3;
        textRegion.huffmanDS = textRegionHuffmanFlags >> 2 & 3;
        textRegion.huffmanDT = textRegionHuffmanFlags >> 4 & 3;
        textRegion.huffmanRefinementDW = textRegionHuffmanFlags >> 6 & 3;
        textRegion.huffmanRefinementDH = textRegionHuffmanFlags >> 8 & 3;
        textRegion.huffmanRefinementDX = textRegionHuffmanFlags >> 10 & 3;
        textRegion.huffmanRefinementDY = textRegionHuffmanFlags >> 12 & 3;
        textRegion.huffmanRefinementSizeSelector = !!(textRegionHuffmanFlags & 0x4000);
      }
      if (textRegion.refinement && !textRegion.refinementTemplate) {
        at = [];
        for (i = 0; i < 2; i++) {
          at.push({
            x: (0, _core_utils.readInt8)(data, position),
            y: (0, _core_utils.readInt8)(data, position + 1)
          });
          position += 2;
        }
        textRegion.refinementAt = at;
      }
      textRegion.numberOfSymbolInstances = (0, _core_utils.readUint32)(data, position);
      position += 4;
      args = [textRegion, header.referredTo, data, position, end];
      break;
    case 16:
      const patternDictionary = {};
      const patternDictionaryFlags = data[position++];
      patternDictionary.mmr = !!(patternDictionaryFlags & 1);
      patternDictionary.template = patternDictionaryFlags >> 1 & 3;
      patternDictionary.patternWidth = data[position++];
      patternDictionary.patternHeight = data[position++];
      patternDictionary.maxPatternIndex = (0, _core_utils.readUint32)(data, position);
      position += 4;
      args = [patternDictionary, header.number, data, position, end];
      break;
    case 22:
    case 23:
      const halftoneRegion = {};
      halftoneRegion.info = readRegionSegmentInformation(data, position);
      position += RegionSegmentInformationFieldLength;
      const halftoneRegionFlags = data[position++];
      halftoneRegion.mmr = !!(halftoneRegionFlags & 1);
      halftoneRegion.template = halftoneRegionFlags >> 1 & 3;
      halftoneRegion.enableSkip = !!(halftoneRegionFlags & 8);
      halftoneRegion.combinationOperator = halftoneRegionFlags >> 4 & 7;
      halftoneRegion.defaultPixelValue = halftoneRegionFlags >> 7 & 1;
      halftoneRegion.gridWidth = (0, _core_utils.readUint32)(data, position);
      position += 4;
      halftoneRegion.gridHeight = (0, _core_utils.readUint32)(data, position);
      position += 4;
      halftoneRegion.gridOffsetX = (0, _core_utils.readUint32)(data, position) & 0xffffffff;
      position += 4;
      halftoneRegion.gridOffsetY = (0, _core_utils.readUint32)(data, position) & 0xffffffff;
      position += 4;
      halftoneRegion.gridVectorX = (0, _core_utils.readUint16)(data, position);
      position += 2;
      halftoneRegion.gridVectorY = (0, _core_utils.readUint16)(data, position);
      position += 2;
      args = [halftoneRegion, header.referredTo, data, position, end];
      break;
    case 38:
    case 39:
      const genericRegion = {};
      genericRegion.info = readRegionSegmentInformation(data, position);
      position += RegionSegmentInformationFieldLength;
      const genericRegionSegmentFlags = data[position++];
      genericRegion.mmr = !!(genericRegionSegmentFlags & 1);
      genericRegion.template = genericRegionSegmentFlags >> 1 & 3;
      genericRegion.prediction = !!(genericRegionSegmentFlags & 8);
      if (!genericRegion.mmr) {
        atLength = genericRegion.template === 0 ? 4 : 1;
        at = [];
        for (i = 0; i < atLength; i++) {
          at.push({
            x: (0, _core_utils.readInt8)(data, position),
            y: (0, _core_utils.readInt8)(data, position + 1)
          });
          position += 2;
        }
        genericRegion.at = at;
      }
      args = [genericRegion, data, position, end];
      break;
    case 48:
      const pageInfo = {
        width: (0, _core_utils.readUint32)(data, position),
        height: (0, _core_utils.readUint32)(data, position + 4),
        resolutionX: (0, _core_utils.readUint32)(data, position + 8),
        resolutionY: (0, _core_utils.readUint32)(data, position + 12)
      };
      if (pageInfo.height === 0xffffffff) {
        delete pageInfo.height;
      }
      const pageSegmentFlags = data[position + 16];
      (0, _core_utils.readUint16)(data, position + 17);
      pageInfo.lossless = !!(pageSegmentFlags & 1);
      pageInfo.refinement = !!(pageSegmentFlags & 2);
      pageInfo.defaultPixelValue = pageSegmentFlags >> 2 & 1;
      pageInfo.combinationOperator = pageSegmentFlags >> 3 & 3;
      pageInfo.requiresBuffer = !!(pageSegmentFlags & 32);
      pageInfo.combinationOperatorOverride = !!(pageSegmentFlags & 64);
      args = [pageInfo];
      break;
    case 49:
      break;
    case 50:
      break;
    case 51:
      break;
    case 53:
      args = [header.number, data, position, end];
      break;
    case 62:
      break;
    default:
      throw new Jbig2Error(`segment type ${header.typeName}(${header.type}) is not implemented`);
  }
  const callbackName = "on" + header.typeName;
  if (callbackName in visitor) {
    visitor[callbackName].apply(visitor, args);
  }
}
function processSegments(segments, visitor) {
  for (let i = 0, ii = segments.length; i < ii; i++) {
    processSegment(segments[i], visitor);
  }
}
function parseJbig2Chunks(chunks) {
  const visitor = new SimpleSegmentVisitor();
  for (let i = 0, ii = chunks.length; i < ii; i++) {
    const chunk = chunks[i];
    const segments = readSegments({}, chunk.data, chunk.start, chunk.end);
    processSegments(segments, visitor);
  }
  return visitor.buffer;
}
function parseJbig2(data) {
  const end = data.length;
  let position = 0;
  if (data[position] !== 0x97 || data[position + 1] !== 0x4a || data[position + 2] !== 0x42 || data[position + 3] !== 0x32 || data[position + 4] !== 0x0d || data[position + 5] !== 0x0a || data[position + 6] !== 0x1a || data[position + 7] !== 0x0a) {
    throw new Jbig2Error("parseJbig2 - invalid header.");
  }
  const header = Object.create(null);
  position += 8;
  const flags = data[position++];
  header.randomAccess = !(flags & 1);
  if (!(flags & 2)) {
    header.numberOfPages = (0, _core_utils.readUint32)(data, position);
    position += 4;
  }
  const segments = readSegments(header, data, position, end);
  const visitor = new SimpleSegmentVisitor();
  processSegments(segments, visitor);
  const {
    width,
    height
  } = visitor.currentPageInfo;
  const bitPacked = visitor.buffer;
  const imgData = new Uint8ClampedArray(width * height);
  let q = 0,
    k = 0;
  for (let i = 0; i < height; i++) {
    let mask = 0,
      buffer;
    for (let j = 0; j < width; j++) {
      if (!mask) {
        mask = 128;
        buffer = bitPacked[k++];
      }
      imgData[q++] = buffer & mask ? 0 : 255;
      mask >>= 1;
    }
  }
  return {
    imgData,
    width,
    height
  };
}
class SimpleSegmentVisitor {
  onPageInformation(info) {
    this.currentPageInfo = info;
    const rowSize = info.width + 7 >> 3;
    const buffer = new Uint8ClampedArray(rowSize * info.height);
    if (info.defaultPixelValue) {
      buffer.fill(0xff);
    }
    this.buffer = buffer;
  }
  drawBitmap(regionInfo, bitmap) {
    const pageInfo = this.currentPageInfo;
    const width = regionInfo.width,
      height = regionInfo.height;
    const rowSize = pageInfo.width + 7 >> 3;
    const combinationOperator = pageInfo.combinationOperatorOverride ? regionInfo.combinationOperator : pageInfo.combinationOperator;
    const buffer = this.buffer;
    const mask0 = 128 >> (regionInfo.x & 7);
    let offset0 = regionInfo.y * rowSize + (regionInfo.x >> 3);
    let i, j, mask, offset;
    switch (combinationOperator) {
      case 0:
        for (i = 0; i < height; i++) {
          mask = mask0;
          offset = offset0;
          for (j = 0; j < width; j++) {
            if (bitmap[i][j]) {
              buffer[offset] |= mask;
            }
            mask >>= 1;
            if (!mask) {
              mask = 128;
              offset++;
            }
          }
          offset0 += rowSize;
        }
        break;
      case 2:
        for (i = 0; i < height; i++) {
          mask = mask0;
          offset = offset0;
          for (j = 0; j < width; j++) {
            if (bitmap[i][j]) {
              buffer[offset] ^= mask;
            }
            mask >>= 1;
            if (!mask) {
              mask = 128;
              offset++;
            }
          }
          offset0 += rowSize;
        }
        break;
      default:
        throw new Jbig2Error(`operator ${combinationOperator} is not supported`);
    }
  }
  onImmediateGenericRegion(region, data, start, end) {
    const regionInfo = region.info;
    const decodingContext = new DecodingContext(data, start, end);
    const bitmap = decodeBitmap(region.mmr, regionInfo.width, regionInfo.height, region.template, region.prediction, null, region.at, decodingContext);
    this.drawBitmap(regionInfo, bitmap);
  }
  onImmediateLosslessGenericRegion() {
    this.onImmediateGenericRegion(...arguments);
  }
  onSymbolDictionary(dictionary, currentSegment, referredSegments, data, start, end) {
    let huffmanTables, huffmanInput;
    if (dictionary.huffman) {
      huffmanTables = getSymbolDictionaryHuffmanTables(dictionary, referredSegments, this.customTables);
      huffmanInput = new Reader(data, start, end);
    }
    let symbols = this.symbols;
    if (!symbols) {
      this.symbols = symbols = {};
    }
    const inputSymbols = [];
    for (const referredSegment of referredSegments) {
      const referredSymbols = symbols[referredSegment];
      if (referredSymbols) {
        inputSymbols.push(...referredSymbols);
      }
    }
    const decodingContext = new DecodingContext(data, start, end);
    symbols[currentSegment] = decodeSymbolDictionary(dictionary.huffman, dictionary.refinement, inputSymbols, dictionary.numberOfNewSymbols, dictionary.numberOfExportedSymbols, huffmanTables, dictionary.template, dictionary.at, dictionary.refinementTemplate, dictionary.refinementAt, decodingContext, huffmanInput);
  }
  onImmediateTextRegion(region, referredSegments, data, start, end) {
    const regionInfo = region.info;
    let huffmanTables, huffmanInput;
    const symbols = this.symbols;
    const inputSymbols = [];
    for (const referredSegment of referredSegments) {
      const referredSymbols = symbols[referredSegment];
      if (referredSymbols) {
        inputSymbols.push(...referredSymbols);
      }
    }
    const symbolCodeLength = (0, _core_utils.log2)(inputSymbols.length);
    if (region.huffman) {
      huffmanInput = new Reader(data, start, end);
      huffmanTables = getTextRegionHuffmanTables(region, referredSegments, this.customTables, inputSymbols.length, huffmanInput);
    }
    const decodingContext = new DecodingContext(data, start, end);
    const bitmap = decodeTextRegion(region.huffman, region.refinement, regionInfo.width, regionInfo.height, region.defaultPixelValue, region.numberOfSymbolInstances, region.stripSize, inputSymbols, symbolCodeLength, region.transposed, region.dsOffset, region.referenceCorner, region.combinationOperator, huffmanTables, region.refinementTemplate, region.refinementAt, decodingContext, region.logStripSize, huffmanInput);
    this.drawBitmap(regionInfo, bitmap);
  }
  onImmediateLosslessTextRegion() {
    this.onImmediateTextRegion(...arguments);
  }
  onPatternDictionary(dictionary, currentSegment, data, start, end) {
    let patterns = this.patterns;
    if (!patterns) {
      this.patterns = patterns = {};
    }
    const decodingContext = new DecodingContext(data, start, end);
    patterns[currentSegment] = decodePatternDictionary(dictionary.mmr, dictionary.patternWidth, dictionary.patternHeight, dictionary.maxPatternIndex, dictionary.template, decodingContext);
  }
  onImmediateHalftoneRegion(region, referredSegments, data, start, end) {
    const patterns = this.patterns[referredSegments[0]];
    const regionInfo = region.info;
    const decodingContext = new DecodingContext(data, start, end);
    const bitmap = decodeHalftoneRegion(region.mmr, patterns, region.template, regionInfo.width, regionInfo.height, region.defaultPixelValue, region.enableSkip, region.combinationOperator, region.gridWidth, region.gridHeight, region.gridOffsetX, region.gridOffsetY, region.gridVectorX, region.gridVectorY, decodingContext);
    this.drawBitmap(regionInfo, bitmap);
  }
  onImmediateLosslessHalftoneRegion() {
    this.onImmediateHalftoneRegion(...arguments);
  }
  onTables(currentSegment, data, start, end) {
    let customTables = this.customTables;
    if (!customTables) {
      this.customTables = customTables = {};
    }
    customTables[currentSegment] = decodeTablesSegment(data, start, end);
  }
}
class HuffmanLine {
  constructor(lineData) {
    if (lineData.length === 2) {
      this.isOOB = true;
      this.rangeLow = 0;
      this.prefixLength = lineData[0];
      this.rangeLength = 0;
      this.prefixCode = lineData[1];
      this.isLowerRange = false;
    } else {
      this.isOOB = false;
      this.rangeLow = lineData[0];
      this.prefixLength = lineData[1];
      this.rangeLength = lineData[2];
      this.prefixCode = lineData[3];
      this.isLowerRange = lineData[4] === "lower";
    }
  }
}
class HuffmanTreeNode {
  constructor(line) {
    this.children = [];
    if (line) {
      this.isLeaf = true;
      this.rangeLength = line.rangeLength;
      this.rangeLow = line.rangeLow;
      this.isLowerRange = line.isLowerRange;
      this.isOOB = line.isOOB;
    } else {
      this.isLeaf = false;
    }
  }
  buildTree(line, shift) {
    const bit = line.prefixCode >> shift & 1;
    if (shift <= 0) {
      this.children[bit] = new HuffmanTreeNode(line);
    } else {
      let node = this.children[bit];
      if (!node) {
        this.children[bit] = node = new HuffmanTreeNode(null);
      }
      node.buildTree(line, shift - 1);
    }
  }
  decodeNode(reader) {
    if (this.isLeaf) {
      if (this.isOOB) {
        return null;
      }
      const htOffset = reader.readBits(this.rangeLength);
      return this.rangeLow + (this.isLowerRange ? -htOffset : htOffset);
    }
    const node = this.children[reader.readBit()];
    if (!node) {
      throw new Jbig2Error("invalid Huffman data");
    }
    return node.decodeNode(reader);
  }
}
class HuffmanTable {
  constructor(lines, prefixCodesDone) {
    if (!prefixCodesDone) {
      this.assignPrefixCodes(lines);
    }
    this.rootNode = new HuffmanTreeNode(null);
    for (let i = 0, ii = lines.length; i < ii; i++) {
      const line = lines[i];
      if (line.prefixLength > 0) {
        this.rootNode.buildTree(line, line.prefixLength - 1);
      }
    }
  }
  decode(reader) {
    return this.rootNode.decodeNode(reader);
  }
  assignPrefixCodes(lines) {
    const linesLength = lines.length;
    let prefixLengthMax = 0;
    for (let i = 0; i < linesLength; i++) {
      prefixLengthMax = Math.max(prefixLengthMax, lines[i].prefixLength);
    }
    const histogram = new Uint32Array(prefixLengthMax + 1);
    for (let i = 0; i < linesLength; i++) {
      histogram[lines[i].prefixLength]++;
    }
    let currentLength = 1,
      firstCode = 0,
      currentCode,
      currentTemp,
      line;
    histogram[0] = 0;
    while (currentLength <= prefixLengthMax) {
      firstCode = firstCode + histogram[currentLength - 1] << 1;
      currentCode = firstCode;
      currentTemp = 0;
      while (currentTemp < linesLength) {
        line = lines[currentTemp];
        if (line.prefixLength === currentLength) {
          line.prefixCode = currentCode;
          currentCode++;
        }
        currentTemp++;
      }
      currentLength++;
    }
  }
}
function decodeTablesSegment(data, start, end) {
  const flags = data[start];
  const lowestValue = (0, _core_utils.readUint32)(data, start + 1) & 0xffffffff;
  const highestValue = (0, _core_utils.readUint32)(data, start + 5) & 0xffffffff;
  const reader = new Reader(data, start + 9, end);
  const prefixSizeBits = (flags >> 1 & 7) + 1;
  const rangeSizeBits = (flags >> 4 & 7) + 1;
  const lines = [];
  let prefixLength,
    rangeLength,
    currentRangeLow = lowestValue;
  do {
    prefixLength = reader.readBits(prefixSizeBits);
    rangeLength = reader.readBits(rangeSizeBits);
    lines.push(new HuffmanLine([currentRangeLow, prefixLength, rangeLength, 0]));
    currentRangeLow += 1 << rangeLength;
  } while (currentRangeLow < highestValue);
  prefixLength = reader.readBits(prefixSizeBits);
  lines.push(new HuffmanLine([lowestValue - 1, prefixLength, 32, 0, "lower"]));
  prefixLength = reader.readBits(prefixSizeBits);
  lines.push(new HuffmanLine([highestValue, prefixLength, 32, 0]));
  if (flags & 1) {
    prefixLength = reader.readBits(prefixSizeBits);
    lines.push(new HuffmanLine([prefixLength, 0]));
  }
  return new HuffmanTable(lines, false);
}
const standardTablesCache = {};
function getStandardTable(number) {
  let table = standardTablesCache[number];
  if (table) {
    return table;
  }
  let lines;
  switch (number) {
    case 1:
      lines = [[0, 1, 4, 0x0], [16, 2, 8, 0x2], [272, 3, 16, 0x6], [65808, 3, 32, 0x7]];
      break;
    case 2:
      lines = [[0, 1, 0, 0x0], [1, 2, 0, 0x2], [2, 3, 0, 0x6], [3, 4, 3, 0xe], [11, 5, 6, 0x1e], [75, 6, 32, 0x3e], [6, 0x3f]];
      break;
    case 3:
      lines = [[-256, 8, 8, 0xfe], [0, 1, 0, 0x0], [1, 2, 0, 0x2], [2, 3, 0, 0x6], [3, 4, 3, 0xe], [11, 5, 6, 0x1e], [-257, 8, 32, 0xff, "lower"], [75, 7, 32, 0x7e], [6, 0x3e]];
      break;
    case 4:
      lines = [[1, 1, 0, 0x0], [2, 2, 0, 0x2], [3, 3, 0, 0x6], [4, 4, 3, 0xe], [12, 5, 6, 0x1e], [76, 5, 32, 0x1f]];
      break;
    case 5:
      lines = [[-255, 7, 8, 0x7e], [1, 1, 0, 0x0], [2, 2, 0, 0x2], [3, 3, 0, 0x6], [4, 4, 3, 0xe], [12, 5, 6, 0x1e], [-256, 7, 32, 0x7f, "lower"], [76, 6, 32, 0x3e]];
      break;
    case 6:
      lines = [[-2048, 5, 10, 0x1c], [-1024, 4, 9, 0x8], [-512, 4, 8, 0x9], [-256, 4, 7, 0xa], [-128, 5, 6, 0x1d], [-64, 5, 5, 0x1e], [-32, 4, 5, 0xb], [0, 2, 7, 0x0], [128, 3, 7, 0x2], [256, 3, 8, 0x3], [512, 4, 9, 0xc], [1024, 4, 10, 0xd], [-2049, 6, 32, 0x3e, "lower"], [2048, 6, 32, 0x3f]];
      break;
    case 7:
      lines = [[-1024, 4, 9, 0x8], [-512, 3, 8, 0x0], [-256, 4, 7, 0x9], [-128, 5, 6, 0x1a], [-64, 5, 5, 0x1b], [-32, 4, 5, 0xa], [0, 4, 5, 0xb], [32, 5, 5, 0x1c], [64, 5, 6, 0x1d], [128, 4, 7, 0xc], [256, 3, 8, 0x1], [512, 3, 9, 0x2], [1024, 3, 10, 0x3], [-1025, 5, 32, 0x1e, "lower"], [2048, 5, 32, 0x1f]];
      break;
    case 8:
      lines = [[-15, 8, 3, 0xfc], [-7, 9, 1, 0x1fc], [-5, 8, 1, 0xfd], [-3, 9, 0, 0x1fd], [-2, 7, 0, 0x7c], [-1, 4, 0, 0xa], [0, 2, 1, 0x0], [2, 5, 0, 0x1a], [3, 6, 0, 0x3a], [4, 3, 4, 0x4], [20, 6, 1, 0x3b], [22, 4, 4, 0xb], [38, 4, 5, 0xc], [70, 5, 6, 0x1b], [134, 5, 7, 0x1c], [262, 6, 7, 0x3c], [390, 7, 8, 0x7d], [646, 6, 10, 0x3d], [-16, 9, 32, 0x1fe, "lower"], [1670, 9, 32, 0x1ff], [2, 0x1]];
      break;
    case 9:
      lines = [[-31, 8, 4, 0xfc], [-15, 9, 2, 0x1fc], [-11, 8, 2, 0xfd], [-7, 9, 1, 0x1fd], [-5, 7, 1, 0x7c], [-3, 4, 1, 0xa], [-1, 3, 1, 0x2], [1, 3, 1, 0x3], [3, 5, 1, 0x1a], [5, 6, 1, 0x3a], [7, 3, 5, 0x4], [39, 6, 2, 0x3b], [43, 4, 5, 0xb], [75, 4, 6, 0xc], [139, 5, 7, 0x1b], [267, 5, 8, 0x1c], [523, 6, 8, 0x3c], [779, 7, 9, 0x7d], [1291, 6, 11, 0x3d], [-32, 9, 32, 0x1fe, "lower"], [3339, 9, 32, 0x1ff], [2, 0x0]];
      break;
    case 10:
      lines = [[-21, 7, 4, 0x7a], [-5, 8, 0, 0xfc], [-4, 7, 0, 0x7b], [-3, 5, 0, 0x18], [-2, 2, 2, 0x0], [2, 5, 0, 0x19], [3, 6, 0, 0x36], [4, 7, 0, 0x7c], [5, 8, 0, 0xfd], [6, 2, 6, 0x1], [70, 5, 5, 0x1a], [102, 6, 5, 0x37], [134, 6, 6, 0x38], [198, 6, 7, 0x39], [326, 6, 8, 0x3a], [582, 6, 9, 0x3b], [1094, 6, 10, 0x3c], [2118, 7, 11, 0x7d], [-22, 8, 32, 0xfe, "lower"], [4166, 8, 32, 0xff], [2, 0x2]];
      break;
    case 11:
      lines = [[1, 1, 0, 0x0], [2, 2, 1, 0x2], [4, 4, 0, 0xc], [5, 4, 1, 0xd], [7, 5, 1, 0x1c], [9, 5, 2, 0x1d], [13, 6, 2, 0x3c], [17, 7, 2, 0x7a], [21, 7, 3, 0x7b], [29, 7, 4, 0x7c], [45, 7, 5, 0x7d], [77, 7, 6, 0x7e], [141, 7, 32, 0x7f]];
      break;
    case 12:
      lines = [[1, 1, 0, 0x0], [2, 2, 0, 0x2], [3, 3, 1, 0x6], [5, 5, 0, 0x1c], [6, 5, 1, 0x1d], [8, 6, 1, 0x3c], [10, 7, 0, 0x7a], [11, 7, 1, 0x7b], [13, 7, 2, 0x7c], [17, 7, 3, 0x7d], [25, 7, 4, 0x7e], [41, 8, 5, 0xfe], [73, 8, 32, 0xff]];
      break;
    case 13:
      lines = [[1, 1, 0, 0x0], [2, 3, 0, 0x4], [3, 4, 0, 0xc], [4, 5, 0, 0x1c], [5, 4, 1, 0xd], [7, 3, 3, 0x5], [15, 6, 1, 0x3a], [17, 6, 2, 0x3b], [21, 6, 3, 0x3c], [29, 6, 4, 0x3d], [45, 6, 5, 0x3e], [77, 7, 6, 0x7e], [141, 7, 32, 0x7f]];
      break;
    case 14:
      lines = [[-2, 3, 0, 0x4], [-1, 3, 0, 0x5], [0, 1, 0, 0x0], [1, 3, 0, 0x6], [2, 3, 0, 0x7]];
      break;
    case 15:
      lines = [[-24, 7, 4, 0x7c], [-8, 6, 2, 0x3c], [-4, 5, 1, 0x1c], [-2, 4, 0, 0xc], [-1, 3, 0, 0x4], [0, 1, 0, 0x0], [1, 3, 0, 0x5], [2, 4, 0, 0xd], [3, 5, 1, 0x1d], [5, 6, 2, 0x3d], [9, 7, 4, 0x7d], [-25, 7, 32, 0x7e, "lower"], [25, 7, 32, 0x7f]];
      break;
    default:
      throw new Jbig2Error(`standard table B.${number} does not exist`);
  }
  for (let i = 0, ii = lines.length; i < ii; i++) {
    lines[i] = new HuffmanLine(lines[i]);
  }
  table = new HuffmanTable(lines, true);
  standardTablesCache[number] = table;
  return table;
}
class Reader {
  constructor(data, start, end) {
    this.data = data;
    this.start = start;
    this.end = end;
    this.position = start;
    this.shift = -1;
    this.currentByte = 0;
  }
  readBit() {
    if (this.shift < 0) {
      if (this.position >= this.end) {
        throw new Jbig2Error("end of data while reading bit");
      }
      this.currentByte = this.data[this.position++];
      this.shift = 7;
    }
    const bit = this.currentByte >> this.shift & 1;
    this.shift--;
    return bit;
  }
  readBits(numBits) {
    let result = 0,
      i;
    for (i = numBits - 1; i >= 0; i--) {
      result |= this.readBit() << i;
    }
    return result;
  }
  byteAlign() {
    this.shift = -1;
  }
  next() {
    if (this.position >= this.end) {
      return -1;
    }
    return this.data[this.position++];
  }
}
function getCustomHuffmanTable(index, referredTo, customTables) {
  let currentIndex = 0;
  for (let i = 0, ii = referredTo.length; i < ii; i++) {
    const table = customTables[referredTo[i]];
    if (table) {
      if (index === currentIndex) {
        return table;
      }
      currentIndex++;
    }
  }
  throw new Jbig2Error("can't find custom Huffman table");
}
function getTextRegionHuffmanTables(textRegion, referredTo, customTables, numberOfSymbols, reader) {
  const codes = [];
  for (let i = 0; i <= 34; i++) {
    const codeLength = reader.readBits(4);
    codes.push(new HuffmanLine([i, codeLength, 0, 0]));
  }
  const runCodesTable = new HuffmanTable(codes, false);
  codes.length = 0;
  for (let i = 0; i < numberOfSymbols;) {
    const codeLength = runCodesTable.decode(reader);
    if (codeLength >= 32) {
      let repeatedLength, numberOfRepeats, j;
      switch (codeLength) {
        case 32:
          if (i === 0) {
            throw new Jbig2Error("no previous value in symbol ID table");
          }
          numberOfRepeats = reader.readBits(2) + 3;
          repeatedLength = codes[i - 1].prefixLength;
          break;
        case 33:
          numberOfRepeats = reader.readBits(3) + 3;
          repeatedLength = 0;
          break;
        case 34:
          numberOfRepeats = reader.readBits(7) + 11;
          repeatedLength = 0;
          break;
        default:
          throw new Jbig2Error("invalid code length in symbol ID table");
      }
      for (j = 0; j < numberOfRepeats; j++) {
        codes.push(new HuffmanLine([i, repeatedLength, 0, 0]));
        i++;
      }
    } else {
      codes.push(new HuffmanLine([i, codeLength, 0, 0]));
      i++;
    }
  }
  reader.byteAlign();
  const symbolIDTable = new HuffmanTable(codes, false);
  let customIndex = 0,
    tableFirstS,
    tableDeltaS,
    tableDeltaT;
  switch (textRegion.huffmanFS) {
    case 0:
    case 1:
      tableFirstS = getStandardTable(textRegion.huffmanFS + 6);
      break;
    case 3:
      tableFirstS = getCustomHuffmanTable(customIndex, referredTo, customTables);
      customIndex++;
      break;
    default:
      throw new Jbig2Error("invalid Huffman FS selector");
  }
  switch (textRegion.huffmanDS) {
    case 0:
    case 1:
    case 2:
      tableDeltaS = getStandardTable(textRegion.huffmanDS + 8);
      break;
    case 3:
      tableDeltaS = getCustomHuffmanTable(customIndex, referredTo, customTables);
      customIndex++;
      break;
    default:
      throw new Jbig2Error("invalid Huffman DS selector");
  }
  switch (textRegion.huffmanDT) {
    case 0:
    case 1:
    case 2:
      tableDeltaT = getStandardTable(textRegion.huffmanDT + 11);
      break;
    case 3:
      tableDeltaT = getCustomHuffmanTable(customIndex, referredTo, customTables);
      customIndex++;
      break;
    default:
      throw new Jbig2Error("invalid Huffman DT selector");
  }
  if (textRegion.refinement) {
    throw new Jbig2Error("refinement with Huffman is not supported");
  }
  return {
    symbolIDTable,
    tableFirstS,
    tableDeltaS,
    tableDeltaT
  };
}
function getSymbolDictionaryHuffmanTables(dictionary, referredTo, customTables) {
  let customIndex = 0,
    tableDeltaHeight,
    tableDeltaWidth;
  switch (dictionary.huffmanDHSelector) {
    case 0:
    case 1:
      tableDeltaHeight = getStandardTable(dictionary.huffmanDHSelector + 4);
      break;
    case 3:
      tableDeltaHeight = getCustomHuffmanTable(customIndex, referredTo, customTables);
      customIndex++;
      break;
    default:
      throw new Jbig2Error("invalid Huffman DH selector");
  }
  switch (dictionary.huffmanDWSelector) {
    case 0:
    case 1:
      tableDeltaWidth = getStandardTable(dictionary.huffmanDWSelector + 2);
      break;
    case 3:
      tableDeltaWidth = getCustomHuffmanTable(customIndex, referredTo, customTables);
      customIndex++;
      break;
    default:
      throw new Jbig2Error("invalid Huffman DW selector");
  }
  let tableBitmapSize, tableAggregateInstances;
  if (dictionary.bitmapSizeSelector) {
    tableBitmapSize = getCustomHuffmanTable(customIndex, referredTo, customTables);
    customIndex++;
  } else {
    tableBitmapSize = getStandardTable(1);
  }
  if (dictionary.aggregationInstancesSelector) {
    tableAggregateInstances = getCustomHuffmanTable(customIndex, referredTo, customTables);
  } else {
    tableAggregateInstances = getStandardTable(1);
  }
  return {
    tableDeltaHeight,
    tableDeltaWidth,
    tableBitmapSize,
    tableAggregateInstances
  };
}
function readUncompressedBitmap(reader, width, height) {
  const bitmap = [];
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(width);
    bitmap.push(row);
    for (let x = 0; x < width; x++) {
      row[x] = reader.readBit();
    }
    reader.byteAlign();
  }
  return bitmap;
}
function decodeMMRBitmap(input, width, height, endOfBlock) {
  const params = {
    K: -1,
    Columns: width,
    Rows: height,
    BlackIs1: true,
    EndOfBlock: endOfBlock
  };
  const decoder = new _ccitt.CCITTFaxDecoder(input, params);
  const bitmap = [];
  let currentByte,
    eof = false;
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(width);
    bitmap.push(row);
    let shift = -1;
    for (let x = 0; x < width; x++) {
      if (shift < 0) {
        currentByte = decoder.readNextChar();
        if (currentByte === -1) {
          currentByte = 0;
          eof = true;
        }
        shift = 7;
      }
      row[x] = currentByte >> shift & 1;
      shift--;
    }
  }
  if (endOfBlock && !eof) {
    const lookForEOFLimit = 5;
    for (let i = 0; i < lookForEOFLimit; i++) {
      if (decoder.readNextChar() === -1) {
        break;
      }
    }
  }
  return bitmap;
}
class Jbig2Image {
  parseChunks(chunks) {
    return parseJbig2Chunks(chunks);
  }
  parse(data) {
    const {
      imgData,
      width,
      height
    } = parseJbig2(data);
    this.width = width;
    this.height = height;
    return imgData;
  }
}
exports.Jbig2Image = Jbig2Image;

/***/ }),
/* 3 */
/***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.XRefParseException = exports.XRefEntryException = exports.ParserEOFException = exports.PDF_VERSION_REGEXP = exports.MissingDataException = void 0;
exports.arrayBuffersToBytes = arrayBuffersToBytes;
exports.collectActions = collectActions;
exports.encodeToXmlString = encodeToXmlString;
exports.escapePDFName = escapePDFName;
exports.escapeString = escapeString;
exports.getArrayLookupTableFactory = getArrayLookupTableFactory;
exports.getInheritableProperty = getInheritableProperty;
exports.getLookupTableFactory = getLookupTableFactory;
exports.getNewAnnotationsMap = getNewAnnotationsMap;
exports.getRotationMatrix = getRotationMatrix;
exports.isAscii = isAscii;
exports.isWhiteSpace = isWhiteSpace;
exports.log2 = log2;
exports.numberToString = numberToString;
exports.parseXFAPath = parseXFAPath;
exports.readInt8 = readInt8;
exports.readUint16 = readUint16;
exports.readUint32 = readUint32;
exports.recoverJsURL = recoverJsURL;
exports.stringToUTF16HexString = stringToUTF16HexString;
exports.stringToUTF16String = stringToUTF16String;
exports.toRomanNumerals = toRomanNumerals;
exports.validateCSSFont = validateCSSFont;
var _util = __w_pdfjs_require__(1);
var _primitives = __w_pdfjs_require__(4);
var _base_stream = __w_pdfjs_require__(5);
const PDF_VERSION_REGEXP = /^[1-9]\.\d$/;
exports.PDF_VERSION_REGEXP = PDF_VERSION_REGEXP;
function getLookupTableFactory(initializer) {
  let lookup;
  return function () {
    if (initializer) {
      lookup = Object.create(null);
      initializer(lookup);
      initializer = null;
    }
    return lookup;
  };
}
function getArrayLookupTableFactory(initializer) {
  let lookup;
  return function () {
    if (initializer) {
      let arr = initializer();
      initializer = null;
      lookup = Object.create(null);
      for (let i = 0, ii = arr.length; i < ii; i += 2) {
        lookup[arr[i]] = arr[i + 1];
      }
      arr = null;
    }
    return lookup;
  };
}
class MissingDataException extends _util.BaseException {
  constructor(begin, end) {
    super(`Missing data [${begin}, ${end})`, "MissingDataException");
    this.begin = begin;
    this.end = end;
  }
}
exports.MissingDataException = MissingDataException;
class ParserEOFException extends _util.BaseException {
  constructor(msg) {
    super(msg, "ParserEOFException");
  }
}
exports.ParserEOFException = ParserEOFException;
class XRefEntryException extends _util.BaseException {
  constructor(msg) {
    super(msg, "XRefEntryException");
  }
}
exports.XRefEntryException = XRefEntryException;
class XRefParseException extends _util.BaseException {
  constructor(msg) {
    super(msg, "XRefParseException");
  }
}
exports.XRefParseException = XRefParseException;
function arrayBuffersToBytes(arr) {
  const length = arr.length;
  if (length === 0) {
    return new Uint8Array(0);
  }
  if (length === 1) {
    return new Uint8Array(arr[0]);
  }
  let dataLength = 0;
  for (let i = 0; i < length; i++) {
    dataLength += arr[i].byteLength;
  }
  const data = new Uint8Array(dataLength);
  let pos = 0;
  for (let i = 0; i < length; i++) {
    const item = new Uint8Array(arr[i]);
    data.set(item, pos);
    pos += item.byteLength;
  }
  return data;
}
function getInheritableProperty({
  dict,
  key,
  getArray = false,
  stopWhenFound = true
}) {
  let values;
  const visited = new _primitives.RefSet();
  while (dict instanceof _primitives.Dict && !(dict.objId && visited.has(dict.objId))) {
    if (dict.objId) {
      visited.put(dict.objId);
    }
    const value = getArray ? dict.getArray(key) : dict.get(key);
    if (value !== undefined) {
      if (stopWhenFound) {
        return value;
      }
      if (!values) {
        values = [];
      }
      values.push(value);
    }
    dict = dict.get("Parent");
  }
  return values;
}
const ROMAN_NUMBER_MAP = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM", "", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC", "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
function toRomanNumerals(number, lowerCase = false) {
  (0, _util.assert)(Number.isInteger(number) && number > 0, "The number should be a positive integer.");
  const romanBuf = [];
  let pos;
  while (number >= 1000) {
    number -= 1000;
    romanBuf.push("M");
  }
  pos = number / 100 | 0;
  number %= 100;
  romanBuf.push(ROMAN_NUMBER_MAP[pos]);
  pos = number / 10 | 0;
  number %= 10;
  romanBuf.push(ROMAN_NUMBER_MAP[10 + pos]);
  romanBuf.push(ROMAN_NUMBER_MAP[20 + number]);
  const romanStr = romanBuf.join("");
  return lowerCase ? romanStr.toLowerCase() : romanStr;
}
function log2(x) {
  if (x <= 0) {
    return 0;
  }
  return Math.ceil(Math.log2(x));
}
function readInt8(data, offset) {
  return data[offset] << 24 >> 24;
}
function readUint16(data, offset) {
  return data[offset] << 8 | data[offset + 1];
}
function readUint32(data, offset) {
  return (data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]) >>> 0;
}
function isWhiteSpace(ch) {
  return ch === 0x20 || ch === 0x09 || ch === 0x0d || ch === 0x0a;
}
function parseXFAPath(path) {
  const positionPattern = /(.+)\[(\d+)\]$/;
  return path.split(".").map(component => {
    const m = component.match(positionPattern);
    if (m) {
      return {
        name: m[1],
        pos: parseInt(m[2], 10)
      };
    }
    return {
      name: component,
      pos: 0
    };
  });
}
function escapePDFName(str) {
  const buffer = [];
  let start = 0;
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.charCodeAt(i);
    if (char < 0x21 || char > 0x7e || char === 0x23 || char === 0x28 || char === 0x29 || char === 0x3c || char === 0x3e || char === 0x5b || char === 0x5d || char === 0x7b || char === 0x7d || char === 0x2f || char === 0x25) {
      if (start < i) {
        buffer.push(str.substring(start, i));
      }
      buffer.push(`#${char.toString(16)}`);
      start = i + 1;
    }
  }
  if (buffer.length === 0) {
    return str;
  }
  if (start < str.length) {
    buffer.push(str.substring(start, str.length));
  }
  return buffer.join("");
}
function escapeString(str) {
  return str.replace(/([()\\\n\r])/g, match => {
    if (match === "\n") {
      return "\\n";
    } else if (match === "\r") {
      return "\\r";
    }
    return `\\${match}`;
  });
}
function _collectJS(entry, xref, list, parents) {
  if (!entry) {
    return;
  }
  let parent = null;
  if (entry instanceof _primitives.Ref) {
    if (parents.has(entry)) {
      return;
    }
    parent = entry;
    parents.put(parent);
    entry = xref.fetch(entry);
  }
  if (Array.isArray(entry)) {
    for (const element of entry) {
      _collectJS(element, xref, list, parents);
    }
  } else if (entry instanceof _primitives.Dict) {
    if ((0, _primitives.isName)(entry.get("S"), "JavaScript")) {
      const js = entry.get("JS");
      let code;
      if (js instanceof _base_stream.BaseStream) {
        code = js.getString();
      } else if (typeof js === "string") {
        code = js;
      }
      code = code && (0, _util.stringToPDFString)(code).replace(/\u0000/g, "");
      if (code) {
        list.push(code);
      }
    }
    _collectJS(entry.getRaw("Next"), xref, list, parents);
  }
  if (parent) {
    parents.remove(parent);
  }
}
function collectActions(xref, dict, eventType) {
  const actions = Object.create(null);
  const additionalActionsDicts = getInheritableProperty({
    dict,
    key: "AA",
    stopWhenFound: false
  });
  if (additionalActionsDicts) {
    for (let i = additionalActionsDicts.length - 1; i >= 0; i--) {
      const additionalActions = additionalActionsDicts[i];
      if (!(additionalActions instanceof _primitives.Dict)) {
        continue;
      }
      for (const key of additionalActions.getKeys()) {
        const action = eventType[key];
        if (!action) {
          continue;
        }
        const actionDict = additionalActions.getRaw(key);
        const parents = new _primitives.RefSet();
        const list = [];
        _collectJS(actionDict, xref, list, parents);
        if (list.length > 0) {
          actions[action] = list;
        }
      }
    }
  }
  if (dict.has("A")) {
    const actionDict = dict.get("A");
    const parents = new _primitives.RefSet();
    const list = [];
    _collectJS(actionDict, xref, list, parents);
    if (list.length > 0) {
      actions.Action = list;
    }
  }
  return (0, _util.objectSize)(actions) > 0 ? actions : null;
}
const XMLEntities = {
  0x3c: "&lt;",
  0x3e: "&gt;",
  0x26: "&amp;",
  0x22: "&quot;",
  0x27: "&apos;"
};
function encodeToXmlString(str) {
  const buffer = [];
  let start = 0;
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.codePointAt(i);
    if (0x20 <= char && char <= 0x7e) {
      const entity = XMLEntities[char];
      if (entity) {
        if (start < i) {
          buffer.push(str.substring(start, i));
        }
        buffer.push(entity);
        start = i + 1;
      }
    } else {
      if (start < i) {
        buffer.push(str.substring(start, i));
      }
      buffer.push(`&#x${char.toString(16).toUpperCase()};`);
      if (char > 0xd7ff && (char < 0xe000 || char > 0xfffd)) {
        i++;
      }
      start = i + 1;
    }
  }
  if (buffer.length === 0) {
    return str;
  }
  if (start < str.length) {
    buffer.push(str.substring(start, str.length));
  }
  return buffer.join("");
}
function validateCSSFont(cssFontInfo) {
  const DEFAULT_CSS_FONT_OBLIQUE = "14";
  const DEFAULT_CSS_FONT_WEIGHT = "400";
  const CSS_FONT_WEIGHT_VALUES = new Set(["100", "200", "300", "400", "500", "600", "700", "800", "900", "1000", "normal", "bold", "bolder", "lighter"]);
  const {
    fontFamily,
    fontWeight,
    italicAngle
  } = cssFontInfo;
  if (/^".*"$/.test(fontFamily)) {
    if (/[^\\]"/.test(fontFamily.slice(1, fontFamily.length - 1))) {
      (0, _util.warn)(`XFA - FontFamily contains some unescaped ": ${fontFamily}.`);
      return false;
    }
  } else if (/^'.*'$/.test(fontFamily)) {
    if (/[^\\]'/.test(fontFamily.slice(1, fontFamily.length - 1))) {
      (0, _util.warn)(`XFA - FontFamily contains some unescaped ': ${fontFamily}.`);
      return false;
    }
  } else {
    for (const ident of fontFamily.split(/[ \t]+/)) {
      if (/^(\d|(-(\d|-)))/.test(ident) || !/^[\w-\\]+$/.test(ident)) {
        (0, _util.warn)(`XFA - FontFamily contains some invalid <custom-ident>: ${fontFamily}.`);
        return false;
      }
    }
  }
  const weight = fontWeight ? fontWeight.toString() : "";
  cssFontInfo.fontWeight = CSS_FONT_WEIGHT_VALUES.has(weight) ? weight : DEFAULT_CSS_FONT_WEIGHT;
  const angle = parseFloat(italicAngle);
  cssFontInfo.italicAngle = isNaN(angle) || angle < -90 || angle > 90 ? DEFAULT_CSS_FONT_OBLIQUE : italicAngle.toString();
  return true;
}
function recoverJsURL(str) {
  const URL_OPEN_METHODS = ["app.launchURL", "window.open", "xfa.host.gotoURL"];
  const regex = new RegExp("^\\s*(" + URL_OPEN_METHODS.join("|").split(".").join("\\.") + ")\\((?:'|\")([^'\"]*)(?:'|\")(?:,\\s*(\\w+)\\)|\\))", "i");
  const jsUrl = regex.exec(str);
  if (jsUrl && jsUrl[2]) {
    const url = jsUrl[2];
    let newWindow = false;
    if (jsUrl[3] === "true" && jsUrl[1] === "app.launchURL") {
      newWindow = true;
    }
    return {
      url,
      newWindow
    };
  }
  return null;
}
function numberToString(value) {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  const roundedValue = Math.round(value * 100);
  if (roundedValue % 100 === 0) {
    return (roundedValue / 100).toString();
  }
  if (roundedValue % 10 === 0) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}
function getNewAnnotationsMap(annotationStorage) {
  if (!annotationStorage) {
    return null;
  }
  const newAnnotationsByPage = new Map();
  for (const [key, value] of annotationStorage) {
    if (!key.startsWith(_util.AnnotationEditorPrefix)) {
      continue;
    }
    let annotations = newAnnotationsByPage.get(value.pageIndex);
    if (!annotations) {
      annotations = [];
      newAnnotationsByPage.set(value.pageIndex, annotations);
    }
    annotations.push(value);
  }
  return newAnnotationsByPage.size > 0 ? newAnnotationsByPage : null;
}
function isAscii(str) {
  return /^[\x00-\x7F]*$/.test(str);
}
function stringToUTF16HexString(str) {
  const buf = [];
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.charCodeAt(i);
    buf.push((char >> 8 & 0xff).toString(16).padStart(2, "0"), (char & 0xff).toString(16).padStart(2, "0"));
  }
  return buf.join("");
}
function stringToUTF16String(str, bigEndian = false) {
  const buf = [];
  if (bigEndian) {
    buf.push("\xFE\xFF");
  }
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.charCodeAt(i);
    buf.push(String.fromCharCode(char >> 8 & 0xff), String.fromCharCode(char & 0xff));
  }
  return buf.join("");
}
function getRotationMatrix(rotation, width, height) {
  switch (rotation) {
    case 90:
      return [0, 1, -1, 0, width, 0];
    case 180:
      return [-1, 0, 0, -1, width, height];
    case 270:
      return [0, -1, 1, 0, 0, height];
    default:
      throw new Error("Invalid rotation");
  }
}

/***/ }),
/* 4 */
/***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.RefSetCache = exports.RefSet = exports.Ref = exports.Name = exports.EOF = exports.Dict = exports.Cmd = exports.CIRCULAR_REF = void 0;
exports.clearPrimitiveCaches = clearPrimitiveCaches;
exports.isCmd = isCmd;
exports.isDict = isDict;
exports.isName = isName;
exports.isRefsEqual = isRefsEqual;
var _util = __w_pdfjs_require__(1);
const CIRCULAR_REF = Symbol("CIRCULAR_REF");
exports.CIRCULAR_REF = CIRCULAR_REF;
const EOF = Symbol("EOF");
exports.EOF = EOF;
const Name = function NameClosure() {
  let nameCache = Object.create(null);
  class Name {
    constructor(name) {
      this.name = name;
    }
    static get(name) {
      return nameCache[name] || (nameCache[name] = new Name(name));
    }
    static _clearCache() {
      nameCache = Object.create(null);
    }
  }
  return Name;
}();
exports.Name = Name;
const Cmd = function CmdClosure() {
  let cmdCache = Object.create(null);
  class Cmd {
    constructor(cmd) {
      this.cmd = cmd;
    }
    static get(cmd) {
      return cmdCache[cmd] || (cmdCache[cmd] = new Cmd(cmd));
    }
    static _clearCache() {
      cmdCache = Object.create(null);
    }
  }
  return Cmd;
}();
exports.Cmd = Cmd;
const nonSerializable = function nonSerializableClosure() {
  return nonSerializable;
};
class Dict {
  constructor(xref = null) {
    this._map = Object.create(null);
    this.xref = xref;
    this.objId = null;
    this.suppressEncryption = false;
    this.__nonSerializable__ = nonSerializable;
  }
  assignXref(newXref) {
    this.xref = newXref;
  }
  get size() {
    return Object.keys(this._map).length;
  }
  get(key1, key2, key3) {
    let value = this._map[key1];
    if (value === undefined && key2 !== undefined) {
      value = this._map[key2];
      if (value === undefined && key3 !== undefined) {
        value = this._map[key3];
      }
    }
    if (value instanceof Ref && this.xref) {
      return this.xref.fetch(value, this.suppressEncryption);
    }
    return value;
  }
  async getAsync(key1, key2, key3) {
    let value = this._map[key1];
    if (value === undefined && key2 !== undefined) {
      value = this._map[key2];
      if (value === undefined && key3 !== undefined) {
        value = this._map[key3];
      }
    }
    if (value instanceof Ref && this.xref) {
      return this.xref.fetchAsync(value, this.suppressEncryption);
    }
    return value;
  }
  getArray(key1, key2, key3) {
    let value = this._map[key1];
    if (value === undefined && key2 !== undefined) {
      value = this._map[key2];
      if (value === undefined && key3 !== undefined) {
        value = this._map[key3];
      }
    }
    if (value instanceof Ref && this.xref) {
      value = this.xref.fetch(value, this.suppressEncryption);
    }
    if (Array.isArray(value)) {
      value = value.slice();
      for (let i = 0, ii = value.length; i < ii; i++) {
        if (value[i] instanceof Ref && this.xref) {
          value[i] = this.xref.fetch(value[i], this.suppressEncryption);
        }
      }
    }
    return value;
  }
  getRaw(key) {
    return this._map[key];
  }
  getKeys() {
    return Object.keys(this._map);
  }
  getRawValues() {
    return Object.values(this._map);
  }
  set(key, value) {
    this._map[key] = value;
  }
  has(key) {
    return this._map[key] !== undefined;
  }
  forEach(callback) {
    for (const key in this._map) {
      callback(key, this.get(key));
    }
  }
  static get empty() {
    const emptyDict = new Dict(null);
    emptyDict.set = (key, value) => {
      (0, _util.unreachable)("Should not call `set` on the empty dictionary.");
    };
    return (0, _util.shadow)(this, "empty", emptyDict);
  }
  static merge({
    xref,
    dictArray,
    mergeSubDicts = false
  }) {
    const mergedDict = new Dict(xref),
      properties = new Map();
    for (const dict of dictArray) {
      if (!(dict instanceof Dict)) {
        continue;
      }
      for (const [key, value] of Object.entries(dict._map)) {
        let property = properties.get(key);
        if (property === undefined) {
          property = [];
          properties.set(key, property);
        } else if (!mergeSubDicts || !(value instanceof Dict)) {
          continue;
        }
        property.push(value);
      }
    }
    for (const [name, values] of properties) {
      if (values.length === 1 || !(values[0] instanceof Dict)) {
        mergedDict._map[name] = values[0];
        continue;
      }
      const subDict = new Dict(xref);
      for (const dict of values) {
        for (const [key, value] of Object.entries(dict._map)) {
          if (subDict._map[key] === undefined) {
            subDict._map[key] = value;
          }
        }
      }
      if (subDict.size > 0) {
        mergedDict._map[name] = subDict;
      }
    }
    properties.clear();
    return mergedDict.size > 0 ? mergedDict : Dict.empty;
  }
}
exports.Dict = Dict;
const Ref = function RefClosure() {
  let refCache = Object.create(null);
  class Ref {
    constructor(num, gen) {
      this.num = num;
      this.gen = gen;
    }
    toString() {
      if (this.gen === 0) {
        return `${this.num}R`;
      }
      return `${this.num}R${this.gen}`;
    }
    static get(num, gen) {
      const key = gen === 0 ? `${num}R` : `${num}R${gen}`;
      return refCache[key] || (refCache[key] = new Ref(num, gen));
    }
    static _clearCache() {
      refCache = Object.create(null);
    }
  }
  return Ref;
}();
exports.Ref = Ref;
class RefSet {
  constructor(parent = null) {
    this._set = new Set(parent && parent._set);
  }
  has(ref) {
    return this._set.has(ref.toString());
  }
  put(ref) {
    this._set.add(ref.toString());
  }
  remove(ref) {
    this._set.delete(ref.toString());
  }
  [Symbol.iterator]() {
    return this._set.values();
  }
  clear() {
    this._set.clear();
  }
}
exports.RefSet = RefSet;
class RefSetCache {
  constructor() {
    this._map = new Map();
  }
  get size() {
    return this._map.size;
  }
  get(ref) {
    return this._map.get(ref.toString());
  }
  has(ref) {
    return this._map.has(ref.toString());
  }
  put(ref, obj) {
    this._map.set(ref.toString(), obj);
  }
  putAlias(ref, aliasRef) {
    this._map.set(ref.toString(), this.get(aliasRef));
  }
  [Symbol.iterator]() {
    return this._map.values();
  }
  clear() {
    this._map.clear();
  }
}
exports.RefSetCache = RefSetCache;
function isName(v, name) {
  return v instanceof Name && (name === undefined || v.name === name);
}
function isCmd(v, cmd) {
  return v instanceof Cmd && (cmd === undefined || v.cmd === cmd);
}
function isDict(v, type) {
  return v instanceof Dict && (type === undefined || isName(v.get("Type"), type));
}
function isRefsEqual(v1, v2) {
  return v1.num === v2.num && v1.gen === v2.gen;
}
function clearPrimitiveCaches() {
  Cmd._clearCache();
  Name._clearCache();
  Ref._clearCache();
}

/***/ }),
/* 5 */
/***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.BaseStream = void 0;
var _util = __w_pdfjs_require__(1);
class BaseStream {
  constructor() {
    if (this.constructor === BaseStream) {
      (0, _util.unreachable)("Cannot initialize BaseStream.");
    }
  }
  get length() {
    (0, _util.unreachable)("Abstract getter `length` accessed");
  }
  get isEmpty() {
    (0, _util.unreachable)("Abstract getter `isEmpty` accessed");
  }
  get isDataLoaded() {
    return (0, _util.shadow)(this, "isDataLoaded", true);
  }
  getByte() {
    (0, _util.unreachable)("Abstract method `getByte` called");
  }
  getBytes(length) {
    (0, _util.unreachable)("Abstract method `getBytes` called");
  }
  peekByte() {
    const peekedByte = this.getByte();
    if (peekedByte !== -1) {
      this.pos--;
    }
    return peekedByte;
  }
  peekBytes(length) {
    const bytes = this.getBytes(length);
    this.pos -= bytes.length;
    return bytes;
  }
  getUint16() {
    const b0 = this.getByte();
    const b1 = this.getByte();
    if (b0 === -1 || b1 === -1) {
      return -1;
    }
    return (b0 << 8) + b1;
  }
  getInt32() {
    const b0 = this.getByte();
    const b1 = this.getByte();
    const b2 = this.getByte();
    const b3 = this.getByte();
    return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
  }
  getByteRange(begin, end) {
    (0, _util.unreachable)("Abstract method `getByteRange` called");
  }
  getString(length) {
    return (0, _util.bytesToString)(this.getBytes(length));
  }
  skip(n) {
    this.pos += n || 1;
  }
  reset() {
    (0, _util.unreachable)("Abstract method `reset` called");
  }
  moveStart() {
    (0, _util.unreachable)("Abstract method `moveStart` called");
  }
  makeSubStream(start, length, dict = null) {
    (0, _util.unreachable)("Abstract method `makeSubStream` called");
  }
  getBaseStreams() {
    return null;
  }
}
exports.BaseStream = BaseStream;

/***/ }),
/* 6 */
/***/ ((__unused_webpack_module, exports) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.ArithmeticDecoder = void 0;
const QeTable = [{
  qe: 0x5601,
  nmps: 1,
  nlps: 1,
  switchFlag: 1
}, {
  qe: 0x3401,
  nmps: 2,
  nlps: 6,
  switchFlag: 0
}, {
  qe: 0x1801,
  nmps: 3,
  nlps: 9,
  switchFlag: 0
}, {
  qe: 0x0ac1,
  nmps: 4,
  nlps: 12,
  switchFlag: 0
}, {
  qe: 0x0521,
  nmps: 5,
  nlps: 29,
  switchFlag: 0
}, {
  qe: 0x0221,
  nmps: 38,
  nlps: 33,
  switchFlag: 0
}, {
  qe: 0x5601,
  nmps: 7,
  nlps: 6,
  switchFlag: 1
}, {
  qe: 0x5401,
  nmps: 8,
  nlps: 14,
  switchFlag: 0
}, {
  qe: 0x4801,
  nmps: 9,
  nlps: 14,
  switchFlag: 0
}, {
  qe: 0x3801,
  nmps: 10,
  nlps: 14,
  switchFlag: 0
}, {
  qe: 0x3001,
  nmps: 11,
  nlps: 17,
  switchFlag: 0
}, {
  qe: 0x2401,
  nmps: 12,
  nlps: 18,
  switchFlag: 0
}, {
  qe: 0x1c01,
  nmps: 13,
  nlps: 20,
  switchFlag: 0
}, {
  qe: 0x1601,
  nmps: 29,
  nlps: 21,
  switchFlag: 0
}, {
  qe: 0x5601,
  nmps: 15,
  nlps: 14,
  switchFlag: 1
}, {
  qe: 0x5401,
  nmps: 16,
  nlps: 14,
  switchFlag: 0
}, {
  qe: 0x5101,
  nmps: 17,
  nlps: 15,
  switchFlag: 0
}, {
  qe: 0x4801,
  nmps: 18,
  nlps: 16,
  switchFlag: 0
}, {
  qe: 0x3801,
  nmps: 19,
  nlps: 17,
  switchFlag: 0
}, {
  qe: 0x3401,
  nmps: 20,
  nlps: 18,
  switchFlag: 0
}, {
  qe: 0x3001,
  nmps: 21,
  nlps: 19,
  switchFlag: 0
}, {
  qe: 0x2801,
  nmps: 22,
  nlps: 19,
  switchFlag: 0
}, {
  qe: 0x2401,
  nmps: 23,
  nlps: 20,
  switchFlag: 0
}, {
  qe: 0x2201,
  nmps: 24,
  nlps: 21,
  switchFlag: 0
}, {
  qe: 0x1c01,
  nmps: 25,
  nlps: 22,
  switchFlag: 0
}, {
  qe: 0x1801,
  nmps: 26,
  nlps: 23,
  switchFlag: 0
}, {
  qe: 0x1601,
  nmps: 27,
  nlps: 24,
  switchFlag: 0
}, {
  qe: 0x1401,
  nmps: 28,
  nlps: 25,
  switchFlag: 0
}, {
  qe: 0x1201,
  nmps: 29,
  nlps: 26,
  switchFlag: 0
}, {
  qe: 0x1101,
  nmps: 30,
  nlps: 27,
  switchFlag: 0
}, {
  qe: 0x0ac1,
  nmps: 31,
  nlps: 28,
  switchFlag: 0
}, {
  qe: 0x09c1,
  nmps: 32,
  nlps: 29,
  switchFlag: 0
}, {
  qe: 0x08a1,
  nmps: 33,
  nlps: 30,
  switchFlag: 0
}, {
  qe: 0x0521,
  nmps: 34,
  nlps: 31,
  switchFlag: 0
}, {
  qe: 0x0441,
  nmps: 35,
  nlps: 32,
  switchFlag: 0
}, {
  qe: 0x02a1,
  nmps: 36,
  nlps: 33,
  switchFlag: 0
}, {
  qe: 0x0221,
  nmps: 37,
  nlps: 34,
  switchFlag: 0
}, {
  qe: 0x0141,
  nmps: 38,
  nlps: 35,
  switchFlag: 0
}, {
  qe: 0x0111,
  nmps: 39,
  nlps: 36,
  switchFlag: 0
}, {
  qe: 0x0085,
  nmps: 40,
  nlps: 37,
  switchFlag: 0
}, {
  qe: 0x0049,
  nmps: 41,
  nlps: 38,
  switchFlag: 0
}, {
  qe: 0x0025,
  nmps: 42,
  nlps: 39,
  switchFlag: 0
}, {
  qe: 0x0015,
  nmps: 43,
  nlps: 40,
  switchFlag: 0
}, {
  qe: 0x0009,
  nmps: 44,
  nlps: 41,
  switchFlag: 0
}, {
  qe: 0x0005,
  nmps: 45,
  nlps: 42,
  switchFlag: 0
}, {
  qe: 0x0001,
  nmps: 45,
  nlps: 43,
  switchFlag: 0
}, {
  qe: 0x5601,
  nmps: 46,
  nlps: 46,
  switchFlag: 0
}];
class ArithmeticDecoder {
  constructor(data, start, end) {
    this.data = data;
    this.bp = start;
    this.dataEnd = end;
    this.chigh = data[start];
    this.clow = 0;
    this.byteIn();
    this.chigh = this.chigh << 7 & 0xffff | this.clow >> 9 & 0x7f;
    this.clow = this.clow << 7 & 0xffff;
    this.ct -= 7;
    this.a = 0x8000;
  }
  byteIn() {
    const data = this.data;
    let bp = this.bp;
    if (data[bp] === 0xff) {
      if (data[bp + 1] > 0x8f) {
        this.clow += 0xff00;
        this.ct = 8;
      } else {
        bp++;
        this.clow += data[bp] << 9;
        this.ct = 7;
        this.bp = bp;
      }
    } else {
      bp++;
      this.clow += bp < this.dataEnd ? data[bp] << 8 : 0xff00;
      this.ct = 8;
      this.bp = bp;
    }
    if (this.clow > 0xffff) {
      this.chigh += this.clow >> 16;
      this.clow &= 0xffff;
    }
  }
  readBit(contexts, pos) {
    let cx_index = contexts[pos] >> 1,
      cx_mps = contexts[pos] & 1;
    const qeTableIcx = QeTable[cx_index];
    const qeIcx = qeTableIcx.qe;
    let d;
    let a = this.a - qeIcx;
    if (this.chigh < qeIcx) {
      if (a < qeIcx) {
        a = qeIcx;
        d = cx_mps;
        cx_index = qeTableIcx.nmps;
      } else {
        a = qeIcx;
        d = 1 ^ cx_mps;
        if (qeTableIcx.switchFlag === 1) {
          cx_mps = d;
        }
        cx_index = qeTableIcx.nlps;
      }
    } else {
      this.chigh -= qeIcx;
      if ((a & 0x8000) !== 0) {
        this.a = a;
        return cx_mps;
      }
      if (a < qeIcx) {
        d = 1 ^ cx_mps;
        if (qeTableIcx.switchFlag === 1) {
          cx_mps = d;
        }
        cx_index = qeTableIcx.nlps;
      } else {
        d = cx_mps;
        cx_index = qeTableIcx.nmps;
      }
    }
    do {
      if (this.ct === 0) {
        this.byteIn();
      }
      a <<= 1;
      this.chigh = this.chigh << 1 & 0xffff | this.clow >> 15 & 1;
      this.clow = this.clow << 1 & 0xffff;
      this.ct--;
    } while ((a & 0x8000) === 0);
    this.a = a;
    contexts[pos] = cx_index << 1 | cx_mps;
    return d;
  }
}
exports.ArithmeticDecoder = ArithmeticDecoder;

/***/ }),
/* 7 */
/***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.CCITTFaxDecoder = void 0;
var _util = __w_pdfjs_require__(1);
const ccittEOL = -2;
const ccittEOF = -1;
const twoDimPass = 0;
const twoDimHoriz = 1;
const twoDimVert0 = 2;
const twoDimVertR1 = 3;
const twoDimVertL1 = 4;
const twoDimVertR2 = 5;
const twoDimVertL2 = 6;
const twoDimVertR3 = 7;
const twoDimVertL3 = 8;
const twoDimTable = [[-1, -1], [-1, -1], [7, twoDimVertL3], [7, twoDimVertR3], [6, twoDimVertL2], [6, twoDimVertL2], [6, twoDimVertR2], [6, twoDimVertR2], [4, twoDimPass], [4, twoDimPass], [4, twoDimPass], [4, twoDimPass], [4, twoDimPass], [4, twoDimPass], [4, twoDimPass], [4, twoDimPass], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimHoriz], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertL1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [3, twoDimVertR1], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0], [1, twoDimVert0]];
const whiteTable1 = [[-1, -1], [12, ccittEOL], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [11, 1792], [11, 1792], [12, 1984], [12, 2048], [12, 2112], [12, 2176], [12, 2240], [12, 2304], [11, 1856], [11, 1856], [11, 1920], [11, 1920], [12, 2368], [12, 2432], [12, 2496], [12, 2560]];
const whiteTable2 = [[-1, -1], [-1, -1], [-1, -1], [-1, -1], [8, 29], [8, 29], [8, 30], [8, 30], [8, 45], [8, 45], [8, 46], [8, 46], [7, 22], [7, 22], [7, 22], [7, 22], [7, 23], [7, 23], [7, 23], [7, 23], [8, 47], [8, 47], [8, 48], [8, 48], [6, 13], [6, 13], [6, 13], [6, 13], [6, 13], [6, 13], [6, 13], [6, 13], [7, 20], [7, 20], [7, 20], [7, 20], [8, 33], [8, 33], [8, 34], [8, 34], [8, 35], [8, 35], [8, 36], [8, 36], [8, 37], [8, 37], [8, 38], [8, 38], [7, 19], [7, 19], [7, 19], [7, 19], [8, 31], [8, 31], [8, 32], [8, 32], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1], [6, 12], [6, 12], [6, 12], [6, 12], [6, 12], [6, 12], [6, 12], [6, 12], [8, 53], [8, 53], [8, 54], [8, 54], [7, 26], [7, 26], [7, 26], [7, 26], [8, 39], [8, 39], [8, 40], [8, 40], [8, 41], [8, 41], [8, 42], [8, 42], [8, 43], [8, 43], [8, 44], [8, 44], [7, 21], [7, 21], [7, 21], [7, 21], [7, 28], [7, 28], [7, 28], [7, 28], [8, 61], [8, 61], [8, 62], [8, 62], [8, 63], [8, 63], [8, 0], [8, 0], [8, 320], [8, 320], [8, 384], [8, 384], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [5, 11], [7, 27], [7, 27], [7, 27], [7, 27], [8, 59], [8, 59], [8, 60], [8, 60], [9, 1472], [9, 1536], [9, 1600], [9, 1728], [7, 18], [7, 18], [7, 18], [7, 18], [7, 24], [7, 24], [7, 24], [7, 24], [8, 49], [8, 49], [8, 50], [8, 50], [8, 51], [8, 51], [8, 52], [8, 52], [7, 25], [7, 25], [7, 25], [7, 25], [8, 55], [8, 55], [8, 56], [8, 56], [8, 57], [8, 57], [8, 58], [8, 58], [6, 192], [6, 192], [6, 192], [6, 192], [6, 192], [6, 192], [6, 192], [6, 192], [6, 1664], [6, 1664], [6, 1664], [6, 1664], [6, 1664], [6, 1664], [6, 1664], [6, 1664], [8, 448], [8, 448], [8, 512], [8, 512], [9, 704], [9, 768], [8, 640], [8, 640], [8, 576], [8, 576], [9, 832], [9, 896], [9, 960], [9, 1024], [9, 1088], [9, 1152], [9, 1216], [9, 1280], [9, 1344], [9, 1408], [7, 256], [7, 256], [7, 256], [7, 256], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 128], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 8], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [6, 16], [6, 16], [6, 16], [6, 16], [6, 16], [6, 16], [6, 16], [6, 16], [6, 17], [6, 17], [6, 17], [6, 17], [6, 17], [6, 17], [6, 17], [6, 17], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [4, 5], [6, 14], [6, 14], [6, 14], [6, 14], [6, 14], [6, 14], [6, 14], [6, 14], [6, 15], [6, 15], [6, 15], [6, 15], [6, 15], [6, 15], [6, 15], [6, 15], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [5, 64], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 6], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7]];
const blackTable1 = [[-1, -1], [-1, -1], [12, ccittEOL], [12, ccittEOL], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1], [11, 1792], [11, 1792], [11, 1792], [11, 1792], [12, 1984], [12, 1984], [12, 2048], [12, 2048], [12, 2112], [12, 2112], [12, 2176], [12, 2176], [12, 2240], [12, 2240], [12, 2304], [12, 2304], [11, 1856], [11, 1856], [11, 1856], [11, 1856], [11, 1920], [11, 1920], [11, 1920], [11, 1920], [12, 2368], [12, 2368], [12, 2432], [12, 2432], [12, 2496], [12, 2496], [12, 2560], [12, 2560], [10, 18], [10, 18], [10, 18], [10, 18], [10, 18], [10, 18], [10, 18], [10, 18], [12, 52], [12, 52], [13, 640], [13, 704], [13, 768], [13, 832], [12, 55], [12, 55], [12, 56], [12, 56], [13, 1280], [13, 1344], [13, 1408], [13, 1472], [12, 59], [12, 59], [12, 60], [12, 60], [13, 1536], [13, 1600], [11, 24], [11, 24], [11, 24], [11, 24], [11, 25], [11, 25], [11, 25], [11, 25], [13, 1664], [13, 1728], [12, 320], [12, 320], [12, 384], [12, 384], [12, 448], [12, 448], [13, 512], [13, 576], [12, 53], [12, 53], [12, 54], [12, 54], [13, 896], [13, 960], [13, 1024], [13, 1088], [13, 1152], [13, 1216], [10, 64], [10, 64], [10, 64], [10, 64], [10, 64], [10, 64], [10, 64], [10, 64]];
const blackTable2 = [[8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [8, 13], [11, 23], [11, 23], [12, 50], [12, 51], [12, 44], [12, 45], [12, 46], [12, 47], [12, 57], [12, 58], [12, 61], [12, 256], [10, 16], [10, 16], [10, 16], [10, 16], [10, 17], [10, 17], [10, 17], [10, 17], [12, 48], [12, 49], [12, 62], [12, 63], [12, 30], [12, 31], [12, 32], [12, 33], [12, 40], [12, 41], [11, 22], [11, 22], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [7, 11], [9, 15], [9, 15], [9, 15], [9, 15], [9, 15], [9, 15], [9, 15], [9, 15], [12, 128], [12, 192], [12, 26], [12, 27], [12, 28], [12, 29], [11, 19], [11, 19], [11, 20], [11, 20], [12, 34], [12, 35], [12, 36], [12, 37], [12, 38], [12, 39], [11, 21], [11, 21], [12, 42], [12, 43], [10, 0], [10, 0], [10, 0], [10, 0], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12], [7, 12]];
const blackTable3 = [[-1, -1], [-1, -1], [-1, -1], [-1, -1], [6, 9], [6, 8], [5, 7], [5, 7], [4, 6], [4, 6], [4, 6], [4, 6], [4, 5], [4, 5], [4, 5], [4, 5], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2]];
class CCITTFaxDecoder {
  constructor(source, options = {}) {
    if (!source || typeof source.next !== "function") {
      throw new Error('CCITTFaxDecoder - invalid "source" parameter.');
    }
    this.source = source;
    this.eof = false;
    this.encoding = options.K || 0;
    this.eoline = options.EndOfLine || false;
    this.byteAlign = options.EncodedByteAlign || false;
    this.columns = options.Columns || 1728;
    this.rows = options.Rows || 0;
    let eoblock = options.EndOfBlock;
    if (eoblock === null || eoblock === undefined) {
      eoblock = true;
    }
    this.eoblock = eoblock;
    this.black = options.BlackIs1 || false;
    this.codingLine = new Uint32Array(this.columns + 1);
    this.refLine = new Uint32Array(this.columns + 2);
    this.codingLine[0] = this.columns;
    this.codingPos = 0;
    this.row = 0;
    this.nextLine2D = this.encoding < 0;
    this.inputBits = 0;
    this.inputBuf = 0;
    this.outputBits = 0;
    this.rowsDone = false;
    let code1;
    while ((code1 = this._lookBits(12)) === 0) {
      this._eatBits(1);
    }
    if (code1 === 1) {
      this._eatBits(12);
    }
    if (this.encoding > 0) {
      this.nextLine2D = !this._lookBits(1);
      this._eatBits(1);
    }
  }
  readNextChar() {
    if (this.eof) {
      return -1;
    }
    const refLine = this.refLine;
    const codingLine = this.codingLine;
    const columns = this.columns;
    let refPos, blackPixels, bits, i;
    if (this.outputBits === 0) {
      if (this.rowsDone) {
        this.eof = true;
      }
      if (this.eof) {
        return -1;
      }
      this.err = false;
      let code1, code2, code3;
      if (this.nextLine2D) {
        for (i = 0; codingLine[i] < columns; ++i) {
          refLine[i] = codingLine[i];
        }
        refLine[i++] = columns;
        refLine[i] = columns;
        codingLine[0] = 0;
        this.codingPos = 0;
        refPos = 0;
        blackPixels = 0;
        while (codingLine[this.codingPos] < columns) {
          code1 = this._getTwoDimCode();
          switch (code1) {
            case twoDimPass:
              this._addPixels(refLine[refPos + 1], blackPixels);
              if (refLine[refPos + 1] < columns) {
                refPos += 2;
              }
              break;
            case twoDimHoriz:
              code1 = code2 = 0;
              if (blackPixels) {
                do {
                  code1 += code3 = this._getBlackCode();
                } while (code3 >= 64);
                do {
                  code2 += code3 = this._getWhiteCode();
                } while (code3 >= 64);
              } else {
                do {
                  code1 += code3 = this._getWhiteCode();
                } while (code3 >= 64);
                do {
                  code2 += code3 = this._getBlackCode();
                } while (code3 >= 64);
              }
              this._addPixels(codingLine[this.codingPos] + code1, blackPixels);
              if (codingLine[this.codingPos] < columns) {
                this._addPixels(codingLine[this.codingPos] + code2, blackPixels ^ 1);
              }
              while (refLine[refPos] <= codingLine[this.codingPos] && refLine[refPos] < columns) {
                refPos += 2;
              }
              break;
            case twoDimVertR3:
              this._addPixels(refLine[refPos] + 3, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                ++refPos;
                while (refLine[refPos] <= codingLine[this.codingPos] && refLine[refPos] < columns) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertR2:
              this._addPixels(refLine[refPos] + 2, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                ++refPos;
                while (refLine[refPos] <= codingLine[this.codingPos] && refLine[refPos] < columns) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertR1:
              this._addPixels(refLine[refPos] + 1, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                ++refPos;
                while (refLine[refPos] <= codingLine[this.codingPos] && refLine[refPos] < columns) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVert0:
              this._addPixels(refLine[refPos], blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                ++refPos;
                while (refLine[refPos] <= codingLine[this.codingPos] && refLine[refPos] < columns) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertL3:
              this._addPixelsNeg(refLine[refPos] - 3, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                if (refPos > 0) {
                  --refPos;
                } else {
                  ++refPos;
                }
                while (refLine[refPos] <= codingLine[this.codingPos] && refLine[refPos] < columns) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertL2:
              this._addPixelsNeg(refLine[refPos] - 2, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                if (refPos > 0) {
                  --refPos;
                } else {
                  ++refPos;
                }
                while (refLine[refPos] <= codingLine[this.codingPos] && refLine[refPos] < columns) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertL1:
              this._addPixelsNeg(refLine[refPos] - 1, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                if (refPos > 0) {
                  --refPos;
                } else {
                  ++refPos;
                }
                while (refLine[refPos] <= codingLine[this.codingPos] && refLine[refPos] < columns) {
                  refPos += 2;
                }
              }
              break;
            case ccittEOF:
              this._addPixels(columns, 0);
              this.eof = true;
              break;
            default:
              (0, _util.info)("bad 2d code");
              this._addPixels(columns, 0);
              this.err = true;
          }
        }
      } else {
        codingLine[0] = 0;
        this.codingPos = 0;
        blackPixels = 0;
        while (codingLine[this.codingPos] < columns) {
          code1 = 0;
          if (blackPixels) {
            do {
              code1 += code3 = this._getBlackCode();
            } while (code3 >= 64);
          } else {
            do {
              code1 += code3 = this._getWhiteCode();
            } while (code3 >= 64);
          }
          this._addPixels(codingLine[this.codingPos] + code1, blackPixels);
          blackPixels ^= 1;
        }
      }
      let gotEOL = false;
      if (this.byteAlign) {
        this.inputBits &= ~7;
      }
      if (!this.eoblock && this.row === this.rows - 1) {
        this.rowsDone = true;
      } else {
        code1 = this._lookBits(12);
        if (this.eoline) {
          while (code1 !== ccittEOF && code1 !== 1) {
            this._eatBits(1);
            code1 = this._lookBits(12);
          }
        } else {
          while (code1 === 0) {
            this._eatBits(1);
            code1 = this._lookBits(12);
          }
        }
        if (code1 === 1) {
          this._eatBits(12);
          gotEOL = true;
        } else if (code1 === ccittEOF) {
          this.eof = true;
        }
      }
      if (!this.eof && this.encoding > 0 && !this.rowsDone) {
        this.nextLine2D = !this._lookBits(1);
        this._eatBits(1);
      }
      if (this.eoblock && gotEOL && this.byteAlign) {
        code1 = this._lookBits(12);
        if (code1 === 1) {
          this._eatBits(12);
          if (this.encoding > 0) {
            this._lookBits(1);
            this._eatBits(1);
          }
          if (this.encoding >= 0) {
            for (i = 0; i < 4; ++i) {
              code1 = this._lookBits(12);
              if (code1 !== 1) {
                (0, _util.info)("bad rtc code: " + code1);
              }
              this._eatBits(12);
              if (this.encoding > 0) {
                this._lookBits(1);
                this._eatBits(1);
              }
            }
          }
          this.eof = true;
        }
      } else if (this.err && this.eoline) {
        while (true) {
          code1 = this._lookBits(13);
          if (code1 === ccittEOF) {
            this.eof = true;
            return -1;
          }
          if (code1 >> 1 === 1) {
            break;
          }
          this._eatBits(1);
        }
        this._eatBits(12);
        if (this.encoding > 0) {
          this._eatBits(1);
          this.nextLine2D = !(code1 & 1);
        }
      }
      if (codingLine[0] > 0) {
        this.outputBits = codingLine[this.codingPos = 0];
      } else {
        this.outputBits = codingLine[this.codingPos = 1];
      }
      this.row++;
    }
    let c;
    if (this.outputBits >= 8) {
      c = this.codingPos & 1 ? 0 : 0xff;
      this.outputBits -= 8;
      if (this.outputBits === 0 && codingLine[this.codingPos] < columns) {
        this.codingPos++;
        this.outputBits = codingLine[this.codingPos] - codingLine[this.codingPos - 1];
      }
    } else {
      bits = 8;
      c = 0;
      do {
        if (typeof this.outputBits !== "number") {
          throw new _util.FormatError('Invalid /CCITTFaxDecode data, "outputBits" must be a number.');
        }
        if (this.outputBits > bits) {
          c <<= bits;
          if (!(this.codingPos & 1)) {
            c |= 0xff >> 8 - bits;
          }
          this.outputBits -= bits;
          bits = 0;
        } else {
          c <<= this.outputBits;
          if (!(this.codingPos & 1)) {
            c |= 0xff >> 8 - this.outputBits;
          }
          bits -= this.outputBits;
          this.outputBits = 0;
          if (codingLine[this.codingPos] < columns) {
            this.codingPos++;
            this.outputBits = codingLine[this.codingPos] - codingLine[this.codingPos - 1];
          } else if (bits > 0) {
            c <<= bits;
            bits = 0;
          }
        }
      } while (bits);
    }
    if (this.black) {
      c ^= 0xff;
    }
    return c;
  }
  _addPixels(a1, blackPixels) {
    const codingLine = this.codingLine;
    let codingPos = this.codingPos;
    if (a1 > codingLine[codingPos]) {
      if (a1 > this.columns) {
        (0, _util.info)("row is wrong length");
        this.err = true;
        a1 = this.columns;
      }
      if (codingPos & 1 ^ blackPixels) {
        ++codingPos;
      }
      codingLine[codingPos] = a1;
    }
    this.codingPos = codingPos;
  }
  _addPixelsNeg(a1, blackPixels) {
    const codingLine = this.codingLine;
    let codingPos = this.codingPos;
    if (a1 > codingLine[codingPos]) {
      if (a1 > this.columns) {
        (0, _util.info)("row is wrong length");
        this.err = true;
        a1 = this.columns;
      }
      if (codingPos & 1 ^ blackPixels) {
        ++codingPos;
      }
      codingLine[codingPos] = a1;
    } else if (a1 < codingLine[codingPos]) {
      if (a1 < 0) {
        (0, _util.info)("invalid code");
        this.err = true;
        a1 = 0;
      }
      while (codingPos > 0 && a1 < codingLine[codingPos - 1]) {
        --codingPos;
      }
      codingLine[codingPos] = a1;
    }
    this.codingPos = codingPos;
  }
  _findTableCode(start, end, table, limit) {
    const limitValue = limit || 0;
    for (let i = start; i <= end; ++i) {
      let code = this._lookBits(i);
      if (code === ccittEOF) {
        return [true, 1, false];
      }
      if (i < end) {
        code <<= end - i;
      }
      if (!limitValue || code >= limitValue) {
        const p = table[code - limitValue];
        if (p[0] === i) {
          this._eatBits(i);
          return [true, p[1], true];
        }
      }
    }
    return [false, 0, false];
  }
  _getTwoDimCode() {
    let code = 0;
    let p;
    if (this.eoblock) {
      code = this._lookBits(7);
      p = twoDimTable[code];
      if (p && p[0] > 0) {
        this._eatBits(p[0]);
        return p[1];
      }
    } else {
      const result = this._findTableCode(1, 7, twoDimTable);
      if (result[0] && result[2]) {
        return result[1];
      }
    }
    (0, _util.info)("Bad two dim code");
    return ccittEOF;
  }
  _getWhiteCode() {
    let code = 0;
    let p;
    if (this.eoblock) {
      code = this._lookBits(12);
      if (code === ccittEOF) {
        return 1;
      }
      if (code >> 5 === 0) {
        p = whiteTable1[code];
      } else {
        p = whiteTable2[code >> 3];
      }
      if (p[0] > 0) {
        this._eatBits(p[0]);
        return p[1];
      }
    } else {
      let result = this._findTableCode(1, 9, whiteTable2);
      if (result[0]) {
        return result[1];
      }
      result = this._findTableCode(11, 12, whiteTable1);
      if (result[0]) {
        return result[1];
      }
    }
    (0, _util.info)("bad white code");
    this._eatBits(1);
    return 1;
  }
  _getBlackCode() {
    let code, p;
    if (this.eoblock) {
      code = this._lookBits(13);
      if (code === ccittEOF) {
        return 1;
      }
      if (code >> 7 === 0) {
        p = blackTable1[code];
      } else if (code >> 9 === 0 && code >> 7 !== 0) {
        p = blackTable2[(code >> 1) - 64];
      } else {
        p = blackTable3[code >> 7];
      }
      if (p[0] > 0) {
        this._eatBits(p[0]);
        return p[1];
      }
    } else {
      let result = this._findTableCode(2, 6, blackTable3);
      if (result[0]) {
        return result[1];
      }
      result = this._findTableCode(7, 12, blackTable2, 64);
      if (result[0]) {
        return result[1];
      }
      result = this._findTableCode(10, 13, blackTable1);
      if (result[0]) {
        return result[1];
      }
    }
    (0, _util.info)("bad black code");
    this._eatBits(1);
    return 1;
  }
  _lookBits(n) {
    let c;
    while (this.inputBits < n) {
      if ((c = this.source.next()) === -1) {
        if (this.inputBits === 0) {
          return ccittEOF;
        }
        return this.inputBuf << n - this.inputBits & 0xffff >> 16 - n;
      }
      this.inputBuf = this.inputBuf << 8 | c;
      this.inputBits += 8;
    }
    return this.inputBuf >> this.inputBits - n & 0xffff >> 16 - n;
  }
  _eatBits(n) {
    if ((this.inputBits -= n) < 0) {
      this.inputBits = 0;
    }
  }
}
exports.CCITTFaxDecoder = CCITTFaxDecoder;

/***/ }),
/* 8 */
/***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.JpegImage = void 0;
var _util = __w_pdfjs_require__(1);
var _core_utils = __w_pdfjs_require__(3);
class JpegError extends _util.BaseException {
  constructor(msg) {
    super(`JPEG error: ${msg}`, "JpegError");
  }
}
class DNLMarkerError extends _util.BaseException {
  constructor(message, scanLines) {
    super(message, "DNLMarkerError");
    this.scanLines = scanLines;
  }
}
class EOIMarkerError extends _util.BaseException {
  constructor(msg) {
    super(msg, "EOIMarkerError");
  }
}
const dctZigZag = new Uint8Array([0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63]);
const dctCos1 = 4017;
const dctSin1 = 799;
const dctCos3 = 3406;
const dctSin3 = 2276;
const dctCos6 = 1567;
const dctSin6 = 3784;
const dctSqrt2 = 5793;
const dctSqrt1d2 = 2896;
function buildHuffmanTable(codeLengths, values) {
  let k = 0,
    i,
    j,
    length = 16;
  while (length > 0 && !codeLengths[length - 1]) {
    length--;
  }
  const code = [{
    children: [],
    index: 0
  }];
  let p = code[0],
    q;
  for (i = 0; i < length; i++) {
    for (j = 0; j < codeLengths[i]; j++) {
      p = code.pop();
      p.children[p.index] = values[k];
      while (p.index > 0) {
        p = code.pop();
      }
      p.index++;
      code.push(p);
      while (code.length <= i) {
        code.push(q = {
          children: [],
          index: 0
        });
        p.children[p.index] = q.children;
        p = q;
      }
      k++;
    }
    if (i + 1 < length) {
      code.push(q = {
        children: [],
        index: 0
      });
      p.children[p.index] = q.children;
      p = q;
    }
  }
  return code[0].children;
}
function getBlockBufferOffset(component, row, col) {
  return 64 * ((component.blocksPerLine + 1) * row + col);
}
function decodeScan(data, offset, frame, components, resetInterval, spectralStart, spectralEnd, successivePrev, successive, parseDNLMarker = false) {
  const mcusPerLine = frame.mcusPerLine;
  const progressive = frame.progressive;
  const startOffset = offset;
  let bitsData = 0,
    bitsCount = 0;
  function readBit() {
    if (bitsCount > 0) {
      bitsCount--;
      return bitsData >> bitsCount & 1;
    }
    bitsData = data[offset++];
    if (bitsData === 0xff) {
      const nextByte = data[offset++];
      if (nextByte) {
        if (nextByte === 0xdc && parseDNLMarker) {
          offset += 2;
          const scanLines = (0, _core_utils.readUint16)(data, offset);
          offset += 2;
          if (scanLines > 0 && scanLines !== frame.scanLines) {
            throw new DNLMarkerError("Found DNL marker (0xFFDC) while parsing scan data", scanLines);
          }
        } else if (nextByte === 0xd9) {
          if (parseDNLMarker) {
            const maybeScanLines = blockRow * (frame.precision === 8 ? 8 : 0);
            if (maybeScanLines > 0 && Math.round(frame.scanLines / maybeScanLines) >= 5) {
              throw new DNLMarkerError("Found EOI marker (0xFFD9) while parsing scan data, " + "possibly caused by incorrect `scanLines` parameter", maybeScanLines);
            }
          }
          throw new EOIMarkerError("Found EOI marker (0xFFD9) while parsing scan data");
        }
        throw new JpegError(`unexpected marker ${(bitsData << 8 | nextByte).toString(16)}`);
      }
    }
    bitsCount = 7;
    return bitsData >>> 7;
  }
  function decodeHuffman(tree) {
    let node = tree;
    while (true) {
      node = node[readBit()];
      switch (typeof node) {
        case "number":
          return node;
        case "object":
          continue;
      }
      throw new JpegError("invalid huffman sequence");
    }
  }
  function receive(length) {
    let n = 0;
    while (length > 0) {
      n = n << 1 | readBit();
      length--;
    }
    return n;
  }
  function receiveAndExtend(length) {
    if (length === 1) {
      return readBit() === 1 ? 1 : -1;
    }
    const n = receive(length);
    if (n >= 1 << length - 1) {
      return n;
    }
    return n + (-1 << length) + 1;
  }
  function decodeBaseline(component, blockOffset) {
    const t = decodeHuffman(component.huffmanTableDC);
    const diff = t === 0 ? 0 : receiveAndExtend(t);
    component.blockData[blockOffset] = component.pred += diff;
    let k = 1;
    while (k < 64) {
      const rs = decodeHuffman(component.huffmanTableAC);
      const s = rs & 15,
        r = rs >> 4;
      if (s === 0) {
        if (r < 15) {
          break;
        }
        k += 16;
        continue;
      }
      k += r;
      const z = dctZigZag[k];
      component.blockData[blockOffset + z] = receiveAndExtend(s);
      k++;
    }
  }
  function decodeDCFirst(component, blockOffset) {
    const t = decodeHuffman(component.huffmanTableDC);
    const diff = t === 0 ? 0 : receiveAndExtend(t) << successive;
    component.blockData[blockOffset] = component.pred += diff;
  }
  function decodeDCSuccessive(component, blockOffset) {
    component.blockData[blockOffset] |= readBit() << successive;
  }
  let eobrun = 0;
  function decodeACFirst(component, blockOffset) {
    if (eobrun > 0) {
      eobrun--;
      return;
    }
    let k = spectralStart;
    const e = spectralEnd;
    while (k <= e) {
      const rs = decodeHuffman(component.huffmanTableAC);
      const s = rs & 15,
        r = rs >> 4;
      if (s === 0) {
        if (r < 15) {
          eobrun = receive(r) + (1 << r) - 1;
          break;
        }
        k += 16;
        continue;
      }
      k += r;
      const z = dctZigZag[k];
      component.blockData[blockOffset + z] = receiveAndExtend(s) * (1 << successive);
      k++;
    }
  }
  let successiveACState = 0,
    successiveACNextValue;
  function decodeACSuccessive(component, blockOffset) {
    let k = spectralStart;
    const e = spectralEnd;
    let r = 0;
    let s;
    let rs;
    while (k <= e) {
      const offsetZ = blockOffset + dctZigZag[k];
      const sign = component.blockData[offsetZ] < 0 ? -1 : 1;
      switch (successiveACState) {
        case 0:
          rs = decodeHuffman(component.huffmanTableAC);
          s = rs & 15;
          r = rs >> 4;
          if (s === 0) {
            if (r < 15) {
              eobrun = receive(r) + (1 << r);
              successiveACState = 4;
            } else {
              r = 16;
              successiveACState = 1;
            }
          } else {
            if (s !== 1) {
              throw new JpegError("invalid ACn encoding");
            }
            successiveACNextValue = receiveAndExtend(s);
            successiveACState = r ? 2 : 3;
          }
          continue;
        case 1:
        case 2:
          if (component.blockData[offsetZ]) {
            component.blockData[offsetZ] += sign * (readBit() << successive);
          } else {
            r--;
            if (r === 0) {
              successiveACState = successiveACState === 2 ? 3 : 0;
            }
          }
          break;
        case 3:
          if (component.blockData[offsetZ]) {
            component.blockData[offsetZ] += sign * (readBit() << successive);
          } else {
            component.blockData[offsetZ] = successiveACNextValue << successive;
            successiveACState = 0;
          }
          break;
        case 4:
          if (component.blockData[offsetZ]) {
            component.blockData[offsetZ] += sign * (readBit() << successive);
          }
          break;
      }
      k++;
    }
    if (successiveACState === 4) {
      eobrun--;
      if (eobrun === 0) {
        successiveACState = 0;
      }
    }
  }
  let blockRow = 0;
  function decodeMcu(component, decode, mcu, row, col) {
    const mcuRow = mcu / mcusPerLine | 0;
    const mcuCol = mcu % mcusPerLine;
    blockRow = mcuRow * component.v + row;
    const blockCol = mcuCol * component.h + col;
    const blockOffset = getBlockBufferOffset(component, blockRow, blockCol);
    decode(component, blockOffset);
  }
  function decodeBlock(component, decode, mcu) {
    blockRow = mcu / component.blocksPerLine | 0;
    const blockCol = mcu % component.blocksPerLine;
    const blockOffset = getBlockBufferOffset(component, blockRow, blockCol);
    decode(component, blockOffset);
  }
  const componentsLength = components.length;
  let component, i, j, k, n;
  let decodeFn;
  if (progressive) {
    if (spectralStart === 0) {
      decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive;
    } else {
      decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
    }
  } else {
    decodeFn = decodeBaseline;
  }
  let mcu = 0,
    fileMarker;
  let mcuExpected;
  if (componentsLength === 1) {
    mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
  } else {
    mcuExpected = mcusPerLine * frame.mcusPerColumn;
  }
  let h, v;
  while (mcu <= mcuExpected) {
    const mcuToRead = resetInterval ? Math.min(mcuExpected - mcu, resetInterval) : mcuExpected;
    if (mcuToRead > 0) {
      for (i = 0; i < componentsLength; i++) {
        components[i].pred = 0;
      }
      eobrun = 0;
      if (componentsLength === 1) {
        component = components[0];
        for (n = 0; n < mcuToRead; n++) {
          decodeBlock(component, decodeFn, mcu);
          mcu++;
        }
      } else {
        for (n = 0; n < mcuToRead; n++) {
          for (i = 0; i < componentsLength; i++) {
            component = components[i];
            h = component.h;
            v = component.v;
            for (j = 0; j < v; j++) {
              for (k = 0; k < h; k++) {
                decodeMcu(component, decodeFn, mcu, j, k);
              }
            }
          }
          mcu++;
        }
      }
    }
    bitsCount = 0;
    fileMarker = findNextFileMarker(data, offset);
    if (!fileMarker) {
      break;
    }
    if (fileMarker.invalid) {
      const partialMsg = mcuToRead > 0 ? "unexpected" : "excessive";
      (0, _util.warn)(`decodeScan - ${partialMsg} MCU data, current marker is: ${fileMarker.invalid}`);
      offset = fileMarker.offset;
    }
    if (fileMarker.marker >= 0xffd0 && fileMarker.marker <= 0xffd7) {
      offset += 2;
    } else {
      break;
    }
  }
  return offset - startOffset;
}
function quantizeAndInverse(component, blockBufferOffset, p) {
  const qt = component.quantizationTable,
    blockData = component.blockData;
  let v0, v1, v2, v3, v4, v5, v6, v7;
  let p0, p1, p2, p3, p4, p5, p6, p7;
  let t;
  if (!qt) {
    throw new JpegError("missing required Quantization Table.");
  }
  for (let row = 0; row < 64; row += 8) {
    p0 = blockData[blockBufferOffset + row];
    p1 = blockData[blockBufferOffset + row + 1];
    p2 = blockData[blockBufferOffset + row + 2];
    p3 = blockData[blockBufferOffset + row + 3];
    p4 = blockData[blockBufferOffset + row + 4];
    p5 = blockData[blockBufferOffset + row + 5];
    p6 = blockData[blockBufferOffset + row + 6];
    p7 = blockData[blockBufferOffset + row + 7];
    p0 *= qt[row];
    if ((p1 | p2 | p3 | p4 | p5 | p6 | p7) === 0) {
      t = dctSqrt2 * p0 + 512 >> 10;
      p[row] = t;
      p[row + 1] = t;
      p[row + 2] = t;
      p[row + 3] = t;
      p[row + 4] = t;
      p[row + 5] = t;
      p[row + 6] = t;
      p[row + 7] = t;
      continue;
    }
    p1 *= qt[row + 1];
    p2 *= qt[row + 2];
    p3 *= qt[row + 3];
    p4 *= qt[row + 4];
    p5 *= qt[row + 5];
    p6 *= qt[row + 6];
    p7 *= qt[row + 7];
    v0 = dctSqrt2 * p0 + 128 >> 8;
    v1 = dctSqrt2 * p4 + 128 >> 8;
    v2 = p2;
    v3 = p6;
    v4 = dctSqrt1d2 * (p1 - p7) + 128 >> 8;
    v7 = dctSqrt1d2 * (p1 + p7) + 128 >> 8;
    v5 = p3 << 4;
    v6 = p5 << 4;
    v0 = v0 + v1 + 1 >> 1;
    v1 = v0 - v1;
    t = v2 * dctSin6 + v3 * dctCos6 + 128 >> 8;
    v2 = v2 * dctCos6 - v3 * dctSin6 + 128 >> 8;
    v3 = t;
    v4 = v4 + v6 + 1 >> 1;
    v6 = v4 - v6;
    v7 = v7 + v5 + 1 >> 1;
    v5 = v7 - v5;
    v0 = v0 + v3 + 1 >> 1;
    v3 = v0 - v3;
    v1 = v1 + v2 + 1 >> 1;
    v2 = v1 - v2;
    t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
    v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
    v7 = t;
    t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
    v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
    v6 = t;
    p[row] = v0 + v7;
    p[row + 7] = v0 - v7;
    p[row + 1] = v1 + v6;
    p[row + 6] = v1 - v6;
    p[row + 2] = v2 + v5;
    p[row + 5] = v2 - v5;
    p[row + 3] = v3 + v4;
    p[row + 4] = v3 - v4;
  }
  for (let col = 0; col < 8; ++col) {
    p0 = p[col];
    p1 = p[col + 8];
    p2 = p[col + 16];
    p3 = p[col + 24];
    p4 = p[col + 32];
    p5 = p[col + 40];
    p6 = p[col + 48];
    p7 = p[col + 56];
    if ((p1 | p2 | p3 | p4 | p5 | p6 | p7) === 0) {
      t = dctSqrt2 * p0 + 8192 >> 14;
      if (t < -2040) {
        t = 0;
      } else if (t >= 2024) {
        t = 255;
      } else {
        t = t + 2056 >> 4;
      }
      blockData[blockBufferOffset + col] = t;
      blockData[blockBufferOffset + col + 8] = t;
      blockData[blockBufferOffset + col + 16] = t;
      blockData[blockBufferOffset + col + 24] = t;
      blockData[blockBufferOffset + col + 32] = t;
      blockData[blockBufferOffset + col + 40] = t;
      blockData[blockBufferOffset + col + 48] = t;
      blockData[blockBufferOffset + col + 56] = t;
      continue;
    }
    v0 = dctSqrt2 * p0 + 2048 >> 12;
    v1 = dctSqrt2 * p4 + 2048 >> 12;
    v2 = p2;
    v3 = p6;
    v4 = dctSqrt1d2 * (p1 - p7) + 2048 >> 12;
    v7 = dctSqrt1d2 * (p1 + p7) + 2048 >> 12;
    v5 = p3;
    v6 = p5;
    v0 = (v0 + v1 + 1 >> 1) + 4112;
    v1 = v0 - v1;
    t = v2 * dctSin6 + v3 * dctCos6 + 2048 >> 12;
    v2 = v2 * dctCos6 - v3 * dctSin6 + 2048 >> 12;
    v3 = t;
    v4 = v4 + v6 + 1 >> 1;
    v6 = v4 - v6;
    v7 = v7 + v5 + 1 >> 1;
    v5 = v7 - v5;
    v0 = v0 + v3 + 1 >> 1;
    v3 = v0 - v3;
    v1 = v1 + v2 + 1 >> 1;
    v2 = v1 - v2;
    t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
    v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
    v7 = t;
    t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
    v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
    v6 = t;
    p0 = v0 + v7;
    p7 = v0 - v7;
    p1 = v1 + v6;
    p6 = v1 - v6;
    p2 = v2 + v5;
    p5 = v2 - v5;
    p3 = v3 + v4;
    p4 = v3 - v4;
    if (p0 < 16) {
      p0 = 0;
    } else if (p0 >= 4080) {
      p0 = 255;
    } else {
      p0 >>= 4;
    }
    if (p1 < 16) {
      p1 = 0;
    } else if (p1 >= 4080) {
      p1 = 255;
    } else {
      p1 >>= 4;
    }
    if (p2 < 16) {
      p2 = 0;
    } else if (p2 >= 4080) {
      p2 = 255;
    } else {
      p2 >>= 4;
    }
    if (p3 < 16) {
      p3 = 0;
    } else if (p3 >= 4080) {
      p3 = 255;
    } else {
      p3 >>= 4;
    }
    if (p4 < 16) {
      p4 = 0;
    } else if (p4 >= 4080) {
      p4 = 255;
    } else {
      p4 >>= 4;
    }
    if (p5 < 16) {
      p5 = 0;
    } else if (p5 >= 4080) {
      p5 = 255;
    } else {
      p5 >>= 4;
    }
    if (p6 < 16) {
      p6 = 0;
    } else if (p6 >= 4080) {
      p6 = 255;
    } else {
      p6 >>= 4;
    }
    if (p7 < 16) {
      p7 = 0;
    } else if (p7 >= 4080) {
      p7 = 255;
    } else {
      p7 >>= 4;
    }
    blockData[blockBufferOffset + col] = p0;
    blockData[blockBufferOffset + col + 8] = p1;
    blockData[blockBufferOffset + col + 16] = p2;
    blockData[blockBufferOffset + col + 24] = p3;
    blockData[blockBufferOffset + col + 32] = p4;
    blockData[blockBufferOffset + col + 40] = p5;
    blockData[blockBufferOffset + col + 48] = p6;
    blockData[blockBufferOffset + col + 56] = p7;
  }
}
function buildComponentData(frame, component) {
  const blocksPerLine = component.blocksPerLine;
  const blocksPerColumn = component.blocksPerColumn;
  const computationBuffer = new Int16Array(64);
  for (let blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
    for (let blockCol = 0; blockCol < blocksPerLine; blockCol++) {
      const offset = getBlockBufferOffset(component, blockRow, blockCol);
      quantizeAndInverse(component, offset, computationBuffer);
    }
  }
  return component.blockData;
}
function findNextFileMarker(data, currentPos, startPos = currentPos) {
  const maxPos = data.length - 1;
  let newPos = startPos < currentPos ? startPos : currentPos;
  if (currentPos >= maxPos) {
    return null;
  }
  const currentMarker = (0, _core_utils.readUint16)(data, currentPos);
  if (currentMarker >= 0xffc0 && currentMarker <= 0xfffe) {
    return {
      invalid: null,
      marker: currentMarker,
      offset: currentPos
    };
  }
  let newMarker = (0, _core_utils.readUint16)(data, newPos);
  while (!(newMarker >= 0xffc0 && newMarker <= 0xfffe)) {
    if (++newPos >= maxPos) {
      return null;
    }
    newMarker = (0, _core_utils.readUint16)(data, newPos);
  }
  return {
    invalid: currentMarker.toString(16),
    marker: newMarker,
    offset: newPos
  };
}
class JpegImage {
  constructor({
    decodeTransform = null,
    colorTransform = -1
  } = {}) {
    this._decodeTransform = decodeTransform;
    this._colorTransform = colorTransform;
  }
  parse(data, {
    dnlScanLines = null
  } = {}) {
    function readDataBlock() {
      const length = (0, _core_utils.readUint16)(data, offset);
      offset += 2;
      let endOffset = offset + length - 2;
      const fileMarker = findNextFileMarker(data, endOffset, offset);
      if (fileMarker && fileMarker.invalid) {
        (0, _util.warn)("readDataBlock - incorrect length, current marker is: " + fileMarker.invalid);
        endOffset = fileMarker.offset;
      }
      const array = data.subarray(offset, endOffset);
      offset += array.length;
      return array;
    }
    function prepareComponents(frame) {
      const mcusPerLine = Math.ceil(frame.samplesPerLine / 8 / frame.maxH);
      const mcusPerColumn = Math.ceil(frame.scanLines / 8 / frame.maxV);
      for (const component of frame.components) {
        const blocksPerLine = Math.ceil(Math.ceil(frame.samplesPerLine / 8) * component.h / frame.maxH);
        const blocksPerColumn = Math.ceil(Math.ceil(frame.scanLines / 8) * component.v / frame.maxV);
        const blocksPerLineForMcu = mcusPerLine * component.h;
        const blocksPerColumnForMcu = mcusPerColumn * component.v;
        const blocksBufferSize = 64 * blocksPerColumnForMcu * (blocksPerLineForMcu + 1);
        component.blockData = new Int16Array(blocksBufferSize);
        component.blocksPerLine = blocksPerLine;
        component.blocksPerColumn = blocksPerColumn;
      }
      frame.mcusPerLine = mcusPerLine;
      frame.mcusPerColumn = mcusPerColumn;
    }
    let offset = 0;
    let jfif = null;
    let adobe = null;
    let frame, resetInterval;
    let numSOSMarkers = 0;
    const quantizationTables = [];
    const huffmanTablesAC = [],
      huffmanTablesDC = [];
    let fileMarker = (0, _core_utils.readUint16)(data, offset);
    offset += 2;
    if (fileMarker !== 0xffd8) {
      throw new JpegError("SOI not found");
    }
    fileMarker = (0, _core_utils.readUint16)(data, offset);
    offset += 2;
    markerLoop: while (fileMarker !== 0xffd9) {
      let i, j, l;
      switch (fileMarker) {
        case 0xffe0:
        case 0xffe1:
        case 0xffe2:
        case 0xffe3:
        case 0xffe4:
        case 0xffe5:
        case 0xffe6:
        case 0xffe7:
        case 0xffe8:
        case 0xffe9:
        case 0xffea:
        case 0xffeb:
        case 0xffec:
        case 0xffed:
        case 0xffee:
        case 0xffef:
        case 0xfffe:
          const appData = readDataBlock();
          if (fileMarker === 0xffe0) {
            if (appData[0] === 0x4a && appData[1] === 0x46 && appData[2] === 0x49 && appData[3] === 0x46 && appData[4] === 0) {
              jfif = {
                version: {
                  major: appData[5],
                  minor: appData[6]
                },
                densityUnits: appData[7],
                xDensity: appData[8] << 8 | appData[9],
                yDensity: appData[10] << 8 | appData[11],
                thumbWidth: appData[12],
                thumbHeight: appData[13],
                thumbData: appData.subarray(14, 14 + 3 * appData[12] * appData[13])
              };
            }
          }
          if (fileMarker === 0xffee) {
            if (appData[0] === 0x41 && appData[1] === 0x64 && appData[2] === 0x6f && appData[3] === 0x62 && appData[4] === 0x65) {
              adobe = {
                version: appData[5] << 8 | appData[6],
                flags0: appData[7] << 8 | appData[8],
                flags1: appData[9] << 8 | appData[10],
                transformCode: appData[11]
              };
            }
          }
          break;
        case 0xffdb:
          const quantizationTablesLength = (0, _core_utils.readUint16)(data, offset);
          offset += 2;
          const quantizationTablesEnd = quantizationTablesLength + offset - 2;
          let z;
          while (offset < quantizationTablesEnd) {
            const quantizationTableSpec = data[offset++];
            const tableData = new Uint16Array(64);
            if (quantizationTableSpec >> 4 === 0) {
              for (j = 0; j < 64; j++) {
                z = dctZigZag[j];
                tableData[z] = data[offset++];
              }
            } else if (quantizationTableSpec >> 4 === 1) {
              for (j = 0; j < 64; j++) {
                z = dctZigZag[j];
                tableData[z] = (0, _core_utils.readUint16)(data, offset);
                offset += 2;
              }
            } else {
              throw new JpegError("DQT - invalid table spec");
            }
            quantizationTables[quantizationTableSpec & 15] = tableData;
          }
          break;
        case 0xffc0:
        case 0xffc1:
        case 0xffc2:
          if (frame) {
            throw new JpegError("Only single frame JPEGs supported");
          }
          offset += 2;
          frame = {};
          frame.extended = fileMarker === 0xffc1;
          frame.progressive = fileMarker === 0xffc2;
          frame.precision = data[offset++];
          const sofScanLines = (0, _core_utils.readUint16)(data, offset);
          offset += 2;
          frame.scanLines = dnlScanLines || sofScanLines;
          frame.samplesPerLine = (0, _core_utils.readUint16)(data, offset);
          offset += 2;
          frame.components = [];
          frame.componentIds = {};
          const componentsCount = data[offset++];
          let maxH = 0,
            maxV = 0;
          for (i = 0; i < componentsCount; i++) {
            const componentId = data[offset];
            const h = data[offset + 1] >> 4;
            const v = data[offset + 1] & 15;
            if (maxH < h) {
              maxH = h;
            }
            if (maxV < v) {
              maxV = v;
            }
            const qId = data[offset + 2];
            l = frame.components.push({
              h,
              v,
              quantizationId: qId,
              quantizationTable: null
            });
            frame.componentIds[componentId] = l - 1;
            offset += 3;
          }
          frame.maxH = maxH;
          frame.maxV = maxV;
          prepareComponents(frame);
          break;
        case 0xffc4:
          const huffmanLength = (0, _core_utils.readUint16)(data, offset);
          offset += 2;
          for (i = 2; i < huffmanLength;) {
            const huffmanTableSpec = data[offset++];
            const codeLengths = new Uint8Array(16);
            let codeLengthSum = 0;
            for (j = 0; j < 16; j++, offset++) {
              codeLengthSum += codeLengths[j] = data[offset];
            }
            const huffmanValues = new Uint8Array(codeLengthSum);
            for (j = 0; j < codeLengthSum; j++, offset++) {
              huffmanValues[j] = data[offset];
            }
            i += 17 + codeLengthSum;
            (huffmanTableSpec >> 4 === 0 ? huffmanTablesDC : huffmanTablesAC)[huffmanTableSpec & 15] = buildHuffmanTable(codeLengths, huffmanValues);
          }
          break;
        case 0xffdd:
          offset += 2;
          resetInterval = (0, _core_utils.readUint16)(data, offset);
          offset += 2;
          break;
        case 0xffda:
          const parseDNLMarker = ++numSOSMarkers === 1 && !dnlScanLines;
          offset += 2;
          const selectorsCount = data[offset++],
            components = [];
          for (i = 0; i < selectorsCount; i++) {
            const index = data[offset++];
            const componentIndex = frame.componentIds[index];
            const component = frame.components[componentIndex];
            component.index = index;
            const tableSpec = data[offset++];
            component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
            component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
            components.push(component);
          }
          const spectralStart = data[offset++],
            spectralEnd = data[offset++],
            successiveApproximation = data[offset++];
          try {
            const processed = decodeScan(data, offset, frame, components, resetInterval, spectralStart, spectralEnd, successiveApproximation >> 4, successiveApproximation & 15, parseDNLMarker);
            offset += processed;
          } catch (ex) {
            if (ex instanceof DNLMarkerError) {
              (0, _util.warn)(`${ex.message} -- attempting to re-parse the JPEG image.`);
              return this.parse(data, {
                dnlScanLines: ex.scanLines
              });
            } else if (ex instanceof EOIMarkerError) {
              (0, _util.warn)(`${ex.message} -- ignoring the rest of the image data.`);
              break markerLoop;
            }
            throw ex;
          }
          break;
        case 0xffdc:
          offset += 4;
          break;
        case 0xffff:
          if (data[offset] !== 0xff) {
            offset--;
          }
          break;
        default:
          const nextFileMarker = findNextFileMarker(data, offset - 2, offset - 3);
          if (nextFileMarker && nextFileMarker.invalid) {
            (0, _util.warn)("JpegImage.parse - unexpected data, current marker is: " + nextFileMarker.invalid);
            offset = nextFileMarker.offset;
            break;
          }
          if (!nextFileMarker || offset >= data.length - 1) {
            (0, _util.warn)("JpegImage.parse - reached the end of the image data " + "without finding an EOI marker (0xFFD9).");
            break markerLoop;
          }
          throw new JpegError("JpegImage.parse - unknown marker: " + fileMarker.toString(16));
      }
      fileMarker = (0, _core_utils.readUint16)(data, offset);
      offset += 2;
    }
    this.width = frame.samplesPerLine;
    this.height = frame.scanLines;
    this.jfif = jfif;
    this.adobe = adobe;
    this.components = [];
    for (const component of frame.components) {
      const quantizationTable = quantizationTables[component.quantizationId];
      if (quantizationTable) {
        component.quantizationTable = quantizationTable;
      }
      this.components.push({
        index: component.index,
        output: buildComponentData(frame, component),
        scaleX: component.h / frame.maxH,
        scaleY: component.v / frame.maxV,
        blocksPerLine: component.blocksPerLine,
        blocksPerColumn: component.blocksPerColumn
      });
    }
    this.numComponents = this.components.length;
    return undefined;
  }
  _getLinearizedBlockData(width, height, isSourcePDF = false) {
    const scaleX = this.width / width,
      scaleY = this.height / height;
    let component, componentScaleX, componentScaleY, blocksPerScanline;
    let x, y, i, j, k;
    let index;
    let offset = 0;
    let output;
    const numComponents = this.components.length;
    const dataLength = width * height * numComponents;
    const data = new Uint8ClampedArray(dataLength);
    const xScaleBlockOffset = new Uint32Array(width);
    const mask3LSB = 0xfffffff8;
    let lastComponentScaleX;
    for (i = 0; i < numComponents; i++) {
      component = this.components[i];
      componentScaleX = component.scaleX * scaleX;
      componentScaleY = component.scaleY * scaleY;
      offset = i;
      output = component.output;
      blocksPerScanline = component.blocksPerLine + 1 << 3;
      if (componentScaleX !== lastComponentScaleX) {
        for (x = 0; x < width; x++) {
          j = 0 | x * componentScaleX;
          xScaleBlockOffset[x] = (j & mask3LSB) << 3 | j & 7;
        }
        lastComponentScaleX = componentScaleX;
      }
      for (y = 0; y < height; y++) {
        j = 0 | y * componentScaleY;
        index = blocksPerScanline * (j & mask3LSB) | (j & 7) << 3;
        for (x = 0; x < width; x++) {
          data[offset] = output[index + xScaleBlockOffset[x]];
          offset += numComponents;
        }
      }
    }
    let transform = this._decodeTransform;
    if (!isSourcePDF && numComponents === 4 && !transform) {
      transform = new Int32Array([-256, 255, -256, 255, -256, 255, -256, 255]);
    }
    if (transform) {
      for (i = 0; i < dataLength;) {
        for (j = 0, k = 0; j < numComponents; j++, i++, k += 2) {
          data[i] = (data[i] * transform[k] >> 8) + transform[k + 1];
        }
      }
    }
    return data;
  }
  get _isColorConversionNeeded() {
    if (this.adobe) {
      return !!this.adobe.transformCode;
    }
    if (this.numComponents === 3) {
      if (this._colorTransform === 0) {
        return false;
      } else if (this.components[0].index === 0x52 && this.components[1].index === 0x47 && this.components[2].index === 0x42) {
        return false;
      }
      return true;
    }
    if (this._colorTransform === 1) {
      return true;
    }
    return false;
  }
  _convertYccToRgb(data) {
    let Y, Cb, Cr;
    for (let i = 0, length = data.length; i < length; i += 3) {
      Y = data[i];
      Cb = data[i + 1];
      Cr = data[i + 2];
      data[i] = Y - 179.456 + 1.402 * Cr;
      data[i + 1] = Y + 135.459 - 0.344 * Cb - 0.714 * Cr;
      data[i + 2] = Y - 226.816 + 1.772 * Cb;
    }
    return data;
  }
  _convertYcckToRgb(data) {
    let Y, Cb, Cr, k;
    let offset = 0;
    for (let i = 0, length = data.length; i < length; i += 4) {
      Y = data[i];
      Cb = data[i + 1];
      Cr = data[i + 2];
      k = data[i + 3];
      data[offset++] = -122.67195406894 + Cb * (-6.60635669420364e-5 * Cb + 0.000437130475926232 * Cr - 5.4080610064599e-5 * Y + 0.00048449797120281 * k - 0.154362151871126) + Cr * (-0.000957964378445773 * Cr + 0.000817076911346625 * Y - 0.00477271405408747 * k + 1.53380253221734) + Y * (0.000961250184130688 * Y - 0.00266257332283933 * k + 0.48357088451265) + k * (-0.000336197177618394 * k + 0.484791561490776);
      data[offset++] = 107.268039397724 + Cb * (2.19927104525741e-5 * Cb - 0.000640992018297945 * Cr + 0.000659397001245577 * Y + 0.000426105652938837 * k - 0.176491792462875) + Cr * (-0.000778269941513683 * Cr + 0.00130872261408275 * Y + 0.000770482631801132 * k - 0.151051492775562) + Y * (0.00126935368114843 * Y - 0.00265090189010898 * k + 0.25802910206845) + k * (-0.000318913117588328 * k - 0.213742400323665);
      data[offset++] = -20.810012546947 + Cb * (-0.000570115196973677 * Cb - 2.63409051004589e-5 * Cr + 0.0020741088115012 * Y - 0.00288260236853442 * k + 0.814272968359295) + Cr * (-1.53496057440975e-5 * Cr - 0.000132689043961446 * Y + 0.000560833691242812 * k - 0.195152027534049) + Y * (0.00174418132927582 * Y - 0.00255243321439347 * k + 0.116935020465145) + k * (-0.000343531996510555 * k + 0.24165260232407);
    }
    return data.subarray(0, offset);
  }
  _convertYcckToCmyk(data) {
    let Y, Cb, Cr;
    for (let i = 0, length = data.length; i < length; i += 4) {
      Y = data[i];
      Cb = data[i + 1];
      Cr = data[i + 2];
      data[i] = 434.456 - Y - 1.402 * Cr;
      data[i + 1] = 119.541 - Y + 0.344 * Cb + 0.714 * Cr;
      data[i + 2] = 481.816 - Y - 1.772 * Cb;
    }
    return data;
  }
  _convertCmykToRgb(data) {
    let c, m, y, k;
    let offset = 0;
    for (let i = 0, length = data.length; i < length; i += 4) {
      c = data[i];
      m = data[i + 1];
      y = data[i + 2];
      k = data[i + 3];
      data[offset++] = 255 + c * (-0.00006747147073602441 * c + 0.0008379262121013727 * m + 0.0002894718188643294 * y + 0.003264231057537806 * k - 1.1185611867203937) + m * (0.000026374107616089405 * m - 0.00008626949158638572 * y - 0.0002748769067499491 * k - 0.02155688794978967) + y * (-0.00003878099212869363 * y - 0.0003267808279485286 * k + 0.0686742238595345) - k * (0.0003361971776183937 * k + 0.7430659151342254);
      data[offset++] = 255 + c * (0.00013596372813588848 * c + 0.000924537132573585 * m + 0.00010567359618683593 * y + 0.0004791864687436512 * k - 0.3109689587515875) + m * (-0.00023545346108370344 * m + 0.0002702845253534714 * y + 0.0020200308977307156 * k - 0.7488052167015494) + y * (0.00006834815998235662 * y + 0.00015168452363460973 * k - 0.09751927774728933) - k * (0.0003189131175883281 * k + 0.7364883807733168);
      data[offset++] = 255 + c * (0.000013598650411385307 * c + 0.00012423956175490851 * m + 0.0004751985097583589 * y - 0.0000036729317476630422 * k - 0.05562186980264034) + m * (0.00016141380598724676 * m + 0.0009692239130725186 * y + 0.0007782692450036253 * k - 0.44015232367526463) + y * (5.068882914068769e-7 * y + 0.0017778369011375071 * k - 0.7591454649749609) - k * (0.0003435319965105553 * k + 0.7063770186160144);
    }
    return data.subarray(0, offset);
  }
  getData({
    width,
    height,
    forceRGB = false,
    isSourcePDF = false
  }) {
    if (this.numComponents > 4) {
      throw new JpegError("Unsupported color mode");
    }
    const data = this._getLinearizedBlockData(width, height, isSourcePDF);
    if (this.numComponents === 1 && forceRGB) {
      const rgbData = new Uint8ClampedArray(data.length * 3);
      let offset = 0;
      for (const grayColor of data) {
        rgbData[offset++] = grayColor;
        rgbData[offset++] = grayColor;
        rgbData[offset++] = grayColor;
      }
      return rgbData;
    } else if (this.numComponents === 3 && this._isColorConversionNeeded) {
      return this._convertYccToRgb(data);
    } else if (this.numComponents === 4) {
      if (this._isColorConversionNeeded) {
        if (forceRGB) {
          return this._convertYcckToRgb(data);
        }
        return this._convertYcckToCmyk(data);
      } else if (forceRGB) {
        return this._convertCmykToRgb(data);
      }
    }
    return data;
  }
}
exports.JpegImage = JpegImage;

/***/ }),
/* 9 */
/***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.JpxImage = void 0;
var _util = __w_pdfjs_require__(1);
var _core_utils = __w_pdfjs_require__(3);
var _arithmetic_decoder = __w_pdfjs_require__(6);
class JpxError extends _util.BaseException {
  constructor(msg) {
    super(`JPX error: ${msg}`, "JpxError");
  }
}
const SubbandsGainLog2 = {
  LL: 0,
  LH: 1,
  HL: 1,
  HH: 2
};
class JpxImage {
  constructor() {
    this.failOnCorruptedImage = false;
  }
  parse(data) {
    const head = (0, _core_utils.readUint16)(data, 0);
    if (head === 0xff4f) {
      this.parseCodestream(data, 0, data.length);
      return;
    }
    const length = data.length;
    let position = 0;
    while (position < length) {
      let headerSize = 8;
      let lbox = (0, _core_utils.readUint32)(data, position);
      const tbox = (0, _core_utils.readUint32)(data, position + 4);
      position += headerSize;
      if (lbox === 1) {
        lbox = (0, _core_utils.readUint32)(data, position) * 4294967296 + (0, _core_utils.readUint32)(data, position + 4);
        position += 8;
        headerSize += 8;
      }
      if (lbox === 0) {
        lbox = length - position + headerSize;
      }
      if (lbox < headerSize) {
        throw new JpxError("Invalid box field size");
      }
      const dataLength = lbox - headerSize;
      let jumpDataLength = true;
      switch (tbox) {
        case 0x6a703268:
          jumpDataLength = false;
          break;
        case 0x636f6c72:
          const method = data[position];
          if (method === 1) {
            const colorspace = (0, _core_utils.readUint32)(data, position + 3);
            switch (colorspace) {
              case 16:
              case 17:
              case 18:
                break;
              default:
                (0, _util.warn)("Unknown colorspace " + colorspace);
                break;
            }
          } else if (method === 2) {
            (0, _util.info)("ICC profile not supported");
          }
          break;
        case 0x6a703263:
          this.parseCodestream(data, position, position + dataLength);
          break;
        case 0x6a502020:
          if ((0, _core_utils.readUint32)(data, position) !== 0x0d0a870a) {
            (0, _util.warn)("Invalid JP2 signature");
          }
          break;
        case 0x6a501a1a:
        case 0x66747970:
        case 0x72726571:
        case 0x72657320:
        case 0x69686472:
          break;
        default:
          const headerType = String.fromCharCode(tbox >> 24 & 0xff, tbox >> 16 & 0xff, tbox >> 8 & 0xff, tbox & 0xff);
          (0, _util.warn)(`Unsupported header type ${tbox} (${headerType}).`);
          break;
      }
      if (jumpDataLength) {
        position += dataLength;
      }
    }
  }
  parseImageProperties(stream) {
    let newByte = stream.getByte();
    while (newByte >= 0) {
      const oldByte = newByte;
      newByte = stream.getByte();
      const code = oldByte << 8 | newByte;
      if (code === 0xff51) {
        stream.skip(4);
        const Xsiz = stream.getInt32() >>> 0;
        const Ysiz = stream.getInt32() >>> 0;
        const XOsiz = stream.getInt32() >>> 0;
        const YOsiz = stream.getInt32() >>> 0;
        stream.skip(16);
        const Csiz = stream.getUint16();
        this.width = Xsiz - XOsiz;
        this.height = Ysiz - YOsiz;
        this.componentsCount = Csiz;
        this.bitsPerComponent = 8;
        return;
      }
    }
    throw new JpxError("No size marker found in JPX stream");
  }
  parseCodestream(data, start, end) {
    const context = {};
    let doNotRecover = false;
    try {
      let position = start;
      while (position + 1 < end) {
        const code = (0, _core_utils.readUint16)(data, position);
        position += 2;
        let length = 0,
          j,
          sqcd,
          spqcds,
          spqcdSize,
          scalarExpounded,
          tile;
        switch (code) {
          case 0xff4f:
            context.mainHeader = true;
            break;
          case 0xffd9:
            break;
          case 0xff51:
            length = (0, _core_utils.readUint16)(data, position);
            const siz = {};
            siz.Xsiz = (0, _core_utils.readUint32)(data, position + 4);
            siz.Ysiz = (0, _core_utils.readUint32)(data, position + 8);
            siz.XOsiz = (0, _core_utils.readUint32)(data, position + 12);
            siz.YOsiz = (0, _core_utils.readUint32)(data, position + 16);
            siz.XTsiz = (0, _core_utils.readUint32)(data, position + 20);
            siz.YTsiz = (0, _core_utils.readUint32)(data, position + 24);
            siz.XTOsiz = (0, _core_utils.readUint32)(data, position + 28);
            siz.YTOsiz = (0, _core_utils.readUint32)(data, position + 32);
            const componentsCount = (0, _core_utils.readUint16)(data, position + 36);
            siz.Csiz = componentsCount;
            const components = [];
            j = position + 38;
            for (let i = 0; i < componentsCount; i++) {
              const component = {
                precision: (data[j] & 0x7f) + 1,
                isSigned: !!(data[j] & 0x80),
                XRsiz: data[j + 1],
                YRsiz: data[j + 2]
              };
              j += 3;
              calculateComponentDimensions(component, siz);
              components.push(component);
            }
            context.SIZ = siz;
            context.components = components;
            calculateTileGrids(context, components);
            context.QCC = [];
            context.COC = [];
            break;
          case 0xff5c:
            length = (0, _core_utils.readUint16)(data, position);
            const qcd = {};
            j = position + 2;
            sqcd = data[j++];
            switch (sqcd & 0x1f) {
              case 0:
                spqcdSize = 8;
                scalarExpounded = true;
                break;
              case 1:
                spqcdSize = 16;
                scalarExpounded = false;
                break;
              case 2:
                spqcdSize = 16;
                scalarExpounded = true;
                break;
              default:
                throw new Error("Invalid SQcd value " + sqcd);
            }
            qcd.noQuantization = spqcdSize === 8;
            qcd.scalarExpounded = scalarExpounded;
            qcd.guardBits = sqcd >> 5;
            spqcds = [];
            while (j < length + position) {
              const spqcd = {};
              if (spqcdSize === 8) {
                spqcd.epsilon = data[j++] >> 3;
                spqcd.mu = 0;
              } else {
                spqcd.epsilon = data[j] >> 3;
                spqcd.mu = (data[j] & 0x7) << 8 | data[j + 1];
                j += 2;
              }
              spqcds.push(spqcd);
            }
            qcd.SPqcds = spqcds;
            if (context.mainHeader) {
              context.QCD = qcd;
            } else {
              context.currentTile.QCD = qcd;
              context.currentTile.QCC = [];
            }
            break;
          case 0xff5d:
            length = (0, _core_utils.readUint16)(data, position);
            const qcc = {};
            j = position + 2;
            let cqcc;
            if (context.SIZ.Csiz < 257) {
              cqcc = data[j++];
            } else {
              cqcc = (0, _core_utils.readUint16)(data, j);
              j += 2;
            }
            sqcd = data[j++];
            switch (sqcd & 0x1f) {
              case 0:
                spqcdSize = 8;
                scalarExpounded = true;
                break;
              case 1:
                spqcdSize = 16;
                scalarExpounded = false;
                break;
              case 2:
                spqcdSize = 16;
                scalarExpounded = true;
                break;
              default:
                throw new Error("Invalid SQcd value " + sqcd);
            }
            qcc.noQuantization = spqcdSize === 8;
            qcc.scalarExpounded = scalarExpounded;
            qcc.guardBits = sqcd >> 5;
            spqcds = [];
            while (j < length + position) {
              const spqcd = {};
              if (spqcdSize === 8) {
                spqcd.epsilon = data[j++] >> 3;
                spqcd.mu = 0;
              } else {
                spqcd.epsilon = data[j] >> 3;
                spqcd.mu = (data[j] & 0x7) << 8 | data[j + 1];
                j += 2;
              }
              spqcds.push(spqcd);
            }
            qcc.SPqcds = spqcds;
            if (context.mainHeader) {
              context.QCC[cqcc] = qcc;
            } else {
              context.currentTile.QCC[cqcc] = qcc;
            }
            break;
          case 0xff52:
            length = (0, _core_utils.readUint16)(data, position);
            const cod = {};
            j = position + 2;
            const scod = data[j++];
            cod.entropyCoderWithCustomPrecincts = !!(scod & 1);
            cod.sopMarkerUsed = !!(scod & 2);
            cod.ephMarkerUsed = !!(scod & 4);
            cod.progressionOrder = data[j++];
            cod.layersCount = (0, _core_utils.readUint16)(data, j);
            j += 2;
            cod.multipleComponentTransform = data[j++];
            cod.decompositionLevelsCount = data[j++];
            cod.xcb = (data[j++] & 0xf) + 2;
            cod.ycb = (data[j++] & 0xf) + 2;
            const blockStyle = data[j++];
            cod.selectiveArithmeticCodingBypass = !!(blockStyle & 1);
            cod.resetContextProbabilities = !!(blockStyle & 2);
            cod.terminationOnEachCodingPass = !!(blockStyle & 4);
            cod.verticallyStripe = !!(blockStyle & 8);
            cod.predictableTermination = !!(blockStyle & 16);
            cod.segmentationSymbolUsed = !!(blockStyle & 32);
            cod.reversibleTransformation = data[j++];
            if (cod.entropyCoderWithCustomPrecincts) {
              const precinctsSizes = [];
              while (j < length + position) {
                const precinctsSize = data[j++];
                precinctsSizes.push({
                  PPx: precinctsSize & 0xf,
                  PPy: precinctsSize >> 4
                });
              }
              cod.precinctsSizes = precinctsSizes;
            }
            const unsupported = [];
            if (cod.selectiveArithmeticCodingBypass) {
              unsupported.push("selectiveArithmeticCodingBypass");
            }
            if (cod.terminationOnEachCodingPass) {
              unsupported.push("terminationOnEachCodingPass");
            }
            if (cod.verticallyStripe) {
              unsupported.push("verticallyStripe");
            }
            if (cod.predictableTermination) {
              unsupported.push("predictableTermination");
            }
            if (unsupported.length > 0) {
              doNotRecover = true;
              (0, _util.warn)(`JPX: Unsupported COD options (${unsupported.join(", ")}).`);
            }
            if (context.mainHeader) {
              context.COD = cod;
            } else {
              context.currentTile.COD = cod;
              context.currentTile.COC = [];
            }
            break;
          case 0xff90:
            length = (0, _core_utils.readUint16)(data, position);
            tile = {};
            tile.index = (0, _core_utils.readUint16)(data, position + 2);
            tile.length = (0, _core_utils.readUint32)(data, position + 4);
            tile.dataEnd = tile.length + position - 2;
            tile.partIndex = data[position + 8];
            tile.partsCount = data[position + 9];
            context.mainHeader = false;
            if (tile.partIndex === 0) {
              tile.COD = context.COD;
              tile.COC = context.COC.slice(0);
              tile.QCD = context.QCD;
              tile.QCC = context.QCC.slice(0);
            }
            context.currentTile = tile;
            break;
          case 0xff93:
            tile = context.currentTile;
            if (tile.partIndex === 0) {
              initializeTile(context, tile.index);
              buildPackets(context);
            }
            length = tile.dataEnd - position;
            parseTilePackets(context, data, position, length);
            break;
          case 0xff53:
            (0, _util.warn)("JPX: Codestream code 0xFF53 (COC) is not implemented.");
          case 0xff55:
          case 0xff57:
          case 0xff58:
          case 0xff64:
            length = (0, _core_utils.readUint16)(data, position);
            break;
          default:
            throw new Error("Unknown codestream code: " + code.toString(16));
        }
        position += length;
      }
    } catch (e) {
      if (doNotRecover || this.failOnCorruptedImage) {
        throw new JpxError(e.message);
      } else {
        (0, _util.warn)(`JPX: Trying to recover from: "${e.message}".`);
      }
    }
    this.tiles = transformComponents(context);
    this.width = context.SIZ.Xsiz - context.SIZ.XOsiz;
    this.height = context.SIZ.Ysiz - context.SIZ.YOsiz;
    this.componentsCount = context.SIZ.Csiz;
  }
}
exports.JpxImage = JpxImage;
function calculateComponentDimensions(component, siz) {
  component.x0 = Math.ceil(siz.XOsiz / component.XRsiz);
  component.x1 = Math.ceil(siz.Xsiz / component.XRsiz);
  component.y0 = Math.ceil(siz.YOsiz / component.YRsiz);
  component.y1 = Math.ceil(siz.Ysiz / component.YRsiz);
  component.width = component.x1 - component.x0;
  component.height = component.y1 - component.y0;
}
function calculateTileGrids(context, components) {
  const siz = context.SIZ;
  const tiles = [];
  let tile;
  const numXtiles = Math.ceil((siz.Xsiz - siz.XTOsiz) / siz.XTsiz);
  const numYtiles = Math.ceil((siz.Ysiz - siz.YTOsiz) / siz.YTsiz);
  for (let q = 0; q < numYtiles; q++) {
    for (let p = 0; p < numXtiles; p++) {
      tile = {};
      tile.tx0 = Math.max(siz.XTOsiz + p * siz.XTsiz, siz.XOsiz);
      tile.ty0 = Math.max(siz.YTOsiz + q * siz.YTsiz, siz.YOsiz);
      tile.tx1 = Math.min(siz.XTOsiz + (p + 1) * siz.XTsiz, siz.Xsiz);
      tile.ty1 = Math.min(siz.YTOsiz + (q + 1) * siz.YTsiz, siz.Ysiz);
      tile.width = tile.tx1 - tile.tx0;
      tile.height = tile.ty1 - tile.ty0;
      tile.components = [];
      tiles.push(tile);
    }
  }
  context.tiles = tiles;
  const componentsCount = siz.Csiz;
  for (let i = 0, ii = componentsCount; i < ii; i++) {
    const component = components[i];
    for (let j = 0, jj = tiles.length; j < jj; j++) {
      const tileComponent = {};
      tile = tiles[j];
      tileComponent.tcx0 = Math.ceil(tile.tx0 / component.XRsiz);
      tileComponent.tcy0 = Math.ceil(tile.ty0 / component.YRsiz);
      tileComponent.tcx1 = Math.ceil(tile.tx1 / component.XRsiz);
      tileComponent.tcy1 = Math.ceil(tile.ty1 / component.YRsiz);
      tileComponent.width = tileComponent.tcx1 - tileComponent.tcx0;
      tileComponent.height = tileComponent.tcy1 - tileComponent.tcy0;
      tile.components[i] = tileComponent;
    }
  }
}
function getBlocksDimensions(context, component, r) {
  const codOrCoc = component.codingStyleParameters;
  const result = {};
  if (!codOrCoc.entropyCoderWithCustomPrecincts) {
    result.PPx = 15;
    result.PPy = 15;
  } else {
    result.PPx = codOrCoc.precinctsSizes[r].PPx;
    result.PPy = codOrCoc.precinctsSizes[r].PPy;
  }
  result.xcb_ = r > 0 ? Math.min(codOrCoc.xcb, result.PPx - 1) : Math.min(codOrCoc.xcb, result.PPx);
  result.ycb_ = r > 0 ? Math.min(codOrCoc.ycb, result.PPy - 1) : Math.min(codOrCoc.ycb, result.PPy);
  return result;
}
function buildPrecincts(context, resolution, dimensions) {
  const precinctWidth = 1 << dimensions.PPx;
  const precinctHeight = 1 << dimensions.PPy;
  const isZeroRes = resolution.resLevel === 0;
  const precinctWidthInSubband = 1 << dimensions.PPx + (isZeroRes ? 0 : -1);
  const precinctHeightInSubband = 1 << dimensions.PPy + (isZeroRes ? 0 : -1);
  const numprecinctswide = resolution.trx1 > resolution.trx0 ? Math.ceil(resolution.trx1 / precinctWidth) - Math.floor(resolution.trx0 / precinctWidth) : 0;
  const numprecinctshigh = resolution.try1 > resolution.try0 ? Math.ceil(resolution.try1 / precinctHeight) - Math.floor(resolution.try0 / precinctHeight) : 0;
  const numprecincts = numprecinctswide * numprecinctshigh;
  resolution.precinctParameters = {
    precinctWidth,
    precinctHeight,
    numprecinctswide,
    numprecinctshigh,
    numprecincts,
    precinctWidthInSubband,
    precinctHeightInSubband
  };
}
function buildCodeblocks(context, subband, dimensions) {
  const xcb_ = dimensions.xcb_;
  const ycb_ = dimensions.ycb_;
  const codeblockWidth = 1 << xcb_;
  const codeblockHeight = 1 << ycb_;
  const cbx0 = subband.tbx0 >> xcb_;
  const cby0 = subband.tby0 >> ycb_;
  const cbx1 = subband.tbx1 + codeblockWidth - 1 >> xcb_;
  const cby1 = subband.tby1 + codeblockHeight - 1 >> ycb_;
  const precinctParameters = subband.resolution.precinctParameters;
  const codeblocks = [];
  const precincts = [];
  let i, j, codeblock, precinctNumber;
  for (j = cby0; j < cby1; j++) {
    for (i = cbx0; i < cbx1; i++) {
      codeblock = {
        cbx: i,
        cby: j,
        tbx0: codeblockWidth * i,
        tby0: codeblockHeight * j,
        tbx1: codeblockWidth * (i + 1),
        tby1: codeblockHeight * (j + 1)
      };
      codeblock.tbx0_ = Math.max(subband.tbx0, codeblock.tbx0);
      codeblock.tby0_ = Math.max(subband.tby0, codeblock.tby0);
      codeblock.tbx1_ = Math.min(subband.tbx1, codeblock.tbx1);
      codeblock.tby1_ = Math.min(subband.tby1, codeblock.tby1);
      const pi = Math.floor((codeblock.tbx0_ - subband.tbx0) / precinctParameters.precinctWidthInSubband);
      const pj = Math.floor((codeblock.tby0_ - subband.tby0) / precinctParameters.precinctHeightInSubband);
      precinctNumber = pi + pj * precinctParameters.numprecinctswide;
      codeblock.precinctNumber = precinctNumber;
      codeblock.subbandType = subband.type;
      codeblock.Lblock = 3;
      if (codeblock.tbx1_ <= codeblock.tbx0_ || codeblock.tby1_ <= codeblock.tby0_) {
        continue;
      }
      codeblocks.push(codeblock);
      let precinct = precincts[precinctNumber];
      if (precinct !== undefined) {
        if (i < precinct.cbxMin) {
          precinct.cbxMin = i;
        } else if (i > precinct.cbxMax) {
          precinct.cbxMax = i;
        }
        if (j < precinct.cbyMin) {
          precinct.cbxMin = j;
        } else if (j > precinct.cbyMax) {
          precinct.cbyMax = j;
        }
      } else {
        precincts[precinctNumber] = precinct = {
          cbxMin: i,
          cbyMin: j,
          cbxMax: i,
          cbyMax: j
        };
      }
      codeblock.precinct = precinct;
    }
  }
  subband.codeblockParameters = {
    codeblockWidth: xcb_,
    codeblockHeight: ycb_,
    numcodeblockwide: cbx1 - cbx0 + 1,
    numcodeblockhigh: cby1 - cby0 + 1
  };
  subband.codeblocks = codeblocks;
  subband.precincts = precincts;
}
function createPacket(resolution, precinctNumber, layerNumber) {
  const precinctCodeblocks = [];
  const subbands = resolution.subbands;
  for (let i = 0, ii = subbands.length; i < ii; i++) {
    const subband = subbands[i];
    const codeblocks = subband.codeblocks;
    for (let j = 0, jj = codeblocks.length; j < jj; j++) {
      const codeblock = codeblocks[j];
      if (codeblock.precinctNumber !== precinctNumber) {
        continue;
      }
      precinctCodeblocks.push(codeblock);
    }
  }
  return {
    layerNumber,
    codeblocks: precinctCodeblocks
  };
}
function LayerResolutionComponentPositionIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  let maxDecompositionLevelsCount = 0;
  for (let q = 0; q < componentsCount; q++) {
    maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, tile.components[q].codingStyleParameters.decompositionLevelsCount);
  }
  let l = 0,
    r = 0,
    i = 0,
    k = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; l < layersCount; l++) {
      for (; r <= maxDecompositionLevelsCount; r++) {
        for (; i < componentsCount; i++) {
          const component = tile.components[i];
          if (r > component.codingStyleParameters.decompositionLevelsCount) {
            continue;
          }
          const resolution = component.resolutions[r];
          const numprecincts = resolution.precinctParameters.numprecincts;
          for (; k < numprecincts;) {
            const packet = createPacket(resolution, k, l);
            k++;
            return packet;
          }
          k = 0;
        }
        i = 0;
      }
      r = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function ResolutionLayerComponentPositionIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  let maxDecompositionLevelsCount = 0;
  for (let q = 0; q < componentsCount; q++) {
    maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, tile.components[q].codingStyleParameters.decompositionLevelsCount);
  }
  let r = 0,
    l = 0,
    i = 0,
    k = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; r <= maxDecompositionLevelsCount; r++) {
      for (; l < layersCount; l++) {
        for (; i < componentsCount; i++) {
          const component = tile.components[i];
          if (r > component.codingStyleParameters.decompositionLevelsCount) {
            continue;
          }
          const resolution = component.resolutions[r];
          const numprecincts = resolution.precinctParameters.numprecincts;
          for (; k < numprecincts;) {
            const packet = createPacket(resolution, k, l);
            k++;
            return packet;
          }
          k = 0;
        }
        i = 0;
      }
      l = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function ResolutionPositionComponentLayerIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  let l, r, c, p;
  let maxDecompositionLevelsCount = 0;
  for (c = 0; c < componentsCount; c++) {
    const component = tile.components[c];
    maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, component.codingStyleParameters.decompositionLevelsCount);
  }
  const maxNumPrecinctsInLevel = new Int32Array(maxDecompositionLevelsCount + 1);
  for (r = 0; r <= maxDecompositionLevelsCount; ++r) {
    let maxNumPrecincts = 0;
    for (c = 0; c < componentsCount; ++c) {
      const resolutions = tile.components[c].resolutions;
      if (r < resolutions.length) {
        maxNumPrecincts = Math.max(maxNumPrecincts, resolutions[r].precinctParameters.numprecincts);
      }
    }
    maxNumPrecinctsInLevel[r] = maxNumPrecincts;
  }
  l = 0;
  r = 0;
  c = 0;
  p = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; r <= maxDecompositionLevelsCount; r++) {
      for (; p < maxNumPrecinctsInLevel[r]; p++) {
        for (; c < componentsCount; c++) {
          const component = tile.components[c];
          if (r > component.codingStyleParameters.decompositionLevelsCount) {
            continue;
          }
          const resolution = component.resolutions[r];
          const numprecincts = resolution.precinctParameters.numprecincts;
          if (p >= numprecincts) {
            continue;
          }
          for (; l < layersCount;) {
            const packet = createPacket(resolution, p, l);
            l++;
            return packet;
          }
          l = 0;
        }
        c = 0;
      }
      p = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function PositionComponentResolutionLayerIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  const precinctsSizes = getPrecinctSizesInImageScale(tile);
  const precinctsIterationSizes = precinctsSizes;
  let l = 0,
    r = 0,
    c = 0,
    px = 0,
    py = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; py < precinctsIterationSizes.maxNumHigh; py++) {
      for (; px < precinctsIterationSizes.maxNumWide; px++) {
        for (; c < componentsCount; c++) {
          const component = tile.components[c];
          const decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
          for (; r <= decompositionLevelsCount; r++) {
            const resolution = component.resolutions[r];
            const sizeInImageScale = precinctsSizes.components[c].resolutions[r];
            const k = getPrecinctIndexIfExist(px, py, sizeInImageScale, precinctsIterationSizes, resolution);
            if (k === null) {
              continue;
            }
            for (; l < layersCount;) {
              const packet = createPacket(resolution, k, l);
              l++;
              return packet;
            }
            l = 0;
          }
          r = 0;
        }
        c = 0;
      }
      px = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function ComponentPositionResolutionLayerIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  const precinctsSizes = getPrecinctSizesInImageScale(tile);
  let l = 0,
    r = 0,
    c = 0,
    px = 0,
    py = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; c < componentsCount; ++c) {
      const component = tile.components[c];
      const precinctsIterationSizes = precinctsSizes.components[c];
      const decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
      for (; py < precinctsIterationSizes.maxNumHigh; py++) {
        for (; px < precinctsIterationSizes.maxNumWide; px++) {
          for (; r <= decompositionLevelsCount; r++) {
            const resolution = component.resolutions[r];
            const sizeInImageScale = precinctsIterationSizes.resolutions[r];
            const k = getPrecinctIndexIfExist(px, py, sizeInImageScale, precinctsIterationSizes, resolution);
            if (k === null) {
              continue;
            }
            for (; l < layersCount;) {
              const packet = createPacket(resolution, k, l);
              l++;
              return packet;
            }
            l = 0;
          }
          r = 0;
        }
        px = 0;
      }
      py = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function getPrecinctIndexIfExist(pxIndex, pyIndex, sizeInImageScale, precinctIterationSizes, resolution) {
  const posX = pxIndex * precinctIterationSizes.minWidth;
  const posY = pyIndex * precinctIterationSizes.minHeight;
  if (posX % sizeInImageScale.width !== 0 || posY % sizeInImageScale.height !== 0) {
    return null;
  }
  const startPrecinctRowIndex = posY / sizeInImageScale.width * resolution.precinctParameters.numprecinctswide;
  return posX / sizeInImageScale.height + startPrecinctRowIndex;
}
function getPrecinctSizesInImageScale(tile) {
  const componentsCount = tile.components.length;
  let minWidth = Number.MAX_VALUE;
  let minHeight = Number.MAX_VALUE;
  let maxNumWide = 0;
  let maxNumHigh = 0;
  const sizePerComponent = new Array(componentsCount);
  for (let c = 0; c < componentsCount; c++) {
    const component = tile.components[c];
    const decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
    const sizePerResolution = new Array(decompositionLevelsCount + 1);
    let minWidthCurrentComponent = Number.MAX_VALUE;
    let minHeightCurrentComponent = Number.MAX_VALUE;
    let maxNumWideCurrentComponent = 0;
    let maxNumHighCurrentComponent = 0;
    let scale = 1;
    for (let r = decompositionLevelsCount; r >= 0; --r) {
      const resolution = component.resolutions[r];
      const widthCurrentResolution = scale * resolution.precinctParameters.precinctWidth;
      const heightCurrentResolution = scale * resolution.precinctParameters.precinctHeight;
      minWidthCurrentComponent = Math.min(minWidthCurrentComponent, widthCurrentResolution);
      minHeightCurrentComponent = Math.min(minHeightCurrentComponent, heightCurrentResolution);
      maxNumWideCurrentComponent = Math.max(maxNumWideCurrentComponent, resolution.precinctParameters.numprecinctswide);
      maxNumHighCurrentComponent = Math.max(maxNumHighCurrentComponent, resolution.precinctParameters.numprecinctshigh);
      sizePerResolution[r] = {
        width: widthCurrentResolution,
        height: heightCurrentResolution
      };
      scale <<= 1;
    }
    minWidth = Math.min(minWidth, minWidthCurrentComponent);
    minHeight = Math.min(minHeight, minHeightCurrentComponent);
    maxNumWide = Math.max(maxNumWide, maxNumWideCurrentComponent);
    maxNumHigh = Math.max(maxNumHigh, maxNumHighCurrentComponent);
    sizePerComponent[c] = {
      resolutions: sizePerResolution,
      minWidth: minWidthCurrentComponent,
      minHeight: minHeightCurrentComponent,
      maxNumWide: maxNumWideCurrentComponent,
      maxNumHigh: maxNumHighCurrentComponent
    };
  }
  return {
    components: sizePerComponent,
    minWidth,
    minHeight,
    maxNumWide,
    maxNumHigh
  };
}
function buildPackets(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const componentsCount = siz.Csiz;
  for (let c = 0; c < componentsCount; c++) {
    const component = tile.components[c];
    const decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
    const resolutions = [];
    const subbands = [];
    for (let r = 0; r <= decompositionLevelsCount; r++) {
      const blocksDimensions = getBlocksDimensions(context, component, r);
      const resolution = {};
      const scale = 1 << decompositionLevelsCount - r;
      resolution.trx0 = Math.ceil(component.tcx0 / scale);
      resolution.try0 = Math.ceil(component.tcy0 / scale);
      resolution.trx1 = Math.ceil(component.tcx1 / scale);
      resolution.try1 = Math.ceil(component.tcy1 / scale);
      resolution.resLevel = r;
      buildPrecincts(context, resolution, blocksDimensions);
      resolutions.push(resolution);
      let subband;
      if (r === 0) {
        subband = {};
        subband.type = "LL";
        subband.tbx0 = Math.ceil(component.tcx0 / scale);
        subband.tby0 = Math.ceil(component.tcy0 / scale);
        subband.tbx1 = Math.ceil(component.tcx1 / scale);
        subband.tby1 = Math.ceil(component.tcy1 / scale);
        subband.resolution = resolution;
        buildCodeblocks(context, subband, blocksDimensions);
        subbands.push(subband);
        resolution.subbands = [subband];
      } else {
        const bscale = 1 << decompositionLevelsCount - r + 1;
        const resolutionSubbands = [];
        subband = {};
        subband.type = "HL";
        subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
        subband.tby0 = Math.ceil(component.tcy0 / bscale);
        subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
        subband.tby1 = Math.ceil(component.tcy1 / bscale);
        subband.resolution = resolution;
        buildCodeblocks(context, subband, blocksDimensions);
        subbands.push(subband);
        resolutionSubbands.push(subband);
        subband = {};
        subband.type = "LH";
        subband.tbx0 = Math.ceil(component.tcx0 / bscale);
        subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
        subband.tbx1 = Math.ceil(component.tcx1 / bscale);
        subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
        subband.resolution = resolution;
        buildCodeblocks(context, subband, blocksDimensions);
        subbands.push(subband);
        resolutionSubbands.push(subband);
        subband = {};
        subband.type = "HH";
        subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
        subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
        subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
        subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
        subband.resolution = resolution;
        buildCodeblocks(context, subband, blocksDimensions);
        subbands.push(subband);
        resolutionSubbands.push(subband);
        resolution.subbands = resolutionSubbands;
      }
    }
    component.resolutions = resolutions;
    component.subbands = subbands;
  }
  const progressionOrder = tile.codingStyleDefaultParameters.progressionOrder;
  switch (progressionOrder) {
    case 0:
      tile.packetsIterator = new LayerResolutionComponentPositionIterator(context);
      break;
    case 1:
      tile.packetsIterator = new ResolutionLayerComponentPositionIterator(context);
      break;
    case 2:
      tile.packetsIterator = new ResolutionPositionComponentLayerIterator(context);
      break;
    case 3:
      tile.packetsIterator = new PositionComponentResolutionLayerIterator(context);
      break;
    case 4:
      tile.packetsIterator = new ComponentPositionResolutionLayerIterator(context);
      break;
    default:
      throw new JpxError(`Unsupported progression order ${progressionOrder}`);
  }
}
function parseTilePackets(context, data, offset, dataLength) {
  let position = 0;
  let buffer,
    bufferSize = 0,
    skipNextBit = false;
  function readBits(count) {
    while (bufferSize < count) {
      const b = data[offset + position];
      position++;
      if (skipNextBit) {
        buffer = buffer << 7 | b;
        bufferSize += 7;
        skipNextBit = false;
      } else {
        buffer = buffer << 8 | b;
        bufferSize += 8;
      }
      if (b === 0xff) {
        skipNextBit = true;
      }
    }
    bufferSize -= count;
    return buffer >>> bufferSize & (1 << count) - 1;
  }
  function skipMarkerIfEqual(value) {
    if (data[offset + position - 1] === 0xff && data[offset + position] === value) {
      skipBytes(1);
      return true;
    } else if (data[offset + position] === 0xff && data[offset + position + 1] === value) {
      skipBytes(2);
      return true;
    }
    return false;
  }
  function skipBytes(count) {
    position += count;
  }
  function alignToByte() {
    bufferSize = 0;
    if (skipNextBit) {
      position++;
      skipNextBit = false;
    }
  }
  function readCodingpasses() {
    if (readBits(1) === 0) {
      return 1;
    }
    if (readBits(1) === 0) {
      return 2;
    }
    let value = readBits(2);
    if (value < 3) {
      return value + 3;
    }
    value = readBits(5);
    if (value < 31) {
      return value + 6;
    }
    value = readBits(7);
    return value + 37;
  }
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const sopMarkerUsed = context.COD.sopMarkerUsed;
  const ephMarkerUsed = context.COD.ephMarkerUsed;
  const packetsIterator = tile.packetsIterator;
  while (position < dataLength) {
    alignToByte();
    if (sopMarkerUsed && skipMarkerIfEqual(0x91)) {
      skipBytes(4);
    }
    const packet = packetsIterator.nextPacket();
    if (!readBits(1)) {
      continue;
    }
    const layerNumber = packet.layerNumber,
      queue = [];
    let codeblock;
    for (let i = 0, ii = packet.codeblocks.length; i < ii; i++) {
      codeblock = packet.codeblocks[i];
      let precinct = codeblock.precinct;
      const codeblockColumn = codeblock.cbx - precinct.cbxMin;
      const codeblockRow = codeblock.cby - precinct.cbyMin;
      let codeblockIncluded = false;
      let firstTimeInclusion = false;
      let valueReady, zeroBitPlanesTree;
      if (codeblock.included !== undefined) {
        codeblockIncluded = !!readBits(1);
      } else {
        precinct = codeblock.precinct;
        let inclusionTree;
        if (precinct.inclusionTree !== undefined) {
          inclusionTree = precinct.inclusionTree;
        } else {
          const width = precinct.cbxMax - precinct.cbxMin + 1;
          const height = precinct.cbyMax - precinct.cbyMin + 1;
          inclusionTree = new InclusionTree(width, height, layerNumber);
          zeroBitPlanesTree = new TagTree(width, height);
          precinct.inclusionTree = inclusionTree;
          precinct.zeroBitPlanesTree = zeroBitPlanesTree;
          for (let l = 0; l < layerNumber; l++) {
            if (readBits(1) !== 0) {
              throw new JpxError("Invalid tag tree");
            }
          }
        }
        if (inclusionTree.reset(codeblockColumn, codeblockRow, layerNumber)) {
          while (true) {
            if (readBits(1)) {
              valueReady = !inclusionTree.nextLevel();
              if (valueReady) {
                codeblock.included = true;
                codeblockIncluded = firstTimeInclusion = true;
                break;
              }
            } else {
              inclusionTree.incrementValue(layerNumber);
              break;
            }
          }
        }
      }
      if (!codeblockIncluded) {
        continue;
      }
      if (firstTimeInclusion) {
        zeroBitPlanesTree = precinct.zeroBitPlanesTree;
        zeroBitPlanesTree.reset(codeblockColumn, codeblockRow);
        while (true) {
          if (readBits(1)) {
            valueReady = !zeroBitPlanesTree.nextLevel();
            if (valueReady) {
              break;
            }
          } else {
            zeroBitPlanesTree.incrementValue();
          }
        }
        codeblock.zeroBitPlanes = zeroBitPlanesTree.value;
      }
      const codingpasses = readCodingpasses();
      while (readBits(1)) {
        codeblock.Lblock++;
      }
      const codingpassesLog2 = (0, _core_utils.log2)(codingpasses);
      const bits = (codingpasses < 1 << codingpassesLog2 ? codingpassesLog2 - 1 : codingpassesLog2) + codeblock.Lblock;
      const codedDataLength = readBits(bits);
      queue.push({
        codeblock,
        codingpasses,
        dataLength: codedDataLength
      });
    }
    alignToByte();
    if (ephMarkerUsed) {
      skipMarkerIfEqual(0x92);
    }
    while (queue.length > 0) {
      const packetItem = queue.shift();
      codeblock = packetItem.codeblock;
      if (codeblock.data === undefined) {
        codeblock.data = [];
      }
      codeblock.data.push({
        data,
        start: offset + position,
        end: offset + position + packetItem.dataLength,
        codingpasses: packetItem.codingpasses
      });
      position += packetItem.dataLength;
    }
  }
  return position;
}
function copyCoefficients(coefficients, levelWidth, levelHeight, subband, delta, mb, reversible, segmentationSymbolUsed, resetContextProbabilities) {
  const x0 = subband.tbx0;
  const y0 = subband.tby0;
  const width = subband.tbx1 - subband.tbx0;
  const codeblocks = subband.codeblocks;
  const right = subband.type.charAt(0) === "H" ? 1 : 0;
  const bottom = subband.type.charAt(1) === "H" ? levelWidth : 0;
  for (let i = 0, ii = codeblocks.length; i < ii; ++i) {
    const codeblock = codeblocks[i];
    const blockWidth = codeblock.tbx1_ - codeblock.tbx0_;
    const blockHeight = codeblock.tby1_ - codeblock.tby0_;
    if (blockWidth === 0 || blockHeight === 0) {
      continue;
    }
    if (codeblock.data === undefined) {
      continue;
    }
    const bitModel = new BitModel(blockWidth, blockHeight, codeblock.subbandType, codeblock.zeroBitPlanes, mb);
    let currentCodingpassType = 2;
    const data = codeblock.data;
    let totalLength = 0,
      codingpasses = 0;
    let j, jj, dataItem;
    for (j = 0, jj = data.length; j < jj; j++) {
      dataItem = data[j];
      totalLength += dataItem.end - dataItem.start;
      codingpasses += dataItem.codingpasses;
    }
    const encodedData = new Uint8Array(totalLength);
    let position = 0;
    for (j = 0, jj = data.length; j < jj; j++) {
      dataItem = data[j];
      const chunk = dataItem.data.subarray(dataItem.start, dataItem.end);
      encodedData.set(chunk, position);
      position += chunk.length;
    }
    const decoder = new _arithmetic_decoder.ArithmeticDecoder(encodedData, 0, totalLength);
    bitModel.setDecoder(decoder);
    for (j = 0; j < codingpasses; j++) {
      switch (currentCodingpassType) {
        case 0:
          bitModel.runSignificancePropagationPass();
          break;
        case 1:
          bitModel.runMagnitudeRefinementPass();
          break;
        case 2:
          bitModel.runCleanupPass();
          if (segmentationSymbolUsed) {
            bitModel.checkSegmentationSymbol();
          }
          break;
      }
      if (resetContextProbabilities) {
        bitModel.reset();
      }
      currentCodingpassType = (currentCodingpassType + 1) % 3;
    }
    let offset = codeblock.tbx0_ - x0 + (codeblock.tby0_ - y0) * width;
    const sign = bitModel.coefficentsSign;
    const magnitude = bitModel.coefficentsMagnitude;
    const bitsDecoded = bitModel.bitsDecoded;
    const magnitudeCorrection = reversible ? 0 : 0.5;
    let k, n, nb;
    position = 0;
    const interleave = subband.type !== "LL";
    for (j = 0; j < blockHeight; j++) {
      const row = offset / width | 0;
      const levelOffset = 2 * row * (levelWidth - width) + right + bottom;
      for (k = 0; k < blockWidth; k++) {
        n = magnitude[position];
        if (n !== 0) {
          n = (n + magnitudeCorrection) * delta;
          if (sign[position] !== 0) {
            n = -n;
          }
          nb = bitsDecoded[position];
          const pos = interleave ? levelOffset + (offset << 1) : offset;
          if (reversible && nb >= mb) {
            coefficients[pos] = n;
          } else {
            coefficients[pos] = n * (1 << mb - nb);
          }
        }
        offset++;
        position++;
      }
      offset += width - blockWidth;
    }
  }
}
function transformTile(context, tile, c) {
  const component = tile.components[c];
  const codingStyleParameters = component.codingStyleParameters;
  const quantizationParameters = component.quantizationParameters;
  const decompositionLevelsCount = codingStyleParameters.decompositionLevelsCount;
  const spqcds = quantizationParameters.SPqcds;
  const scalarExpounded = quantizationParameters.scalarExpounded;
  const guardBits = quantizationParameters.guardBits;
  const segmentationSymbolUsed = codingStyleParameters.segmentationSymbolUsed;
  const resetContextProbabilities = codingStyleParameters.resetContextProbabilities;
  const precision = context.components[c].precision;
  const reversible = codingStyleParameters.reversibleTransformation;
  const transform = reversible ? new ReversibleTransform() : new IrreversibleTransform();
  const subbandCoefficients = [];
  let b = 0;
  for (let i = 0; i <= decompositionLevelsCount; i++) {
    const resolution = component.resolutions[i];
    const width = resolution.trx1 - resolution.trx0;
    const height = resolution.try1 - resolution.try0;
    const coefficients = new Float32Array(width * height);
    for (let j = 0, jj = resolution.subbands.length; j < jj; j++) {
      let mu, epsilon;
      if (!scalarExpounded) {
        mu = spqcds[0].mu;
        epsilon = spqcds[0].epsilon + (i > 0 ? 1 - i : 0);
      } else {
        mu = spqcds[b].mu;
        epsilon = spqcds[b].epsilon;
        b++;
      }
      const subband = resolution.subbands[j];
      const gainLog2 = SubbandsGainLog2[subband.type];
      const delta = reversible ? 1 : 2 ** (precision + gainLog2 - epsilon) * (1 + mu / 2048);
      const mb = guardBits + epsilon - 1;
      copyCoefficients(coefficients, width, height, subband, delta, mb, reversible, segmentationSymbolUsed, resetContextProbabilities);
    }
    subbandCoefficients.push({
      width,
      height,
      items: coefficients
    });
  }
  const result = transform.calculate(subbandCoefficients, component.tcx0, component.tcy0);
  return {
    left: component.tcx0,
    top: component.tcy0,
    width: result.width,
    height: result.height,
    items: result.items
  };
}
function transformComponents(context) {
  const siz = context.SIZ;
  const components = context.components;
  const componentsCount = siz.Csiz;
  const resultImages = [];
  for (let i = 0, ii = context.tiles.length; i < ii; i++) {
    const tile = context.tiles[i];
    const transformedTiles = [];
    for (let c = 0; c < componentsCount; c++) {
      transformedTiles[c] = transformTile(context, tile, c);
    }
    const tile0 = transformedTiles[0];
    const out = new Uint8ClampedArray(tile0.items.length * componentsCount);
    const result = {
      left: tile0.left,
      top: tile0.top,
      width: tile0.width,
      height: tile0.height,
      items: out
    };
    let shift, offset;
    let pos = 0,
      j,
      jj,
      y0,
      y1,
      y2;
    if (tile.codingStyleDefaultParameters.multipleComponentTransform) {
      const fourComponents = componentsCount === 4;
      const y0items = transformedTiles[0].items;
      const y1items = transformedTiles[1].items;
      const y2items = transformedTiles[2].items;
      const y3items = fourComponents ? transformedTiles[3].items : null;
      shift = components[0].precision - 8;
      offset = (128 << shift) + 0.5;
      const component0 = tile.components[0];
      const alpha01 = componentsCount - 3;
      jj = y0items.length;
      if (!component0.codingStyleParameters.reversibleTransformation) {
        for (j = 0; j < jj; j++, pos += alpha01) {
          y0 = y0items[j] + offset;
          y1 = y1items[j];
          y2 = y2items[j];
          out[pos++] = y0 + 1.402 * y2 >> shift;
          out[pos++] = y0 - 0.34413 * y1 - 0.71414 * y2 >> shift;
          out[pos++] = y0 + 1.772 * y1 >> shift;
        }
      } else {
        for (j = 0; j < jj; j++, pos += alpha01) {
          y0 = y0items[j] + offset;
          y1 = y1items[j];
          y2 = y2items[j];
          const g = y0 - (y2 + y1 >> 2);
          out[pos++] = g + y2 >> shift;
          out[pos++] = g >> shift;
          out[pos++] = g + y1 >> shift;
        }
      }
      if (fourComponents) {
        for (j = 0, pos = 3; j < jj; j++, pos += 4) {
          out[pos] = y3items[j] + offset >> shift;
        }
      }
    } else {
      for (let c = 0; c < componentsCount; c++) {
        const items = transformedTiles[c].items;
        shift = components[c].precision - 8;
        offset = (128 << shift) + 0.5;
        for (pos = c, j = 0, jj = items.length; j < jj; j++) {
          out[pos] = items[j] + offset >> shift;
          pos += componentsCount;
        }
      }
    }
    resultImages.push(result);
  }
  return resultImages;
}
function initializeTile(context, tileIndex) {
  const siz = context.SIZ;
  const componentsCount = siz.Csiz;
  const tile = context.tiles[tileIndex];
  for (let c = 0; c < componentsCount; c++) {
    const component = tile.components[c];
    const qcdOrQcc = context.currentTile.QCC[c] !== undefined ? context.currentTile.QCC[c] : context.currentTile.QCD;
    component.quantizationParameters = qcdOrQcc;
    const codOrCoc = context.currentTile.COC[c] !== undefined ? context.currentTile.COC[c] : context.currentTile.COD;
    component.codingStyleParameters = codOrCoc;
  }
  tile.codingStyleDefaultParameters = context.currentTile.COD;
}
class TagTree {
  constructor(width, height) {
    const levelsLength = (0, _core_utils.log2)(Math.max(width, height)) + 1;
    this.levels = [];
    for (let i = 0; i < levelsLength; i++) {
      const level = {
        width,
        height,
        items: []
      };
      this.levels.push(level);
      width = Math.ceil(width / 2);
      height = Math.ceil(height / 2);
    }
  }
  reset(i, j) {
    let currentLevel = 0,
      value = 0,
      level;
    while (currentLevel < this.levels.length) {
      level = this.levels[currentLevel];
      const index = i + j * level.width;
      if (level.items[index] !== undefined) {
        value = level.items[index];
        break;
      }
      level.index = index;
      i >>= 1;
      j >>= 1;
      currentLevel++;
    }
    currentLevel--;
    level = this.levels[currentLevel];
    level.items[level.index] = value;
    this.currentLevel = currentLevel;
    delete this.value;
  }
  incrementValue() {
    const level = this.levels[this.currentLevel];
    level.items[level.index]++;
  }
  nextLevel() {
    let currentLevel = this.currentLevel;
    let level = this.levels[currentLevel];
    const value = level.items[level.index];
    currentLevel--;
    if (currentLevel < 0) {
      this.value = value;
      return false;
    }
    this.currentLevel = currentLevel;
    level = this.levels[currentLevel];
    level.items[level.index] = value;
    return true;
  }
}
class InclusionTree {
  constructor(width, height, defaultValue) {
    const levelsLength = (0, _core_utils.log2)(Math.max(width, height)) + 1;
    this.levels = [];
    for (let i = 0; i < levelsLength; i++) {
      const items = new Uint8Array(width * height);
      for (let j = 0, jj = items.length; j < jj; j++) {
        items[j] = defaultValue;
      }
      const level = {
        width,
        height,
        items
      };
      this.levels.push(level);
      width = Math.ceil(width / 2);
      height = Math.ceil(height / 2);
    }
  }
  reset(i, j, stopValue) {
    let currentLevel = 0;
    while (currentLevel < this.levels.length) {
      const level = this.levels[currentLevel];
      const index = i + j * level.width;
      level.index = index;
      const value = level.items[index];
      if (value === 0xff) {
        break;
      }
      if (value > stopValue) {
        this.currentLevel = currentLevel;
        this.propagateValues();
        return false;
      }
      i >>= 1;
      j >>= 1;
      currentLevel++;
    }
    this.currentLevel = currentLevel - 1;
    return true;
  }
  incrementValue(stopValue) {
    const level = this.levels[this.currentLevel];
    level.items[level.index] = stopValue + 1;
    this.propagateValues();
  }
  propagateValues() {
    let levelIndex = this.currentLevel;
    let level = this.levels[levelIndex];
    const currentValue = level.items[level.index];
    while (--levelIndex >= 0) {
      level = this.levels[levelIndex];
      level.items[level.index] = currentValue;
    }
  }
  nextLevel() {
    let currentLevel = this.currentLevel;
    let level = this.levels[currentLevel];
    const value = level.items[level.index];
    level.items[level.index] = 0xff;
    currentLevel--;
    if (currentLevel < 0) {
      return false;
    }
    this.currentLevel = currentLevel;
    level = this.levels[currentLevel];
    level.items[level.index] = value;
    return true;
  }
}
const BitModel = function BitModelClosure() {
  const UNIFORM_CONTEXT = 17;
  const RUNLENGTH_CONTEXT = 18;
  const LLAndLHContextsLabel = new Uint8Array([0, 5, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 1, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8]);
  const HLContextLabel = new Uint8Array([0, 3, 4, 0, 5, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 1, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8]);
  const HHContextLabel = new Uint8Array([0, 1, 2, 0, 1, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 0, 3, 4, 5, 0, 4, 5, 5, 0, 5, 5, 5, 0, 0, 0, 0, 0, 6, 7, 7, 0, 7, 7, 7, 0, 7, 7, 7, 0, 0, 0, 0, 0, 8, 8, 8, 0, 8, 8, 8, 0, 8, 8, 8, 0, 0, 0, 0, 0, 8, 8, 8, 0, 8, 8, 8, 0, 8, 8, 8]);
  class BitModel {
    constructor(width, height, subband, zeroBitPlanes, mb) {
      this.width = width;
      this.height = height;
      let contextLabelTable;
      if (subband === "HH") {
        contextLabelTable = HHContextLabel;
      } else if (subband === "HL") {
        contextLabelTable = HLContextLabel;
      } else {
        contextLabelTable = LLAndLHContextsLabel;
      }
      this.contextLabelTable = contextLabelTable;
      const coefficientCount = width * height;
      this.neighborsSignificance = new Uint8Array(coefficientCount);
      this.coefficentsSign = new Uint8Array(coefficientCount);
      let coefficentsMagnitude;
      if (mb > 14) {
        coefficentsMagnitude = new Uint32Array(coefficientCount);
      } else if (mb > 6) {
        coefficentsMagnitude = new Uint16Array(coefficientCount);
      } else {
        coefficentsMagnitude = new Uint8Array(coefficientCount);
      }
      this.coefficentsMagnitude = coefficentsMagnitude;
      this.processingFlags = new Uint8Array(coefficientCount);
      const bitsDecoded = new Uint8Array(coefficientCount);
      if (zeroBitPlanes !== 0) {
        for (let i = 0; i < coefficientCount; i++) {
          bitsDecoded[i] = zeroBitPlanes;
        }
      }
      this.bitsDecoded = bitsDecoded;
      this.reset();
    }
    setDecoder(decoder) {
      this.decoder = decoder;
    }
    reset() {
      this.contexts = new Int8Array(19);
      this.contexts[0] = 4 << 1 | 0;
      this.contexts[UNIFORM_CONTEXT] = 46 << 1 | 0;
      this.contexts[RUNLENGTH_CONTEXT] = 3 << 1 | 0;
    }
    setNeighborsSignificance(row, column, index) {
      const neighborsSignificance = this.neighborsSignificance;
      const width = this.width,
        height = this.height;
      const left = column > 0;
      const right = column + 1 < width;
      let i;
      if (row > 0) {
        i = index - width;
        if (left) {
          neighborsSignificance[i - 1] += 0x10;
        }
        if (right) {
          neighborsSignificance[i + 1] += 0x10;
        }
        neighborsSignificance[i] += 0x04;
      }
      if (row + 1 < height) {
        i = index + width;
        if (left) {
          neighborsSignificance[i - 1] += 0x10;
        }
        if (right) {
          neighborsSignificance[i + 1] += 0x10;
        }
        neighborsSignificance[i] += 0x04;
      }
      if (left) {
        neighborsSignificance[index - 1] += 0x01;
      }
      if (right) {
        neighborsSignificance[index + 1] += 0x01;
      }
      neighborsSignificance[index] |= 0x80;
    }
    runSignificancePropagationPass() {
      const decoder = this.decoder;
      const width = this.width,
        height = this.height;
      const coefficentsMagnitude = this.coefficentsMagnitude;
      const coefficentsSign = this.coefficentsSign;
      const neighborsSignificance = this.neighborsSignificance;
      const processingFlags = this.processingFlags;
      const contexts = this.contexts;
      const labels = this.contextLabelTable;
      const bitsDecoded = this.bitsDecoded;
      const processedInverseMask = ~1;
      const processedMask = 1;
      const firstMagnitudeBitMask = 2;
      for (let i0 = 0; i0 < height; i0 += 4) {
        for (let j = 0; j < width; j++) {
          let index = i0 * width + j;
          for (let i1 = 0; i1 < 4; i1++, index += width) {
            const i = i0 + i1;
            if (i >= height) {
              break;
            }
            processingFlags[index] &= processedInverseMask;
            if (coefficentsMagnitude[index] || !neighborsSignificance[index]) {
              continue;
            }
            const contextLabel = labels[neighborsSignificance[index]];
            const decision = decoder.readBit(contexts, contextLabel);
            if (decision) {
              const sign = this.decodeSignBit(i, j, index);
              coefficentsSign[index] = sign;
              coefficentsMagnitude[index] = 1;
              this.setNeighborsSignificance(i, j, index);
              processingFlags[index] |= firstMagnitudeBitMask;
            }
            bitsDecoded[index]++;
            processingFlags[index] |= processedMask;
          }
        }
      }
    }
    decodeSignBit(row, column, index) {
      const width = this.width,
        height = this.height;
      const coefficentsMagnitude = this.coefficentsMagnitude;
      const coefficentsSign = this.coefficentsSign;
      let contribution, sign0, sign1, significance1;
      let contextLabel, decoded;
      significance1 = column > 0 && coefficentsMagnitude[index - 1] !== 0;
      if (column + 1 < width && coefficentsMagnitude[index + 1] !== 0) {
        sign1 = coefficentsSign[index + 1];
        if (significance1) {
          sign0 = coefficentsSign[index - 1];
          contribution = 1 - sign1 - sign0;
        } else {
          contribution = 1 - sign1 - sign1;
        }
      } else if (significance1) {
        sign0 = coefficentsSign[index - 1];
        contribution = 1 - sign0 - sign0;
      } else {
        contribution = 0;
      }
      const horizontalContribution = 3 * contribution;
      significance1 = row > 0 && coefficentsMagnitude[index - width] !== 0;
      if (row + 1 < height && coefficentsMagnitude[index + width] !== 0) {
        sign1 = coefficentsSign[index + width];
        if (significance1) {
          sign0 = coefficentsSign[index - width];
          contribution = 1 - sign1 - sign0 + horizontalContribution;
        } else {
          contribution = 1 - sign1 - sign1 + horizontalContribution;
        }
      } else if (significance1) {
        sign0 = coefficentsSign[index - width];
        contribution = 1 - sign0 - sign0 + horizontalContribution;
      } else {
        contribution = horizontalContribution;
      }
      if (contribution >= 0) {
        contextLabel = 9 + contribution;
        decoded = this.decoder.readBit(this.contexts, contextLabel);
      } else {
        contextLabel = 9 - contribution;
        decoded = this.decoder.readBit(this.contexts, contextLabel) ^ 1;
      }
      return decoded;
    }
    runMagnitudeRefinementPass() {
      const decoder = this.decoder;
      const width = this.width,
        height = this.height;
      const coefficentsMagnitude = this.coefficentsMagnitude;
      const neighborsSignificance = this.neighborsSignificance;
      const contexts = this.contexts;
      const bitsDecoded = this.bitsDecoded;
      const processingFlags = this.processingFlags;
      const processedMask = 1;
      const firstMagnitudeBitMask = 2;
      const length = width * height;
      const width4 = width * 4;
      for (let index0 = 0, indexNext; index0 < length; index0 = indexNext) {
        indexNext = Math.min(length, index0 + width4);
        for (let j = 0; j < width; j++) {
          for (let index = index0 + j; index < indexNext; index += width) {
            if (!coefficentsMagnitude[index] || (processingFlags[index] & processedMask) !== 0) {
              continue;
            }
            let contextLabel = 16;
            if ((processingFlags[index] & firstMagnitudeBitMask) !== 0) {
              processingFlags[index] ^= firstMagnitudeBitMask;
              const significance = neighborsSignificance[index] & 127;
              contextLabel = significance === 0 ? 15 : 14;
            }
            const bit = decoder.readBit(contexts, contextLabel);
            coefficentsMagnitude[index] = coefficentsMagnitude[index] << 1 | bit;
            bitsDecoded[index]++;
            processingFlags[index] |= processedMask;
          }
        }
      }
    }
    runCleanupPass() {
      const decoder = this.decoder;
      const width = this.width,
        height = this.height;
      const neighborsSignificance = this.neighborsSignificance;
      const coefficentsMagnitude = this.coefficentsMagnitude;
      const coefficentsSign = this.coefficentsSign;
      const contexts = this.contexts;
      const labels = this.contextLabelTable;
      const bitsDecoded = this.bitsDecoded;
      const processingFlags = this.processingFlags;
      const processedMask = 1;
      const firstMagnitudeBitMask = 2;
      const oneRowDown = width;
      const twoRowsDown = width * 2;
      const threeRowsDown = width * 3;
      let iNext;
      for (let i0 = 0; i0 < height; i0 = iNext) {
        iNext = Math.min(i0 + 4, height);
        const indexBase = i0 * width;
        const checkAllEmpty = i0 + 3 < height;
        for (let j = 0; j < width; j++) {
          const index0 = indexBase + j;
          const allEmpty = checkAllEmpty && processingFlags[index0] === 0 && processingFlags[index0 + oneRowDown] === 0 && processingFlags[index0 + twoRowsDown] === 0 && processingFlags[index0 + threeRowsDown] === 0 && neighborsSignificance[index0] === 0 && neighborsSignificance[index0 + oneRowDown] === 0 && neighborsSignificance[index0 + twoRowsDown] === 0 && neighborsSignificance[index0 + threeRowsDown] === 0;
          let i1 = 0,
            index = index0;
          let i = i0,
            sign;
          if (allEmpty) {
            const hasSignificantCoefficent = decoder.readBit(contexts, RUNLENGTH_CONTEXT);
            if (!hasSignificantCoefficent) {
              bitsDecoded[index0]++;
              bitsDecoded[index0 + oneRowDown]++;
              bitsDecoded[index0 + twoRowsDown]++;
              bitsDecoded[index0 + threeRowsDown]++;
              continue;
            }
            i1 = decoder.readBit(contexts, UNIFORM_CONTEXT) << 1 | decoder.readBit(contexts, UNIFORM_CONTEXT);
            if (i1 !== 0) {
              i = i0 + i1;
              index += i1 * width;
            }
            sign = this.decodeSignBit(i, j, index);
            coefficentsSign[index] = sign;
            coefficentsMagnitude[index] = 1;
            this.setNeighborsSignificance(i, j, index);
            processingFlags[index] |= firstMagnitudeBitMask;
            index = index0;
            for (let i2 = i0; i2 <= i; i2++, index += width) {
              bitsDecoded[index]++;
            }
            i1++;
          }
          for (i = i0 + i1; i < iNext; i++, index += width) {
            if (coefficentsMagnitude[index] || (processingFlags[index] & processedMask) !== 0) {
              continue;
            }
            const contextLabel = labels[neighborsSignificance[index]];
            const decision = decoder.readBit(contexts, contextLabel);
            if (decision === 1) {
              sign = this.decodeSignBit(i, j, index);
              coefficentsSign[index] = sign;
              coefficentsMagnitude[index] = 1;
              this.setNeighborsSignificance(i, j, index);
              processingFlags[index] |= firstMagnitudeBitMask;
            }
            bitsDecoded[index]++;
          }
        }
      }
    }
    checkSegmentationSymbol() {
      const decoder = this.decoder;
      const contexts = this.contexts;
      const symbol = decoder.readBit(contexts, UNIFORM_CONTEXT) << 3 | decoder.readBit(contexts, UNIFORM_CONTEXT) << 2 | decoder.readBit(contexts, UNIFORM_CONTEXT) << 1 | decoder.readBit(contexts, UNIFORM_CONTEXT);
      if (symbol !== 0xa) {
        throw new JpxError("Invalid segmentation symbol");
      }
    }
  }
  return BitModel;
}();
class Transform {
  constructor() {
    if (this.constructor === Transform) {
      (0, _util.unreachable)("Cannot initialize Transform.");
    }
  }
  calculate(subbands, u0, v0) {
    let ll = subbands[0];
    for (let i = 1, ii = subbands.length; i < ii; i++) {
      ll = this.iterate(ll, subbands[i], u0, v0);
    }
    return ll;
  }
  extend(buffer, offset, size) {
    let i1 = offset - 1,
      j1 = offset + 1;
    let i2 = offset + size - 2,
      j2 = offset + size;
    buffer[i1--] = buffer[j1++];
    buffer[j2++] = buffer[i2--];
    buffer[i1--] = buffer[j1++];
    buffer[j2++] = buffer[i2--];
    buffer[i1--] = buffer[j1++];
    buffer[j2++] = buffer[i2--];
    buffer[i1] = buffer[j1];
    buffer[j2] = buffer[i2];
  }
  filter(x, offset, length) {
    (0, _util.unreachable)("Abstract method `filter` called");
  }
  iterate(ll, hl_lh_hh, u0, v0) {
    const llWidth = ll.width,
      llHeight = ll.height;
    let llItems = ll.items;
    const width = hl_lh_hh.width;
    const height = hl_lh_hh.height;
    const items = hl_lh_hh.items;
    let i, j, k, l, u, v;
    for (k = 0, i = 0; i < llHeight; i++) {
      l = i * 2 * width;
      for (j = 0; j < llWidth; j++, k++, l += 2) {
        items[l] = llItems[k];
      }
    }
    llItems = ll.items = null;
    const bufferPadding = 4;
    const rowBuffer = new Float32Array(width + 2 * bufferPadding);
    if (width === 1) {
      if ((u0 & 1) !== 0) {
        for (v = 0, k = 0; v < height; v++, k += width) {
          items[k] *= 0.5;
        }
      }
    } else {
      for (v = 0, k = 0; v < height; v++, k += width) {
        rowBuffer.set(items.subarray(k, k + width), bufferPadding);
        this.extend(rowBuffer, bufferPadding, width);
        this.filter(rowBuffer, bufferPadding, width);
        items.set(rowBuffer.subarray(bufferPadding, bufferPadding + width), k);
      }
    }
    let numBuffers = 16;
    const colBuffers = [];
    for (i = 0; i < numBuffers; i++) {
      colBuffers.push(new Float32Array(height + 2 * bufferPadding));
    }
    let b,
      currentBuffer = 0;
    ll = bufferPadding + height;
    if (height === 1) {
      if ((v0 & 1) !== 0) {
        for (u = 0; u < width; u++) {
          items[u] *= 0.5;
        }
      }
    } else {
      for (u = 0; u < width; u++) {
        if (currentBuffer === 0) {
          numBuffers = Math.min(width - u, numBuffers);
          for (k = u, l = bufferPadding; l < ll; k += width, l++) {
            for (b = 0; b < numBuffers; b++) {
              colBuffers[b][l] = items[k + b];
            }
          }
          currentBuffer = numBuffers;
        }
        currentBuffer--;
        const buffer = colBuffers[currentBuffer];
        this.extend(buffer, bufferPadding, height);
        this.filter(buffer, bufferPadding, height);
        if (currentBuffer === 0) {
          k = u - numBuffers + 1;
          for (l = bufferPadding; l < ll; k += width, l++) {
            for (b = 0; b < numBuffers; b++) {
              items[k + b] = colBuffers[b][l];
            }
          }
        }
      }
    }
    return {
      width,
      height,
      items
    };
  }
}
class IrreversibleTransform extends Transform {
  filter(x, offset, length) {
    const len = length >> 1;
    offset |= 0;
    let j, n, current, next;
    const alpha = -1.586134342059924;
    const beta = -0.052980118572961;
    const gamma = 0.882911075530934;
    const delta = 0.443506852043971;
    const K = 1.230174104914001;
    const K_ = 1 / K;
    j = offset - 3;
    for (n = len + 4; n--; j += 2) {
      x[j] *= K_;
    }
    j = offset - 2;
    current = delta * x[j - 1];
    for (n = len + 3; n--; j += 2) {
      next = delta * x[j + 1];
      x[j] = K * x[j] - current - next;
      if (n--) {
        j += 2;
        current = delta * x[j + 1];
        x[j] = K * x[j] - current - next;
      } else {
        break;
      }
    }
    j = offset - 1;
    current = gamma * x[j - 1];
    for (n = len + 2; n--; j += 2) {
      next = gamma * x[j + 1];
      x[j] -= current + next;
      if (n--) {
        j += 2;
        current = gamma * x[j + 1];
        x[j] -= current + next;
      } else {
        break;
      }
    }
    j = offset;
    current = beta * x[j - 1];
    for (n = len + 1; n--; j += 2) {
      next = beta * x[j + 1];
      x[j] -= current + next;
      if (n--) {
        j += 2;
        current = beta * x[j + 1];
        x[j] -= current + next;
      } else {
        break;
      }
    }
    if (len !== 0) {
      j = offset + 1;
      current = alpha * x[j - 1];
      for (n = len; n--; j += 2) {
        next = alpha * x[j + 1];
        x[j] -= current + next;
        if (n--) {
          j += 2;
          current = alpha * x[j + 1];
          x[j] -= current + next;
        } else {
          break;
        }
      }
    }
  }
}
class ReversibleTransform extends Transform {
  filter(x, offset, length) {
    const len = length >> 1;
    offset |= 0;
    let j, n;
    for (j = offset, n = len + 1; n--; j += 2) {
      x[j] -= x[j - 1] + x[j + 1] + 2 >> 2;
    }
    for (j = offset + 1, n = len; n--; j += 2) {
      x[j] += x[j - 1] + x[j + 1] >> 1;
    }
  }
}

/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __w_pdfjs_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __w_pdfjs_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
Object.defineProperty(exports, "Jbig2Image", ({
  enumerable: true,
  get: function () {
    return _jbig.Jbig2Image;
  }
}));
Object.defineProperty(exports, "JpegImage", ({
  enumerable: true,
  get: function () {
    return _jpg.JpegImage;
  }
}));
Object.defineProperty(exports, "JpxImage", ({
  enumerable: true,
  get: function () {
    return _jpx.JpxImage;
  }
}));
Object.defineProperty(exports, "getVerbosityLevel", ({
  enumerable: true,
  get: function () {
    return _util.getVerbosityLevel;
  }
}));
Object.defineProperty(exports, "setVerbosityLevel", ({
  enumerable: true,
  get: function () {
    return _util.setVerbosityLevel;
  }
}));
var _util = __w_pdfjs_require__(1);
var _jbig = __w_pdfjs_require__(2);
var _jpg = __w_pdfjs_require__(8);
var _jpx = __w_pdfjs_require__(9);
const pdfjsVersion = '3.4.120';
const pdfjsBuild = 'af6414988';
})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=pdf.image_decoders.js.map