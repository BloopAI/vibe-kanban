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
exports.PopupAnnotation = exports.MarkupAnnotation = exports.AnnotationFactory = exports.AnnotationBorderStyle = exports.Annotation = void 0;
exports.getQuadPoints = getQuadPoints;
var _util = require("../shared/util.js");
var _core_utils = require("./core_utils.js");
var _default_appearance = require("./default_appearance.js");
var _primitives = require("./primitives.js");
var _writer = require("./writer.js");
var _base_stream = require("./base_stream.js");
var _bidi = require("./bidi.js");
var _catalog = require("./catalog.js");
var _colorspace = require("./colorspace.js");
var _file_spec = require("./file_spec.js");
var _object_loader = require("./object_loader.js");
var _operator_list = require("./operator_list.js");
var _stream = require("./stream.js");
var _factory = require("./xfa/factory.js");
class AnnotationFactory {
  static create(xref, ref, pdfManager, idFactory, collectFields) {
    return Promise.all([pdfManager.ensureCatalog("acroForm"), pdfManager.ensureCatalog("baseUrl"), pdfManager.ensureCatalog("attachments"), pdfManager.ensureDoc("xfaDatasets"), collectFields ? this._getPageIndex(xref, ref, pdfManager) : -1]).then(([acroForm, baseUrl, attachments, xfaDatasets, pageIndex]) => pdfManager.ensure(this, "_create", [xref, ref, pdfManager, idFactory, acroForm, attachments, xfaDatasets, collectFields, pageIndex]));
  }
  static _create(xref, ref, pdfManager, idFactory, acroForm, attachments = null, xfaDatasets, collectFields, pageIndex = -1) {
    const dict = xref.fetchIfRef(ref);
    if (!(dict instanceof _primitives.Dict)) {
      return undefined;
    }
    const id = ref instanceof _primitives.Ref ? ref.toString() : `annot_${idFactory.createObjId()}`;
    let subtype = dict.get("Subtype");
    subtype = subtype instanceof _primitives.Name ? subtype.name : null;
    const acroFormDict = acroForm instanceof _primitives.Dict ? acroForm : _primitives.Dict.empty;
    const parameters = {
      xref,
      ref,
      dict,
      subtype,
      id,
      pdfManager,
      acroForm: acroFormDict,
      attachments,
      xfaDatasets,
      collectFields,
      needAppearances: !collectFields && acroFormDict.get("NeedAppearances") === true,
      pageIndex,
      isOffscreenCanvasSupported: _util.FeatureTest.isOffscreenCanvasSupported && pdfManager.evaluatorOptions.isOffscreenCanvasSupported
    };
    switch (subtype) {
      case "Link":
        return new LinkAnnotation(parameters);
      case "Text":
        return new TextAnnotation(parameters);
      case "Widget":
        let fieldType = (0, _core_utils.getInheritableProperty)({
          dict,
          key: "FT"
        });
        fieldType = fieldType instanceof _primitives.Name ? fieldType.name : null;
        switch (fieldType) {
          case "Tx":
            return new TextWidgetAnnotation(parameters);
          case "Btn":
            return new ButtonWidgetAnnotation(parameters);
          case "Ch":
            return new ChoiceWidgetAnnotation(parameters);
          case "Sig":
            return new SignatureWidgetAnnotation(parameters);
        }
        (0, _util.warn)(`Unimplemented widget field type "${fieldType}", ` + "falling back to base field type.");
        return new WidgetAnnotation(parameters);
      case "Popup":
        return new PopupAnnotation(parameters);
      case "FreeText":
        return new FreeTextAnnotation(parameters);
      case "Line":
        return new LineAnnotation(parameters);
      case "Square":
        return new SquareAnnotation(parameters);
      case "Circle":
        return new CircleAnnotation(parameters);
      case "PolyLine":
        return new PolylineAnnotation(parameters);
      case "Polygon":
        return new PolygonAnnotation(parameters);
      case "Caret":
        return new CaretAnnotation(parameters);
      case "Ink":
        return new InkAnnotation(parameters);
      case "Highlight":
        return new HighlightAnnotation(parameters);
      case "Underline":
        return new UnderlineAnnotation(parameters);
      case "Squiggly":
        return new SquigglyAnnotation(parameters);
      case "StrikeOut":
        return new StrikeOutAnnotation(parameters);
      case "Stamp":
        return new StampAnnotation(parameters);
      case "FileAttachment":
        return new FileAttachmentAnnotation(parameters);
      default:
        if (!collectFields) {
          if (!subtype) {
            (0, _util.warn)("Annotation is missing the required /Subtype.");
          } else {
            (0, _util.warn)(`Unimplemented annotation type "${subtype}", ` + "falling back to base annotation.");
          }
        }
        return new Annotation(parameters);
    }
  }
  static async _getPageIndex(xref, ref, pdfManager) {
    try {
      const annotDict = await xref.fetchIfRefAsync(ref);
      if (!(annotDict instanceof _primitives.Dict)) {
        return -1;
      }
      const pageRef = annotDict.getRaw("P");
      if (!(pageRef instanceof _primitives.Ref)) {
        return -1;
      }
      const pageIndex = await pdfManager.ensureCatalog("getPageIndex", [pageRef]);
      return pageIndex;
    } catch (ex) {
      (0, _util.warn)(`_getPageIndex: "${ex}".`);
      return -1;
    }
  }
  static async saveNewAnnotations(evaluator, task, annotations) {
    const xref = evaluator.xref;
    let baseFontRef;
    const dependencies = [];
    const promises = [];
    for (const annotation of annotations) {
      switch (annotation.annotationType) {
        case _util.AnnotationEditorType.FREETEXT:
          if (!baseFontRef) {
            const baseFont = new _primitives.Dict(xref);
            baseFont.set("BaseFont", _primitives.Name.get("Helvetica"));
            baseFont.set("Type", _primitives.Name.get("Font"));
            baseFont.set("Subtype", _primitives.Name.get("Type1"));
            baseFont.set("Encoding", _primitives.Name.get("WinAnsiEncoding"));
            const buffer = [];
            baseFontRef = xref.getNewTemporaryRef();
            (0, _writer.writeObject)(baseFontRef, baseFont, buffer, null);
            dependencies.push({
              ref: baseFontRef,
              data: buffer.join("")
            });
          }
          promises.push(FreeTextAnnotation.createNewAnnotation(xref, annotation, dependencies, {
            evaluator,
            task,
            baseFontRef
          }));
          break;
        case _util.AnnotationEditorType.INK:
          promises.push(InkAnnotation.createNewAnnotation(xref, annotation, dependencies));
      }
    }
    return {
      annotations: await Promise.all(promises),
      dependencies
    };
  }
  static async printNewAnnotations(evaluator, task, annotations) {
    if (!annotations) {
      return null;
    }
    const xref = evaluator.xref;
    const promises = [];
    const isOffscreenCanvasSupported = _util.FeatureTest.isOffscreenCanvasSupported && evaluator.options.isOffscreenCanvasSupported;
    for (const annotation of annotations) {
      switch (annotation.annotationType) {
        case _util.AnnotationEditorType.FREETEXT:
          promises.push(FreeTextAnnotation.createNewPrintAnnotation(xref, annotation, {
            evaluator,
            task,
            isOffscreenCanvasSupported
          }));
          break;
        case _util.AnnotationEditorType.INK:
          promises.push(InkAnnotation.createNewPrintAnnotation(xref, annotation, {
            isOffscreenCanvasSupported
          }));
          break;
      }
    }
    return Promise.all(promises);
  }
}
exports.AnnotationFactory = AnnotationFactory;
function getRgbColor(color, defaultColor = new Uint8ClampedArray(3)) {
  if (!Array.isArray(color)) {
    return defaultColor;
  }
  const rgbColor = defaultColor || new Uint8ClampedArray(3);
  switch (color.length) {
    case 0:
      return null;
    case 1:
      _colorspace.ColorSpace.singletons.gray.getRgbItem(color, 0, rgbColor, 0);
      return rgbColor;
    case 3:
      _colorspace.ColorSpace.singletons.rgb.getRgbItem(color, 0, rgbColor, 0);
      return rgbColor;
    case 4:
      _colorspace.ColorSpace.singletons.cmyk.getRgbItem(color, 0, rgbColor, 0);
      return rgbColor;
    default:
      return defaultColor;
  }
}
function getPdfColorArray(color) {
  return Array.from(color, c => c / 255);
}
function getQuadPoints(dict, rect) {
  const quadPoints = dict.getArray("QuadPoints");
  if (!Array.isArray(quadPoints) || quadPoints.length === 0 || quadPoints.length % 8 > 0) {
    return null;
  }
  const quadPointsLists = [];
  for (let i = 0, ii = quadPoints.length / 8; i < ii; i++) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let j = i * 8, jj = i * 8 + 8; j < jj; j += 2) {
      const x = quadPoints[j];
      const y = quadPoints[j + 1];
      minX = Math.min(x, minX);
      maxX = Math.max(x, maxX);
      minY = Math.min(y, minY);
      maxY = Math.max(y, maxY);
    }
    if (rect !== null && (minX < rect[0] || maxX > rect[2] || minY < rect[1] || maxY > rect[3])) {
      return null;
    }
    quadPointsLists.push([{
      x: minX,
      y: maxY
    }, {
      x: maxX,
      y: maxY
    }, {
      x: minX,
      y: minY
    }, {
      x: maxX,
      y: minY
    }]);
  }
  return quadPointsLists;
}
function getTransformMatrix(rect, bbox, matrix) {
  const [minX, minY, maxX, maxY] = _util.Util.getAxialAlignedBoundingBox(bbox, matrix);
  if (minX === maxX || minY === maxY) {
    return [1, 0, 0, 1, rect[0], rect[1]];
  }
  const xRatio = (rect[2] - rect[0]) / (maxX - minX);
  const yRatio = (rect[3] - rect[1]) / (maxY - minY);
  return [xRatio, 0, 0, yRatio, rect[0] - minX * xRatio, rect[1] - minY * yRatio];
}
class Annotation {
  constructor(params) {
    const {
      dict,
      xref
    } = params;
    this.setTitle(dict.get("T"));
    this.setContents(dict.get("Contents"));
    this.setModificationDate(dict.get("M"));
    this.setFlags(dict.get("F"));
    this.setRectangle(dict.getArray("Rect"));
    this.setColor(dict.getArray("C"));
    this.setBorderStyle(dict);
    this.setAppearance(dict);
    this.setOptionalContent(dict);
    const MK = dict.get("MK");
    this.setBorderAndBackgroundColors(MK);
    this.setRotation(MK);
    this._streams = [];
    if (this.appearance) {
      this._streams.push(this.appearance);
    }
    this.data = {
      annotationFlags: this.flags,
      borderStyle: this.borderStyle,
      color: this.color,
      backgroundColor: this.backgroundColor,
      borderColor: this.borderColor,
      rotation: this.rotation,
      contentsObj: this._contents,
      hasAppearance: !!this.appearance,
      id: params.id,
      modificationDate: this.modificationDate,
      rect: this.rectangle,
      subtype: params.subtype,
      hasOwnCanvas: false
    };
    if (params.collectFields) {
      const kids = dict.get("Kids");
      if (Array.isArray(kids)) {
        const kidIds = [];
        for (const kid of kids) {
          if (kid instanceof _primitives.Ref) {
            kidIds.push(kid.toString());
          }
        }
        if (kidIds.length !== 0) {
          this.data.kidIds = kidIds;
        }
      }
      this.data.actions = (0, _core_utils.collectActions)(xref, dict, _util.AnnotationActionEventType);
      this.data.fieldName = this._constructFieldName(dict);
      this.data.pageIndex = params.pageIndex;
    }
    this._isOffscreenCanvasSupported = params.isOffscreenCanvasSupported;
    this._fallbackFontDict = null;
    this._needAppearances = false;
  }
  _hasFlag(flags, flag) {
    return !!(flags & flag);
  }
  _isViewable(flags) {
    return !this._hasFlag(flags, _util.AnnotationFlag.INVISIBLE) && !this._hasFlag(flags, _util.AnnotationFlag.NOVIEW);
  }
  _isPrintable(flags) {
    return this._hasFlag(flags, _util.AnnotationFlag.PRINT) && !this._hasFlag(flags, _util.AnnotationFlag.INVISIBLE);
  }
  mustBeViewed(annotationStorage) {
    const storageEntry = annotationStorage && annotationStorage.get(this.data.id);
    if (storageEntry && storageEntry.hidden !== undefined) {
      return !storageEntry.hidden;
    }
    return this.viewable && !this._hasFlag(this.flags, _util.AnnotationFlag.HIDDEN);
  }
  mustBePrinted(annotationStorage) {
    const storageEntry = annotationStorage && annotationStorage.get(this.data.id);
    if (storageEntry && storageEntry.print !== undefined) {
      return storageEntry.print;
    }
    return this.printable;
  }
  get viewable() {
    if (this.data.quadPoints === null) {
      return false;
    }
    if (this.flags === 0) {
      return true;
    }
    return this._isViewable(this.flags);
  }
  get printable() {
    if (this.data.quadPoints === null) {
      return false;
    }
    if (this.flags === 0) {
      return false;
    }
    return this._isPrintable(this.flags);
  }
  _parseStringHelper(data) {
    const str = typeof data === "string" ? (0, _util.stringToPDFString)(data) : "";
    const dir = str && (0, _bidi.bidi)(str).dir === "rtl" ? "rtl" : "ltr";
    return {
      str,
      dir
    };
  }
  setDefaultAppearance(params) {
    const defaultAppearance = (0, _core_utils.getInheritableProperty)({
      dict: params.dict,
      key: "DA"
    }) || params.acroForm.get("DA");
    this._defaultAppearance = typeof defaultAppearance === "string" ? defaultAppearance : "";
    this.data.defaultAppearanceData = (0, _default_appearance.parseDefaultAppearance)(this._defaultAppearance);
  }
  setTitle(title) {
    this._title = this._parseStringHelper(title);
  }
  setContents(contents) {
    this._contents = this._parseStringHelper(contents);
  }
  setModificationDate(modificationDate) {
    this.modificationDate = typeof modificationDate === "string" ? modificationDate : null;
  }
  setFlags(flags) {
    this.flags = Number.isInteger(flags) && flags > 0 ? flags : 0;
  }
  hasFlag(flag) {
    return this._hasFlag(this.flags, flag);
  }
  setRectangle(rectangle) {
    if (Array.isArray(rectangle) && rectangle.length === 4) {
      this.rectangle = _util.Util.normalizeRect(rectangle);
    } else {
      this.rectangle = [0, 0, 0, 0];
    }
  }
  setColor(color) {
    this.color = getRgbColor(color);
  }
  setLineEndings(lineEndings) {
    this.lineEndings = ["None", "None"];
    if (Array.isArray(lineEndings) && lineEndings.length === 2) {
      for (let i = 0; i < 2; i++) {
        const obj = lineEndings[i];
        if (obj instanceof _primitives.Name) {
          switch (obj.name) {
            case "None":
              continue;
            case "Square":
            case "Circle":
            case "Diamond":
            case "OpenArrow":
            case "ClosedArrow":
            case "Butt":
            case "ROpenArrow":
            case "RClosedArrow":
            case "Slash":
              this.lineEndings[i] = obj.name;
              continue;
          }
        }
        (0, _util.warn)(`Ignoring invalid lineEnding: ${obj}`);
      }
    }
  }
  setRotation(mk) {
    this.rotation = 0;
    if (mk instanceof _primitives.Dict) {
      let angle = mk.get("R") || 0;
      if (Number.isInteger(angle) && angle !== 0) {
        angle %= 360;
        if (angle < 0) {
          angle += 360;
        }
        if (angle % 90 === 0) {
          this.rotation = angle;
        }
      }
    }
  }
  setBorderAndBackgroundColors(mk) {
    if (mk instanceof _primitives.Dict) {
      this.borderColor = getRgbColor(mk.getArray("BC"), null);
      this.backgroundColor = getRgbColor(mk.getArray("BG"), null);
    } else {
      this.borderColor = this.backgroundColor = null;
    }
  }
  setBorderStyle(borderStyle) {
    this.borderStyle = new AnnotationBorderStyle();
    if (!(borderStyle instanceof _primitives.Dict)) {
      return;
    }
    if (borderStyle.has("BS")) {
      const dict = borderStyle.get("BS");
      const dictType = dict.get("Type");
      if (!dictType || (0, _primitives.isName)(dictType, "Border")) {
        this.borderStyle.setWidth(dict.get("W"), this.rectangle);
        this.borderStyle.setStyle(dict.get("S"));
        this.borderStyle.setDashArray(dict.getArray("D"));
      }
    } else if (borderStyle.has("Border")) {
      const array = borderStyle.getArray("Border");
      if (Array.isArray(array) && array.length >= 3) {
        this.borderStyle.setHorizontalCornerRadius(array[0]);
        this.borderStyle.setVerticalCornerRadius(array[1]);
        this.borderStyle.setWidth(array[2], this.rectangle);
        if (array.length === 4) {
          this.borderStyle.setDashArray(array[3], true);
        }
      }
    } else {
      this.borderStyle.setWidth(0);
    }
  }
  setAppearance(dict) {
    this.appearance = null;
    const appearanceStates = dict.get("AP");
    if (!(appearanceStates instanceof _primitives.Dict)) {
      return;
    }
    const normalAppearanceState = appearanceStates.get("N");
    if (normalAppearanceState instanceof _base_stream.BaseStream) {
      this.appearance = normalAppearanceState;
      return;
    }
    if (!(normalAppearanceState instanceof _primitives.Dict)) {
      return;
    }
    const as = dict.get("AS");
    if (!(as instanceof _primitives.Name) || !normalAppearanceState.has(as.name)) {
      return;
    }
    const appearance = normalAppearanceState.get(as.name);
    if (appearance instanceof _base_stream.BaseStream) {
      this.appearance = appearance;
    }
  }
  setOptionalContent(dict) {
    this.oc = null;
    const oc = dict.get("OC");
    if (oc instanceof _primitives.Name) {
      (0, _util.warn)("setOptionalContent: Support for /Name-entry is not implemented.");
    } else if (oc instanceof _primitives.Dict) {
      this.oc = oc;
    }
  }
  loadResources(keys, appearance) {
    return appearance.dict.getAsync("Resources").then(resources => {
      if (!resources) {
        return undefined;
      }
      const objectLoader = new _object_loader.ObjectLoader(resources, keys, resources.xref);
      return objectLoader.load().then(function () {
        return resources;
      });
    });
  }
  async getOperatorList(evaluator, task, intent, renderForms, annotationStorage) {
    const data = this.data;
    let appearance = this.appearance;
    const isUsingOwnCanvas = !!(this.data.hasOwnCanvas && intent & _util.RenderingIntentFlag.DISPLAY);
    if (!appearance) {
      if (!isUsingOwnCanvas) {
        return {
          opList: new _operator_list.OperatorList(),
          separateForm: false,
          separateCanvas: false
        };
      }
      appearance = new _stream.StringStream("");
      appearance.dict = new _primitives.Dict();
    }
    const appearanceDict = appearance.dict;
    const resources = await this.loadResources(["ExtGState", "ColorSpace", "Pattern", "Shading", "XObject", "Font"], appearance);
    const bbox = appearanceDict.getArray("BBox") || [0, 0, 1, 1];
    const matrix = appearanceDict.getArray("Matrix") || [1, 0, 0, 1, 0, 0];
    const transform = getTransformMatrix(data.rect, bbox, matrix);
    const opList = new _operator_list.OperatorList();
    let optionalContent;
    if (this.oc) {
      optionalContent = await evaluator.parseMarkedContentProps(this.oc, null);
    }
    if (optionalContent !== undefined) {
      opList.addOp(_util.OPS.beginMarkedContentProps, ["OC", optionalContent]);
    }
    opList.addOp(_util.OPS.beginAnnotation, [data.id, data.rect, transform, matrix, isUsingOwnCanvas]);
    await evaluator.getOperatorList({
      stream: appearance,
      task,
      resources,
      operatorList: opList,
      fallbackFontDict: this._fallbackFontDict
    });
    opList.addOp(_util.OPS.endAnnotation, []);
    if (optionalContent !== undefined) {
      opList.addOp(_util.OPS.endMarkedContent, []);
    }
    this.reset();
    return {
      opList,
      separateForm: false,
      separateCanvas: isUsingOwnCanvas
    };
  }
  async save(evaluator, task, annotationStorage) {
    return null;
  }
  get hasTextContent() {
    return false;
  }
  async extractTextContent(evaluator, task, viewBox) {
    if (!this.appearance) {
      return;
    }
    const resources = await this.loadResources(["ExtGState", "Font", "Properties", "XObject"], this.appearance);
    const text = [];
    const buffer = [];
    const sink = {
      desiredSize: Math.Infinity,
      ready: true,
      enqueue(chunk, size) {
        for (const item of chunk.items) {
          buffer.push(item.str);
          if (item.hasEOL) {
            text.push(buffer.join(""));
            buffer.length = 0;
          }
        }
      }
    };
    await evaluator.getTextContent({
      stream: this.appearance,
      task,
      resources,
      includeMarkedContent: true,
      combineTextItems: true,
      sink,
      viewBox
    });
    this.reset();
    if (buffer.length) {
      text.push(buffer.join(""));
    }
    if (text.length > 0) {
      this.data.textContent = text;
    }
  }
  getFieldObject() {
    if (this.data.kidIds) {
      return {
        id: this.data.id,
        actions: this.data.actions,
        name: this.data.fieldName,
        strokeColor: this.data.borderColor,
        fillColor: this.data.backgroundColor,
        type: "",
        kidIds: this.data.kidIds,
        page: this.data.pageIndex,
        rotation: this.rotation
      };
    }
    return null;
  }
  reset() {
    for (const stream of this._streams) {
      stream.reset();
    }
  }
  _constructFieldName(dict) {
    if (!dict.has("T") && !dict.has("Parent")) {
      (0, _util.warn)("Unknown field name, falling back to empty field name.");
      return "";
    }
    if (!dict.has("Parent")) {
      return (0, _util.stringToPDFString)(dict.get("T"));
    }
    const fieldName = [];
    if (dict.has("T")) {
      fieldName.unshift((0, _util.stringToPDFString)(dict.get("T")));
    }
    let loopDict = dict;
    const visited = new _primitives.RefSet();
    if (dict.objId) {
      visited.put(dict.objId);
    }
    while (loopDict.has("Parent")) {
      loopDict = loopDict.get("Parent");
      if (!(loopDict instanceof _primitives.Dict) || loopDict.objId && visited.has(loopDict.objId)) {
        break;
      }
      if (loopDict.objId) {
        visited.put(loopDict.objId);
      }
      if (loopDict.has("T")) {
        const t = (0, _util.stringToPDFString)(loopDict.get("T"));
        if (!t.startsWith("#")) {
          fieldName.unshift(t);
        }
      }
    }
    return fieldName.join(".");
  }
}
exports.Annotation = Annotation;
class AnnotationBorderStyle {
  constructor() {
    this.width = 1;
    this.style = _util.AnnotationBorderStyleType.SOLID;
    this.dashArray = [3];
    this.horizontalCornerRadius = 0;
    this.verticalCornerRadius = 0;
  }
  setWidth(width, rect = [0, 0, 0, 0]) {
    if (width instanceof _primitives.Name) {
      this.width = 0;
      return;
    }
    if (typeof width === "number") {
      if (width > 0) {
        const maxWidth = (rect[2] - rect[0]) / 2;
        const maxHeight = (rect[3] - rect[1]) / 2;
        if (maxWidth > 0 && maxHeight > 0 && (width > maxWidth || width > maxHeight)) {
          (0, _util.warn)(`AnnotationBorderStyle.setWidth - ignoring width: ${width}`);
          width = 1;
        }
      }
      this.width = width;
    }
  }
  setStyle(style) {
    if (!(style instanceof _primitives.Name)) {
      return;
    }
    switch (style.name) {
      case "S":
        this.style = _util.AnnotationBorderStyleType.SOLID;
        break;
      case "D":
        this.style = _util.AnnotationBorderStyleType.DASHED;
        break;
      case "B":
        this.style = _util.AnnotationBorderStyleType.BEVELED;
        break;
      case "I":
        this.style = _util.AnnotationBorderStyleType.INSET;
        break;
      case "U":
        this.style = _util.AnnotationBorderStyleType.UNDERLINE;
        break;
      default:
        break;
    }
  }
  setDashArray(dashArray, forceStyle = false) {
    if (Array.isArray(dashArray) && dashArray.length > 0) {
      let isValid = true;
      let allZeros = true;
      for (const element of dashArray) {
        const validNumber = +element >= 0;
        if (!validNumber) {
          isValid = false;
          break;
        } else if (element > 0) {
          allZeros = false;
        }
      }
      if (isValid && !allZeros) {
        this.dashArray = dashArray;
        if (forceStyle) {
          this.setStyle(_primitives.Name.get("D"));
        }
      } else {
        this.width = 0;
      }
    } else if (dashArray) {
      this.width = 0;
    }
  }
  setHorizontalCornerRadius(radius) {
    if (Number.isInteger(radius)) {
      this.horizontalCornerRadius = radius;
    }
  }
  setVerticalCornerRadius(radius) {
    if (Number.isInteger(radius)) {
      this.verticalCornerRadius = radius;
    }
  }
}
exports.AnnotationBorderStyle = AnnotationBorderStyle;
class MarkupAnnotation extends Annotation {
  constructor(params) {
    super(params);
    const {
      dict
    } = params;
    if (dict.has("IRT")) {
      const rawIRT = dict.getRaw("IRT");
      this.data.inReplyTo = rawIRT instanceof _primitives.Ref ? rawIRT.toString() : null;
      const rt = dict.get("RT");
      this.data.replyType = rt instanceof _primitives.Name ? rt.name : _util.AnnotationReplyType.REPLY;
    }
    if (this.data.replyType === _util.AnnotationReplyType.GROUP) {
      const parent = dict.get("IRT");
      this.setTitle(parent.get("T"));
      this.data.titleObj = this._title;
      this.setContents(parent.get("Contents"));
      this.data.contentsObj = this._contents;
      if (!parent.has("CreationDate")) {
        this.data.creationDate = null;
      } else {
        this.setCreationDate(parent.get("CreationDate"));
        this.data.creationDate = this.creationDate;
      }
      if (!parent.has("M")) {
        this.data.modificationDate = null;
      } else {
        this.setModificationDate(parent.get("M"));
        this.data.modificationDate = this.modificationDate;
      }
      this.data.hasPopup = parent.has("Popup");
      if (!parent.has("C")) {
        this.data.color = null;
      } else {
        this.setColor(parent.getArray("C"));
        this.data.color = this.color;
      }
    } else {
      this.data.titleObj = this._title;
      this.setCreationDate(dict.get("CreationDate"));
      this.data.creationDate = this.creationDate;
      this.data.hasPopup = dict.has("Popup");
      if (!dict.has("C")) {
        this.data.color = null;
      }
    }
    if (dict.has("RC")) {
      this.data.richText = _factory.XFAFactory.getRichTextAsHtml(dict.get("RC"));
    }
  }
  setCreationDate(creationDate) {
    this.creationDate = typeof creationDate === "string" ? creationDate : null;
  }
  _setDefaultAppearance({
    xref,
    extra,
    strokeColor,
    fillColor,
    blendMode,
    strokeAlpha,
    fillAlpha,
    pointsCallback
  }) {
    let minX = Number.MAX_VALUE;
    let minY = Number.MAX_VALUE;
    let maxX = Number.MIN_VALUE;
    let maxY = Number.MIN_VALUE;
    const buffer = ["q"];
    if (extra) {
      buffer.push(extra);
    }
    if (strokeColor) {
      buffer.push(`${strokeColor[0]} ${strokeColor[1]} ${strokeColor[2]} RG`);
    }
    if (fillColor) {
      buffer.push(`${fillColor[0]} ${fillColor[1]} ${fillColor[2]} rg`);
    }
    let pointsArray = this.data.quadPoints;
    if (!pointsArray) {
      pointsArray = [[{
        x: this.rectangle[0],
        y: this.rectangle[3]
      }, {
        x: this.rectangle[2],
        y: this.rectangle[3]
      }, {
        x: this.rectangle[0],
        y: this.rectangle[1]
      }, {
        x: this.rectangle[2],
        y: this.rectangle[1]
      }]];
    }
    for (const points of pointsArray) {
      const [mX, MX, mY, MY] = pointsCallback(buffer, points);
      minX = Math.min(minX, mX);
      maxX = Math.max(maxX, MX);
      minY = Math.min(minY, mY);
      maxY = Math.max(maxY, MY);
    }
    buffer.push("Q");
    const formDict = new _primitives.Dict(xref);
    const appearanceStreamDict = new _primitives.Dict(xref);
    appearanceStreamDict.set("Subtype", _primitives.Name.get("Form"));
    const appearanceStream = new _stream.StringStream(buffer.join(" "));
    appearanceStream.dict = appearanceStreamDict;
    formDict.set("Fm0", appearanceStream);
    const gsDict = new _primitives.Dict(xref);
    if (blendMode) {
      gsDict.set("BM", _primitives.Name.get(blendMode));
    }
    if (typeof strokeAlpha === "number") {
      gsDict.set("CA", strokeAlpha);
    }
    if (typeof fillAlpha === "number") {
      gsDict.set("ca", fillAlpha);
    }
    const stateDict = new _primitives.Dict(xref);
    stateDict.set("GS0", gsDict);
    const resources = new _primitives.Dict(xref);
    resources.set("ExtGState", stateDict);
    resources.set("XObject", formDict);
    const appearanceDict = new _primitives.Dict(xref);
    appearanceDict.set("Resources", resources);
    const bbox = this.data.rect = [minX, minY, maxX, maxY];
    appearanceDict.set("BBox", bbox);
    this.appearance = new _stream.StringStream("/GS0 gs /Fm0 Do");
    this.appearance.dict = appearanceDict;
    this._streams.push(this.appearance, appearanceStream);
  }
  static async createNewAnnotation(xref, annotation, dependencies, params) {
    const annotationRef = xref.getNewTemporaryRef();
    const ap = await this.createNewAppearanceStream(annotation, xref, params);
    const buffer = [];
    let annotationDict;
    if (ap) {
      const apRef = xref.getNewTemporaryRef();
      annotationDict = this.createNewDict(annotation, xref, {
        apRef
      });
      const transform = xref.encrypt ? xref.encrypt.createCipherTransform(apRef.num, apRef.gen) : null;
      (0, _writer.writeObject)(apRef, ap, buffer, transform);
      dependencies.push({
        ref: apRef,
        data: buffer.join("")
      });
    } else {
      annotationDict = this.createNewDict(annotation, xref, {});
    }
    buffer.length = 0;
    const transform = xref.encrypt ? xref.encrypt.createCipherTransform(annotationRef.num, annotationRef.gen) : null;
    (0, _writer.writeObject)(annotationRef, annotationDict, buffer, transform);
    return {
      ref: annotationRef,
      data: buffer.join("")
    };
  }
  static async createNewPrintAnnotation(xref, annotation, params) {
    const ap = await this.createNewAppearanceStream(annotation, xref, params);
    const annotationDict = this.createNewDict(annotation, xref, {
      ap
    });
    return new this.prototype.constructor({
      dict: annotationDict,
      xref,
      isOffscreenCanvasSupported: params.isOffscreenCanvasSupported
    });
  }
}
exports.MarkupAnnotation = MarkupAnnotation;
class WidgetAnnotation extends Annotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    const data = this.data;
    this.ref = params.ref;
    this._needAppearances = params.needAppearances;
    data.annotationType = _util.AnnotationType.WIDGET;
    if (data.fieldName === undefined) {
      data.fieldName = this._constructFieldName(dict);
    }
    if (data.actions === undefined) {
      data.actions = (0, _core_utils.collectActions)(xref, dict, _util.AnnotationActionEventType);
    }
    let fieldValue = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "V",
      getArray: true
    });
    data.fieldValue = this._decodeFormValue(fieldValue);
    const defaultFieldValue = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "DV",
      getArray: true
    });
    data.defaultFieldValue = this._decodeFormValue(defaultFieldValue);
    if (fieldValue === undefined && params.xfaDatasets) {
      const path = this._title.str;
      if (path) {
        this._hasValueFromXFA = true;
        data.fieldValue = fieldValue = params.xfaDatasets.getValue(path);
      }
    }
    if (fieldValue === undefined && data.defaultFieldValue !== null) {
      data.fieldValue = data.defaultFieldValue;
    }
    data.alternativeText = (0, _util.stringToPDFString)(dict.get("TU") || "");
    this.setDefaultAppearance(params);
    data.hasAppearance = this._needAppearances && data.fieldValue !== undefined && data.fieldValue !== null || data.hasAppearance;
    const fieldType = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "FT"
    });
    data.fieldType = fieldType instanceof _primitives.Name ? fieldType.name : null;
    const localResources = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "DR"
    });
    const acroFormResources = params.acroForm.get("DR");
    const appearanceResources = this.appearance && this.appearance.dict.get("Resources");
    this._fieldResources = {
      localResources,
      acroFormResources,
      appearanceResources,
      mergedResources: _primitives.Dict.merge({
        xref,
        dictArray: [localResources, appearanceResources, acroFormResources],
        mergeSubDicts: true
      })
    };
    data.fieldFlags = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "Ff"
    });
    if (!Number.isInteger(data.fieldFlags) || data.fieldFlags < 0) {
      data.fieldFlags = 0;
    }
    data.readOnly = this.hasFieldFlag(_util.AnnotationFieldFlag.READONLY);
    data.required = this.hasFieldFlag(_util.AnnotationFieldFlag.REQUIRED);
    data.hidden = this._hasFlag(data.annotationFlags, _util.AnnotationFlag.HIDDEN);
  }
  _decodeFormValue(formValue) {
    if (Array.isArray(formValue)) {
      return formValue.filter(item => typeof item === "string").map(item => (0, _util.stringToPDFString)(item));
    } else if (formValue instanceof _primitives.Name) {
      return (0, _util.stringToPDFString)(formValue.name);
    } else if (typeof formValue === "string") {
      return (0, _util.stringToPDFString)(formValue);
    }
    return null;
  }
  hasFieldFlag(flag) {
    return !!(this.data.fieldFlags & flag);
  }
  getRotationMatrix(annotationStorage) {
    const storageEntry = annotationStorage ? annotationStorage.get(this.data.id) : undefined;
    let rotation = storageEntry && storageEntry.rotation;
    if (rotation === undefined) {
      rotation = this.rotation;
    }
    if (rotation === 0) {
      return _util.IDENTITY_MATRIX;
    }
    const width = this.data.rect[2] - this.data.rect[0];
    const height = this.data.rect[3] - this.data.rect[1];
    return (0, _core_utils.getRotationMatrix)(rotation, width, height);
  }
  getBorderAndBackgroundAppearances(annotationStorage) {
    const storageEntry = annotationStorage ? annotationStorage.get(this.data.id) : undefined;
    let rotation = storageEntry && storageEntry.rotation;
    if (rotation === undefined) {
      rotation = this.rotation;
    }
    if (!this.backgroundColor && !this.borderColor) {
      return "";
    }
    const width = this.data.rect[2] - this.data.rect[0];
    const height = this.data.rect[3] - this.data.rect[1];
    const rect = rotation === 0 || rotation === 180 ? `0 0 ${width} ${height} re` : `0 0 ${height} ${width} re`;
    let str = "";
    if (this.backgroundColor) {
      str = `${(0, _default_appearance.getPdfColor)(this.backgroundColor, true)} ${rect} f `;
    }
    if (this.borderColor) {
      const borderWidth = this.borderStyle.width || 1;
      str += `${borderWidth} w ${(0, _default_appearance.getPdfColor)(this.borderColor, false)} ${rect} S `;
    }
    return str;
  }
  async getOperatorList(evaluator, task, intent, renderForms, annotationStorage) {
    if (renderForms && !(this instanceof SignatureWidgetAnnotation)) {
      return {
        opList: new _operator_list.OperatorList(),
        separateForm: true,
        separateCanvas: false
      };
    }
    if (!this._hasText) {
      return super.getOperatorList(evaluator, task, intent, renderForms, annotationStorage);
    }
    const content = await this._getAppearance(evaluator, task, intent, annotationStorage);
    if (this.appearance && content === null) {
      return super.getOperatorList(evaluator, task, intent, renderForms, annotationStorage);
    }
    const opList = new _operator_list.OperatorList();
    if (!this._defaultAppearance || content === null) {
      return {
        opList,
        separateForm: false,
        separateCanvas: false
      };
    }
    const matrix = [1, 0, 0, 1, 0, 0];
    const bbox = [0, 0, this.data.rect[2] - this.data.rect[0], this.data.rect[3] - this.data.rect[1]];
    const transform = getTransformMatrix(this.data.rect, bbox, matrix);
    let optionalContent;
    if (this.oc) {
      optionalContent = await evaluator.parseMarkedContentProps(this.oc, null);
    }
    if (optionalContent !== undefined) {
      opList.addOp(_util.OPS.beginMarkedContentProps, ["OC", optionalContent]);
    }
    opList.addOp(_util.OPS.beginAnnotation, [this.data.id, this.data.rect, transform, this.getRotationMatrix(annotationStorage), false]);
    const stream = new _stream.StringStream(content);
    await evaluator.getOperatorList({
      stream,
      task,
      resources: this._fieldResources.mergedResources,
      operatorList: opList
    });
    opList.addOp(_util.OPS.endAnnotation, []);
    if (optionalContent !== undefined) {
      opList.addOp(_util.OPS.endMarkedContent, []);
    }
    return {
      opList,
      separateForm: false,
      separateCanvas: false
    };
  }
  _getMKDict(rotation) {
    const mk = new _primitives.Dict(null);
    if (rotation) {
      mk.set("R", rotation);
    }
    if (this.borderColor) {
      mk.set("BC", getPdfColorArray(this.borderColor));
    }
    if (this.backgroundColor) {
      mk.set("BG", getPdfColorArray(this.backgroundColor));
    }
    return mk.size > 0 ? mk : null;
  }
  amendSavedDict(annotationStorage, dict) {}
  async save(evaluator, task, annotationStorage) {
    const storageEntry = annotationStorage ? annotationStorage.get(this.data.id) : undefined;
    let value = storageEntry && storageEntry.value;
    let rotation = storageEntry && storageEntry.rotation;
    if (value === this.data.fieldValue || value === undefined) {
      if (!this._hasValueFromXFA && rotation === undefined) {
        return null;
      }
      value = value || this.data.fieldValue;
    }
    if (rotation === undefined && !this._hasValueFromXFA && Array.isArray(value) && Array.isArray(this.data.fieldValue) && value.length === this.data.fieldValue.length && value.every((x, i) => x === this.data.fieldValue[i])) {
      return null;
    }
    if (rotation === undefined) {
      rotation = this.rotation;
    }
    let appearance = null;
    if (!this._needAppearances) {
      appearance = await this._getAppearance(evaluator, task, _util.RenderingIntentFlag.SAVE, annotationStorage);
      if (appearance === null) {
        return null;
      }
    } else {}
    let needAppearances = false;
    if (appearance && appearance.needAppearances) {
      needAppearances = true;
      appearance = null;
    }
    const {
      xref
    } = evaluator;
    const originalDict = xref.fetchIfRef(this.ref);
    if (!(originalDict instanceof _primitives.Dict)) {
      return null;
    }
    const dict = new _primitives.Dict(xref);
    for (const key of originalDict.getKeys()) {
      if (key !== "AP") {
        dict.set(key, originalDict.getRaw(key));
      }
    }
    const xfa = {
      path: this.data.fieldName,
      value
    };
    const encoder = val => {
      return (0, _core_utils.isAscii)(val) ? val : (0, _core_utils.stringToUTF16String)(val, true);
    };
    dict.set("V", Array.isArray(value) ? value.map(encoder) : encoder(value));
    this.amendSavedDict(annotationStorage, dict);
    const maybeMK = this._getMKDict(rotation);
    if (maybeMK) {
      dict.set("MK", maybeMK);
    }
    const encrypt = xref.encrypt;
    const originalTransform = encrypt ? encrypt.createCipherTransform(this.ref.num, this.ref.gen) : null;
    const buffer = [];
    const changes = [{
      ref: this.ref,
      data: "",
      xfa,
      needAppearances
    }];
    if (appearance !== null) {
      const newRef = xref.getNewTemporaryRef();
      const AP = new _primitives.Dict(xref);
      dict.set("AP", AP);
      AP.set("N", newRef);
      let newTransform = null;
      if (encrypt) {
        newTransform = encrypt.createCipherTransform(newRef.num, newRef.gen);
      }
      const resources = this._getSaveFieldResources(xref);
      const appearanceStream = new _stream.StringStream(appearance);
      const appearanceDict = appearanceStream.dict = new _primitives.Dict(xref);
      appearanceDict.set("Subtype", _primitives.Name.get("Form"));
      appearanceDict.set("Resources", resources);
      appearanceDict.set("BBox", [0, 0, this.data.rect[2] - this.data.rect[0], this.data.rect[3] - this.data.rect[1]]);
      const rotationMatrix = this.getRotationMatrix(annotationStorage);
      if (rotationMatrix !== _util.IDENTITY_MATRIX) {
        appearanceDict.set("Matrix", rotationMatrix);
      }
      (0, _writer.writeObject)(newRef, appearanceStream, buffer, newTransform);
      changes.push({
        ref: newRef,
        data: buffer.join(""),
        xfa: null,
        needAppearances: false
      });
      buffer.length = 0;
    }
    dict.set("M", `D:${(0, _util.getModificationDate)()}`);
    (0, _writer.writeObject)(this.ref, dict, buffer, originalTransform);
    changes[0].data = buffer.join("");
    return changes;
  }
  async _getAppearance(evaluator, task, intent, annotationStorage) {
    const isPassword = this.hasFieldFlag(_util.AnnotationFieldFlag.PASSWORD);
    if (isPassword) {
      return null;
    }
    const storageEntry = annotationStorage ? annotationStorage.get(this.data.id) : undefined;
    let value, rotation;
    if (storageEntry) {
      value = storageEntry.formattedValue || storageEntry.value;
      rotation = storageEntry.rotation;
    }
    if (rotation === undefined && value === undefined && !this._needAppearances) {
      if (!this._hasValueFromXFA || this.appearance) {
        return null;
      }
    }
    const colors = this.getBorderAndBackgroundAppearances(annotationStorage);
    if (value === undefined) {
      value = this.data.fieldValue;
      if (!value) {
        return `/Tx BMC q ${colors}Q EMC`;
      }
    }
    if (Array.isArray(value) && value.length === 1) {
      value = value[0];
    }
    (0, _util.assert)(typeof value === "string", "Expected `value` to be a string.");
    value = value.trim();
    if (this.data.combo) {
      const option = this.data.options.find(({
        exportValue
      }) => value === exportValue);
      value = option && option.displayValue || value;
    }
    if (value === "") {
      return `/Tx BMC q ${colors}Q EMC`;
    }
    if (rotation === undefined) {
      rotation = this.rotation;
    }
    let lineCount = -1;
    let lines;
    if (this.data.multiLine) {
      lines = value.split(/\r\n?|\n/).map(line => line.normalize("NFC"));
      lineCount = lines.length;
    } else {
      lines = [value.replace(/\r\n?|\n/, "").normalize("NFC")];
    }
    const defaultPadding = 1;
    const defaultHPadding = 2;
    let totalHeight = this.data.rect[3] - this.data.rect[1];
    let totalWidth = this.data.rect[2] - this.data.rect[0];
    if (rotation === 90 || rotation === 270) {
      [totalWidth, totalHeight] = [totalHeight, totalWidth];
    }
    if (!this._defaultAppearance) {
      this.data.defaultAppearanceData = (0, _default_appearance.parseDefaultAppearance)(this._defaultAppearance = "/Helvetica 0 Tf 0 g");
    }
    let font = await WidgetAnnotation._getFontData(evaluator, task, this.data.defaultAppearanceData, this._fieldResources.mergedResources);
    let defaultAppearance, fontSize, lineHeight;
    const encodedLines = [];
    let encodingError = false;
    for (const line of lines) {
      const encodedString = font.encodeString(line);
      if (encodedString.length > 1) {
        encodingError = true;
      }
      encodedLines.push(encodedString.join(""));
    }
    if (encodingError && intent & _util.RenderingIntentFlag.SAVE) {
      return {
        needAppearances: true
      };
    }
    if (encodingError && this._isOffscreenCanvasSupported) {
      const fontFamily = this.data.comb ? "monospace" : "sans-serif";
      const fakeUnicodeFont = new _default_appearance.FakeUnicodeFont(evaluator.xref, fontFamily);
      const resources = fakeUnicodeFont.createFontResources(lines.join(""));
      const newFont = resources.getRaw("Font");
      if (this._fieldResources.mergedResources.has("Font")) {
        const oldFont = this._fieldResources.mergedResources.get("Font");
        for (const key of newFont.getKeys()) {
          oldFont.set(key, newFont.getRaw(key));
        }
      } else {
        this._fieldResources.mergedResources.set("Font", newFont);
      }
      const fontName = fakeUnicodeFont.fontName.name;
      font = await WidgetAnnotation._getFontData(evaluator, task, {
        fontName,
        fontSize: 0
      }, resources);
      for (let i = 0, ii = encodedLines.length; i < ii; i++) {
        encodedLines[i] = (0, _core_utils.stringToUTF16String)(lines[i]);
      }
      const savedDefaultAppearance = Object.assign(Object.create(null), this.data.defaultAppearanceData);
      this.data.defaultAppearanceData.fontSize = 0;
      this.data.defaultAppearanceData.fontName = fontName;
      [defaultAppearance, fontSize, lineHeight] = this._computeFontSize(totalHeight - 2 * defaultPadding, totalWidth - 2 * defaultHPadding, value, font, lineCount);
      this.data.defaultAppearanceData = savedDefaultAppearance;
    } else {
      if (!this._isOffscreenCanvasSupported) {
        (0, _util.warn)("_getAppearance: OffscreenCanvas is not supported, annotation may not render correctly.");
      }
      [defaultAppearance, fontSize, lineHeight] = this._computeFontSize(totalHeight - 2 * defaultPadding, totalWidth - 2 * defaultHPadding, value, font, lineCount);
    }
    let descent = font.descent;
    if (isNaN(descent)) {
      descent = _util.BASELINE_FACTOR * lineHeight;
    } else {
      descent = Math.max(_util.BASELINE_FACTOR * lineHeight, Math.abs(descent) * fontSize);
    }
    const defaultVPadding = Math.min(Math.floor((totalHeight - fontSize) / 2), defaultPadding);
    const alignment = this.data.textAlignment;
    if (this.data.multiLine) {
      return this._getMultilineAppearance(defaultAppearance, encodedLines, font, fontSize, totalWidth, totalHeight, alignment, defaultHPadding, defaultVPadding, descent, lineHeight, annotationStorage);
    }
    if (this.data.comb) {
      return this._getCombAppearance(defaultAppearance, font, encodedLines[0], fontSize, totalWidth, totalHeight, defaultHPadding, defaultVPadding, descent, lineHeight, annotationStorage);
    }
    const bottomPadding = defaultVPadding + descent;
    if (alignment === 0 || alignment > 2) {
      return `/Tx BMC q ${colors}BT ` + defaultAppearance + ` 1 0 0 1 ${(0, _core_utils.numberToString)(defaultHPadding)} ${(0, _core_utils.numberToString)(bottomPadding)} Tm (${(0, _core_utils.escapeString)(encodedLines[0])}) Tj` + " ET Q EMC";
    }
    const prevInfo = {
      shift: 0
    };
    const renderedText = this._renderText(encodedLines[0], font, fontSize, totalWidth, alignment, prevInfo, defaultHPadding, bottomPadding);
    return `/Tx BMC q ${colors}BT ` + defaultAppearance + ` 1 0 0 1 0 0 Tm ${renderedText}` + " ET Q EMC";
  }
  static async _getFontData(evaluator, task, appearanceData, resources) {
    const operatorList = new _operator_list.OperatorList();
    const initialState = {
      font: null,
      clone() {
        return this;
      }
    };
    const {
      fontName,
      fontSize
    } = appearanceData;
    await evaluator.handleSetFont(resources, [fontName && _primitives.Name.get(fontName), fontSize], null, operatorList, task, initialState, null);
    return initialState.font;
  }
  _getTextWidth(text, font) {
    return font.charsToGlyphs(text).reduce((width, glyph) => width + glyph.width, 0) / 1000;
  }
  _computeFontSize(height, width, text, font, lineCount) {
    let {
      fontSize
    } = this.data.defaultAppearanceData;
    let lineHeight = (fontSize || 12) * _util.LINE_FACTOR,
      numberOfLines = Math.round(height / lineHeight);
    if (!fontSize) {
      const roundWithTwoDigits = x => Math.floor(x * 100) / 100;
      if (lineCount === -1) {
        const textWidth = this._getTextWidth(text, font);
        fontSize = roundWithTwoDigits(Math.min(height / _util.LINE_FACTOR, textWidth > width ? width / textWidth : Infinity));
        numberOfLines = 1;
      } else {
        const lines = text.split(/\r\n?|\n/);
        const cachedLines = [];
        for (const line of lines) {
          const encoded = font.encodeString(line).join("");
          const glyphs = font.charsToGlyphs(encoded);
          const positions = font.getCharPositions(encoded);
          cachedLines.push({
            line: encoded,
            glyphs,
            positions
          });
        }
        const isTooBig = fsize => {
          let totalHeight = 0;
          for (const cache of cachedLines) {
            const chunks = this._splitLine(null, font, fsize, width, cache);
            totalHeight += chunks.length * fsize;
            if (totalHeight > height) {
              return true;
            }
          }
          return false;
        };
        numberOfLines = Math.max(numberOfLines, lineCount);
        while (true) {
          lineHeight = height / numberOfLines;
          fontSize = roundWithTwoDigits(lineHeight / _util.LINE_FACTOR);
          if (isTooBig(fontSize)) {
            numberOfLines++;
            continue;
          }
          break;
        }
      }
      const {
        fontName,
        fontColor
      } = this.data.defaultAppearanceData;
      this._defaultAppearance = (0, _default_appearance.createDefaultAppearance)({
        fontSize,
        fontName,
        fontColor
      });
    }
    return [this._defaultAppearance, fontSize, height / numberOfLines];
  }
  _renderText(text, font, fontSize, totalWidth, alignment, prevInfo, hPadding, vPadding) {
    let shift;
    if (alignment === 1) {
      const width = this._getTextWidth(text, font) * fontSize;
      shift = (totalWidth - width) / 2;
    } else if (alignment === 2) {
      const width = this._getTextWidth(text, font) * fontSize;
      shift = totalWidth - width - hPadding;
    } else {
      shift = hPadding;
    }
    const shiftStr = (0, _core_utils.numberToString)(shift - prevInfo.shift);
    prevInfo.shift = shift;
    vPadding = (0, _core_utils.numberToString)(vPadding);
    return `${shiftStr} ${vPadding} Td (${(0, _core_utils.escapeString)(text)}) Tj`;
  }
  _getSaveFieldResources(xref) {
    const {
      localResources,
      appearanceResources,
      acroFormResources
    } = this._fieldResources;
    const fontName = this.data.defaultAppearanceData && this.data.defaultAppearanceData.fontName;
    if (!fontName) {
      return localResources || _primitives.Dict.empty;
    }
    for (const resources of [localResources, appearanceResources]) {
      if (resources instanceof _primitives.Dict) {
        const localFont = resources.get("Font");
        if (localFont instanceof _primitives.Dict && localFont.has(fontName)) {
          return resources;
        }
      }
    }
    if (acroFormResources instanceof _primitives.Dict) {
      const acroFormFont = acroFormResources.get("Font");
      if (acroFormFont instanceof _primitives.Dict && acroFormFont.has(fontName)) {
        const subFontDict = new _primitives.Dict(xref);
        subFontDict.set(fontName, acroFormFont.getRaw(fontName));
        const subResourcesDict = new _primitives.Dict(xref);
        subResourcesDict.set("Font", subFontDict);
        return _primitives.Dict.merge({
          xref,
          dictArray: [subResourcesDict, localResources],
          mergeSubDicts: true
        });
      }
    }
    return localResources || _primitives.Dict.empty;
  }
  getFieldObject() {
    return null;
  }
}
class TextWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);
    this._hasText = true;
    const dict = params.dict;
    if (typeof this.data.fieldValue !== "string") {
      this.data.fieldValue = "";
    }
    let alignment = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "Q"
    });
    if (!Number.isInteger(alignment) || alignment < 0 || alignment > 2) {
      alignment = null;
    }
    this.data.textAlignment = alignment;
    let maximumLength = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "MaxLen"
    });
    if (!Number.isInteger(maximumLength) || maximumLength < 0) {
      maximumLength = 0;
    }
    this.data.maxLen = maximumLength;
    this.data.multiLine = this.hasFieldFlag(_util.AnnotationFieldFlag.MULTILINE);
    this.data.comb = this.hasFieldFlag(_util.AnnotationFieldFlag.COMB) && !this.hasFieldFlag(_util.AnnotationFieldFlag.MULTILINE) && !this.hasFieldFlag(_util.AnnotationFieldFlag.PASSWORD) && !this.hasFieldFlag(_util.AnnotationFieldFlag.FILESELECT) && this.data.maxLen !== 0;
    this.data.doNotScroll = this.hasFieldFlag(_util.AnnotationFieldFlag.DONOTSCROLL);
  }
  _getCombAppearance(defaultAppearance, font, text, fontSize, width, height, hPadding, vPadding, descent, lineHeight, annotationStorage) {
    const combWidth = width / this.data.maxLen;
    const colors = this.getBorderAndBackgroundAppearances(annotationStorage);
    const buf = [];
    const positions = font.getCharPositions(text);
    for (const [start, end] of positions) {
      buf.push(`(${(0, _core_utils.escapeString)(text.substring(start, end))}) Tj`);
    }
    const renderedComb = buf.join(` ${(0, _core_utils.numberToString)(combWidth)} 0 Td `);
    return `/Tx BMC q ${colors}BT ` + defaultAppearance + ` 1 0 0 1 ${(0, _core_utils.numberToString)(hPadding)} ${(0, _core_utils.numberToString)(vPadding + descent)} Tm ${renderedComb}` + " ET Q EMC";
  }
  _getMultilineAppearance(defaultAppearance, lines, font, fontSize, width, height, alignment, hPadding, vPadding, descent, lineHeight, annotationStorage) {
    const buf = [];
    const totalWidth = width - 2 * hPadding;
    const prevInfo = {
      shift: 0
    };
    for (let i = 0, ii = lines.length; i < ii; i++) {
      const line = lines[i];
      const chunks = this._splitLine(line, font, fontSize, totalWidth);
      for (let j = 0, jj = chunks.length; j < jj; j++) {
        const chunk = chunks[j];
        const vShift = i === 0 && j === 0 ? -vPadding - (lineHeight - descent) : -lineHeight;
        buf.push(this._renderText(chunk, font, fontSize, width, alignment, prevInfo, hPadding, vShift));
      }
    }
    const colors = this.getBorderAndBackgroundAppearances(annotationStorage);
    const renderedText = buf.join("\n");
    return `/Tx BMC q ${colors}BT ` + defaultAppearance + ` 1 0 0 1 0 ${(0, _core_utils.numberToString)(height)} Tm ${renderedText}` + " ET Q EMC";
  }
  _splitLine(line, font, fontSize, width, cache = {}) {
    line = cache.line || line;
    const glyphs = cache.glyphs || font.charsToGlyphs(line);
    if (glyphs.length <= 1) {
      return [line];
    }
    const positions = cache.positions || font.getCharPositions(line);
    const scale = fontSize / 1000;
    const chunks = [];
    let lastSpacePosInStringStart = -1,
      lastSpacePosInStringEnd = -1,
      lastSpacePos = -1,
      startChunk = 0,
      currentWidth = 0;
    for (let i = 0, ii = glyphs.length; i < ii; i++) {
      const [start, end] = positions[i];
      const glyph = glyphs[i];
      const glyphWidth = glyph.width * scale;
      if (glyph.unicode === " ") {
        if (currentWidth + glyphWidth > width) {
          chunks.push(line.substring(startChunk, start));
          startChunk = start;
          currentWidth = glyphWidth;
          lastSpacePosInStringStart = -1;
          lastSpacePos = -1;
        } else {
          currentWidth += glyphWidth;
          lastSpacePosInStringStart = start;
          lastSpacePosInStringEnd = end;
          lastSpacePos = i;
        }
      } else {
        if (currentWidth + glyphWidth > width) {
          if (lastSpacePosInStringStart !== -1) {
            chunks.push(line.substring(startChunk, lastSpacePosInStringEnd));
            startChunk = lastSpacePosInStringEnd;
            i = lastSpacePos + 1;
            lastSpacePosInStringStart = -1;
            currentWidth = 0;
          } else {
            chunks.push(line.substring(startChunk, start));
            startChunk = start;
            currentWidth = glyphWidth;
          }
        } else {
          currentWidth += glyphWidth;
        }
      }
    }
    if (startChunk < line.length) {
      chunks.push(line.substring(startChunk, line.length));
    }
    return chunks;
  }
  getFieldObject() {
    return {
      id: this.data.id,
      value: this.data.fieldValue,
      defaultValue: this.data.defaultFieldValue || "",
      multiline: this.data.multiLine,
      password: this.hasFieldFlag(_util.AnnotationFieldFlag.PASSWORD),
      charLimit: this.data.maxLen,
      comb: this.data.comb,
      editable: !this.data.readOnly,
      hidden: this.data.hidden,
      name: this.data.fieldName,
      rect: this.data.rect,
      actions: this.data.actions,
      page: this.data.pageIndex,
      strokeColor: this.data.borderColor,
      fillColor: this.data.backgroundColor,
      rotation: this.rotation,
      type: "text"
    };
  }
}
class ButtonWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);
    this.checkedAppearance = null;
    this.uncheckedAppearance = null;
    this.data.checkBox = !this.hasFieldFlag(_util.AnnotationFieldFlag.RADIO) && !this.hasFieldFlag(_util.AnnotationFieldFlag.PUSHBUTTON);
    this.data.radioButton = this.hasFieldFlag(_util.AnnotationFieldFlag.RADIO) && !this.hasFieldFlag(_util.AnnotationFieldFlag.PUSHBUTTON);
    this.data.pushButton = this.hasFieldFlag(_util.AnnotationFieldFlag.PUSHBUTTON);
    this.data.isTooltipOnly = false;
    if (this.data.checkBox) {
      this._processCheckBox(params);
    } else if (this.data.radioButton) {
      this._processRadioButton(params);
    } else if (this.data.pushButton) {
      this.data.hasOwnCanvas = true;
      this._processPushButton(params);
    } else {
      (0, _util.warn)("Invalid field flags for button widget annotation");
    }
  }
  async getOperatorList(evaluator, task, intent, renderForms, annotationStorage) {
    if (this.data.pushButton) {
      return super.getOperatorList(evaluator, task, intent, false, annotationStorage);
    }
    let value = null;
    let rotation = null;
    if (annotationStorage) {
      const storageEntry = annotationStorage.get(this.data.id);
      value = storageEntry ? storageEntry.value : null;
      rotation = storageEntry ? storageEntry.rotation : null;
    }
    if (value === null && this.appearance) {
      return super.getOperatorList(evaluator, task, intent, renderForms, annotationStorage);
    }
    if (value === null || value === undefined) {
      if (this.data.checkBox) {
        value = this.data.fieldValue === this.data.exportValue;
      } else {
        value = this.data.fieldValue === this.data.buttonValue;
      }
    }
    const appearance = value ? this.checkedAppearance : this.uncheckedAppearance;
    if (appearance) {
      const savedAppearance = this.appearance;
      const savedMatrix = appearance.dict.getArray("Matrix") || _util.IDENTITY_MATRIX;
      if (rotation) {
        appearance.dict.set("Matrix", this.getRotationMatrix(annotationStorage));
      }
      this.appearance = appearance;
      const operatorList = super.getOperatorList(evaluator, task, intent, renderForms, annotationStorage);
      this.appearance = savedAppearance;
      appearance.dict.set("Matrix", savedMatrix);
      return operatorList;
    }
    return {
      opList: new _operator_list.OperatorList(),
      separateForm: false,
      separateCanvas: false
    };
  }
  async save(evaluator, task, annotationStorage) {
    if (this.data.checkBox) {
      return this._saveCheckbox(evaluator, task, annotationStorage);
    }
    if (this.data.radioButton) {
      return this._saveRadioButton(evaluator, task, annotationStorage);
    }
    return null;
  }
  async _saveCheckbox(evaluator, task, annotationStorage) {
    if (!annotationStorage) {
      return null;
    }
    const storageEntry = annotationStorage.get(this.data.id);
    let rotation = storageEntry && storageEntry.rotation;
    let value = storageEntry && storageEntry.value;
    if (rotation === undefined) {
      if (value === undefined) {
        return null;
      }
      const defaultValue = this.data.fieldValue === this.data.exportValue;
      if (defaultValue === value) {
        return null;
      }
    }
    const dict = evaluator.xref.fetchIfRef(this.ref);
    if (!(dict instanceof _primitives.Dict)) {
      return null;
    }
    if (rotation === undefined) {
      rotation = this.rotation;
    }
    if (value === undefined) {
      value = this.data.fieldValue === this.data.exportValue;
    }
    const xfa = {
      path: this.data.fieldName,
      value: value ? this.data.exportValue : ""
    };
    const name = _primitives.Name.get(value ? this.data.exportValue : "Off");
    dict.set("V", name);
    dict.set("AS", name);
    dict.set("M", `D:${(0, _util.getModificationDate)()}`);
    const maybeMK = this._getMKDict(rotation);
    if (maybeMK) {
      dict.set("MK", maybeMK);
    }
    const encrypt = evaluator.xref.encrypt;
    let originalTransform = null;
    if (encrypt) {
      originalTransform = encrypt.createCipherTransform(this.ref.num, this.ref.gen);
    }
    const buffer = [`${this.ref.num} ${this.ref.gen} obj\n`];
    (0, _writer.writeDict)(dict, buffer, originalTransform);
    buffer.push("\nendobj\n");
    return [{
      ref: this.ref,
      data: buffer.join(""),
      xfa
    }];
  }
  async _saveRadioButton(evaluator, task, annotationStorage) {
    if (!annotationStorage) {
      return null;
    }
    const storageEntry = annotationStorage.get(this.data.id);
    let rotation = storageEntry && storageEntry.rotation;
    let value = storageEntry && storageEntry.value;
    if (rotation === undefined) {
      if (value === undefined) {
        return null;
      }
      const defaultValue = this.data.fieldValue === this.data.buttonValue;
      if (defaultValue === value) {
        return null;
      }
    }
    const dict = evaluator.xref.fetchIfRef(this.ref);
    if (!(dict instanceof _primitives.Dict)) {
      return null;
    }
    if (value === undefined) {
      value = this.data.fieldValue === this.data.buttonValue;
    }
    if (rotation === undefined) {
      rotation = this.rotation;
    }
    const xfa = {
      path: this.data.fieldName,
      value: value ? this.data.buttonValue : ""
    };
    const name = _primitives.Name.get(value ? this.data.buttonValue : "Off");
    let parentBuffer = null;
    const encrypt = evaluator.xref.encrypt;
    if (value) {
      if (this.parent instanceof _primitives.Ref) {
        const parent = evaluator.xref.fetch(this.parent);
        let parentTransform = null;
        if (encrypt) {
          parentTransform = encrypt.createCipherTransform(this.parent.num, this.parent.gen);
        }
        parent.set("V", name);
        parentBuffer = [`${this.parent.num} ${this.parent.gen} obj\n`];
        (0, _writer.writeDict)(parent, parentBuffer, parentTransform);
        parentBuffer.push("\nendobj\n");
      } else if (this.parent instanceof _primitives.Dict) {
        this.parent.set("V", name);
      }
    }
    dict.set("AS", name);
    dict.set("M", `D:${(0, _util.getModificationDate)()}`);
    const maybeMK = this._getMKDict(rotation);
    if (maybeMK) {
      dict.set("MK", maybeMK);
    }
    let originalTransform = null;
    if (encrypt) {
      originalTransform = encrypt.createCipherTransform(this.ref.num, this.ref.gen);
    }
    const buffer = [`${this.ref.num} ${this.ref.gen} obj\n`];
    (0, _writer.writeDict)(dict, buffer, originalTransform);
    buffer.push("\nendobj\n");
    const newRefs = [{
      ref: this.ref,
      data: buffer.join(""),
      xfa
    }];
    if (parentBuffer !== null) {
      newRefs.push({
        ref: this.parent,
        data: parentBuffer.join(""),
        xfa: null
      });
    }
    return newRefs;
  }
  _getDefaultCheckedAppearance(params, type) {
    const width = this.data.rect[2] - this.data.rect[0];
    const height = this.data.rect[3] - this.data.rect[1];
    const bbox = [0, 0, width, height];
    const FONT_RATIO = 0.8;
    const fontSize = Math.min(width, height) * FONT_RATIO;
    let metrics, char;
    if (type === "check") {
      metrics = {
        width: 0.755 * fontSize,
        height: 0.705 * fontSize
      };
      char = "\x33";
    } else if (type === "disc") {
      metrics = {
        width: 0.791 * fontSize,
        height: 0.705 * fontSize
      };
      char = "\x6C";
    } else {
      (0, _util.unreachable)(`_getDefaultCheckedAppearance - unsupported type: ${type}`);
    }
    const xShift = (0, _core_utils.numberToString)((width - metrics.width) / 2);
    const yShift = (0, _core_utils.numberToString)((height - metrics.height) / 2);
    const appearance = `q BT /PdfJsZaDb ${fontSize} Tf 0 g ${xShift} ${yShift} Td (${char}) Tj ET Q`;
    const appearanceStreamDict = new _primitives.Dict(params.xref);
    appearanceStreamDict.set("FormType", 1);
    appearanceStreamDict.set("Subtype", _primitives.Name.get("Form"));
    appearanceStreamDict.set("Type", _primitives.Name.get("XObject"));
    appearanceStreamDict.set("BBox", bbox);
    appearanceStreamDict.set("Matrix", [1, 0, 0, 1, 0, 0]);
    appearanceStreamDict.set("Length", appearance.length);
    const resources = new _primitives.Dict(params.xref);
    const font = new _primitives.Dict(params.xref);
    font.set("PdfJsZaDb", this.fallbackFontDict);
    resources.set("Font", font);
    appearanceStreamDict.set("Resources", resources);
    this.checkedAppearance = new _stream.StringStream(appearance);
    this.checkedAppearance.dict = appearanceStreamDict;
    this._streams.push(this.checkedAppearance);
  }
  _processCheckBox(params) {
    const customAppearance = params.dict.get("AP");
    if (!(customAppearance instanceof _primitives.Dict)) {
      return;
    }
    const normalAppearance = customAppearance.get("N");
    if (!(normalAppearance instanceof _primitives.Dict)) {
      return;
    }
    const asValue = this._decodeFormValue(params.dict.get("AS"));
    if (typeof asValue === "string") {
      this.data.fieldValue = asValue;
    }
    const yes = this.data.fieldValue !== null && this.data.fieldValue !== "Off" ? this.data.fieldValue : "Yes";
    const exportValues = normalAppearance.getKeys();
    if (exportValues.length === 0) {
      exportValues.push("Off", yes);
    } else if (exportValues.length === 1) {
      if (exportValues[0] === "Off") {
        exportValues.push(yes);
      } else {
        exportValues.unshift("Off");
      }
    } else if (exportValues.includes(yes)) {
      exportValues.length = 0;
      exportValues.push("Off", yes);
    } else {
      const otherYes = exportValues.find(v => v !== "Off");
      exportValues.length = 0;
      exportValues.push("Off", otherYes);
    }
    if (!exportValues.includes(this.data.fieldValue)) {
      this.data.fieldValue = "Off";
    }
    this.data.exportValue = exportValues[1];
    const checkedAppearance = normalAppearance.get(this.data.exportValue);
    this.checkedAppearance = checkedAppearance instanceof _base_stream.BaseStream ? checkedAppearance : null;
    const uncheckedAppearance = normalAppearance.get("Off");
    this.uncheckedAppearance = uncheckedAppearance instanceof _base_stream.BaseStream ? uncheckedAppearance : null;
    if (this.checkedAppearance) {
      this._streams.push(this.checkedAppearance);
    } else {
      this._getDefaultCheckedAppearance(params, "check");
    }
    if (this.uncheckedAppearance) {
      this._streams.push(this.uncheckedAppearance);
    }
    this._fallbackFontDict = this.fallbackFontDict;
  }
  _processRadioButton(params) {
    this.data.fieldValue = this.data.buttonValue = null;
    const fieldParent = params.dict.get("Parent");
    if (fieldParent instanceof _primitives.Dict) {
      this.parent = params.dict.getRaw("Parent");
      const fieldParentValue = fieldParent.get("V");
      if (fieldParentValue instanceof _primitives.Name) {
        this.data.fieldValue = this._decodeFormValue(fieldParentValue);
      }
    }
    const appearanceStates = params.dict.get("AP");
    if (!(appearanceStates instanceof _primitives.Dict)) {
      return;
    }
    const normalAppearance = appearanceStates.get("N");
    if (!(normalAppearance instanceof _primitives.Dict)) {
      return;
    }
    for (const key of normalAppearance.getKeys()) {
      if (key !== "Off") {
        this.data.buttonValue = this._decodeFormValue(key);
        break;
      }
    }
    const checkedAppearance = normalAppearance.get(this.data.buttonValue);
    this.checkedAppearance = checkedAppearance instanceof _base_stream.BaseStream ? checkedAppearance : null;
    const uncheckedAppearance = normalAppearance.get("Off");
    this.uncheckedAppearance = uncheckedAppearance instanceof _base_stream.BaseStream ? uncheckedAppearance : null;
    if (this.checkedAppearance) {
      this._streams.push(this.checkedAppearance);
    } else {
      this._getDefaultCheckedAppearance(params, "disc");
    }
    if (this.uncheckedAppearance) {
      this._streams.push(this.uncheckedAppearance);
    }
    this._fallbackFontDict = this.fallbackFontDict;
  }
  _processPushButton(params) {
    if (!params.dict.has("A") && !params.dict.has("AA") && !this.data.alternativeText) {
      (0, _util.warn)("Push buttons without action dictionaries are not supported");
      return;
    }
    this.data.isTooltipOnly = !params.dict.has("A") && !params.dict.has("AA");
    _catalog.Catalog.parseDestDictionary({
      destDict: params.dict,
      resultObj: this.data,
      docBaseUrl: params.pdfManager.docBaseUrl,
      docAttachments: params.attachments
    });
  }
  getFieldObject() {
    let type = "button";
    let exportValues;
    if (this.data.checkBox) {
      type = "checkbox";
      exportValues = this.data.exportValue;
    } else if (this.data.radioButton) {
      type = "radiobutton";
      exportValues = this.data.buttonValue;
    }
    return {
      id: this.data.id,
      value: this.data.fieldValue || "Off",
      defaultValue: this.data.defaultFieldValue,
      exportValues,
      editable: !this.data.readOnly,
      name: this.data.fieldName,
      rect: this.data.rect,
      hidden: this.data.hidden,
      actions: this.data.actions,
      page: this.data.pageIndex,
      strokeColor: this.data.borderColor,
      fillColor: this.data.backgroundColor,
      rotation: this.rotation,
      type
    };
  }
  get fallbackFontDict() {
    const dict = new _primitives.Dict();
    dict.set("BaseFont", _primitives.Name.get("ZapfDingbats"));
    dict.set("Type", _primitives.Name.get("FallbackType"));
    dict.set("Subtype", _primitives.Name.get("FallbackType"));
    dict.set("Encoding", _primitives.Name.get("ZapfDingbatsEncoding"));
    return (0, _util.shadow)(this, "fallbackFontDict", dict);
  }
}
class ChoiceWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.indices = dict.getArray("I");
    this.hasIndices = Array.isArray(this.indices) && this.indices.length > 0;
    this.data.options = [];
    const options = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "Opt"
    });
    if (Array.isArray(options)) {
      for (let i = 0, ii = options.length; i < ii; i++) {
        const option = xref.fetchIfRef(options[i]);
        const isOptionArray = Array.isArray(option);
        this.data.options[i] = {
          exportValue: this._decodeFormValue(isOptionArray ? xref.fetchIfRef(option[0]) : option),
          displayValue: this._decodeFormValue(isOptionArray ? xref.fetchIfRef(option[1]) : option)
        };
      }
    }
    if (!this.hasIndices) {
      if (typeof this.data.fieldValue === "string") {
        this.data.fieldValue = [this.data.fieldValue];
      } else if (!this.data.fieldValue) {
        this.data.fieldValue = [];
      }
    } else {
      this.data.fieldValue = [];
      const ii = this.data.options.length;
      for (const i of this.indices) {
        if (Number.isInteger(i) && i >= 0 && i < ii) {
          this.data.fieldValue.push(this.data.options[i].exportValue);
        }
      }
    }
    this.data.combo = this.hasFieldFlag(_util.AnnotationFieldFlag.COMBO);
    this.data.multiSelect = this.hasFieldFlag(_util.AnnotationFieldFlag.MULTISELECT);
    this._hasText = true;
  }
  getFieldObject() {
    const type = this.data.combo ? "combobox" : "listbox";
    const value = this.data.fieldValue.length > 0 ? this.data.fieldValue[0] : null;
    return {
      id: this.data.id,
      value,
      defaultValue: this.data.defaultFieldValue,
      editable: !this.data.readOnly,
      name: this.data.fieldName,
      rect: this.data.rect,
      numItems: this.data.fieldValue.length,
      multipleSelection: this.data.multiSelect,
      hidden: this.data.hidden,
      actions: this.data.actions,
      items: this.data.options,
      page: this.data.pageIndex,
      strokeColor: this.data.borderColor,
      fillColor: this.data.backgroundColor,
      rotation: this.rotation,
      type
    };
  }
  amendSavedDict(annotationStorage, dict) {
    if (!this.hasIndices) {
      return;
    }
    const storageEntry = annotationStorage ? annotationStorage.get(this.data.id) : undefined;
    let values = storageEntry && storageEntry.value;
    if (!Array.isArray(values)) {
      values = [values];
    }
    const indices = [];
    const {
      options
    } = this.data;
    for (let i = 0, j = 0, ii = options.length; i < ii; i++) {
      if (options[i].exportValue === values[j]) {
        indices.push(i);
        j += 1;
      }
    }
    dict.set("I", indices);
  }
  async _getAppearance(evaluator, task, intent, annotationStorage) {
    if (this.data.combo) {
      return super._getAppearance(evaluator, task, intent, annotationStorage);
    }
    let exportedValue, rotation;
    const storageEntry = annotationStorage ? annotationStorage.get(this.data.id) : undefined;
    if (storageEntry) {
      rotation = storageEntry.rotation;
      exportedValue = storageEntry.value;
    }
    if (rotation === undefined && exportedValue === undefined && !this._needAppearances) {
      return null;
    }
    if (exportedValue === undefined) {
      exportedValue = this.data.fieldValue;
    } else if (!Array.isArray(exportedValue)) {
      exportedValue = [exportedValue];
    }
    const defaultPadding = 1;
    const defaultHPadding = 2;
    let totalHeight = this.data.rect[3] - this.data.rect[1];
    let totalWidth = this.data.rect[2] - this.data.rect[0];
    if (rotation === 90 || rotation === 270) {
      [totalWidth, totalHeight] = [totalHeight, totalWidth];
    }
    const lineCount = this.data.options.length;
    const valueIndices = [];
    for (let i = 0; i < lineCount; i++) {
      const {
        exportValue
      } = this.data.options[i];
      if (exportedValue.includes(exportValue)) {
        valueIndices.push(i);
      }
    }
    if (!this._defaultAppearance) {
      this.data.defaultAppearanceData = (0, _default_appearance.parseDefaultAppearance)(this._defaultAppearance = "/Helvetica 0 Tf 0 g");
    }
    const font = await WidgetAnnotation._getFontData(evaluator, task, this.data.defaultAppearanceData, this._fieldResources.mergedResources);
    let defaultAppearance;
    let {
      fontSize
    } = this.data.defaultAppearanceData;
    if (!fontSize) {
      const lineHeight = (totalHeight - defaultPadding) / lineCount;
      let lineWidth = -1;
      let value;
      for (const {
        displayValue
      } of this.data.options) {
        const width = this._getTextWidth(displayValue, font);
        if (width > lineWidth) {
          lineWidth = width;
          value = displayValue;
        }
      }
      [defaultAppearance, fontSize] = this._computeFontSize(lineHeight, totalWidth - 2 * defaultHPadding, value, font, -1);
    } else {
      defaultAppearance = this._defaultAppearance;
    }
    const lineHeight = fontSize * _util.LINE_FACTOR;
    const vPadding = (lineHeight - fontSize) / 2;
    const numberOfVisibleLines = Math.floor(totalHeight / lineHeight);
    let firstIndex;
    if (valueIndices.length === 1) {
      const valuePosition = valueIndices[0];
      const indexInPage = valuePosition % numberOfVisibleLines;
      firstIndex = valuePosition - indexInPage;
    } else {
      firstIndex = valueIndices.length ? valueIndices[0] : 0;
    }
    const end = Math.min(firstIndex + numberOfVisibleLines + 1, lineCount);
    const buf = ["/Tx BMC q", `1 1 ${totalWidth} ${totalHeight} re W n`];
    if (valueIndices.length) {
      buf.push("0.600006 0.756866 0.854904 rg");
      for (const index of valueIndices) {
        if (firstIndex <= index && index < end) {
          buf.push(`1 ${totalHeight - (index - firstIndex + 1) * lineHeight} ${totalWidth} ${lineHeight} re f`);
        }
      }
    }
    buf.push("BT", defaultAppearance, `1 0 0 1 0 ${totalHeight} Tm`);
    const prevInfo = {
      shift: 0
    };
    for (let i = firstIndex; i < end; i++) {
      const {
        displayValue
      } = this.data.options[i];
      const vpadding = i === firstIndex ? vPadding : 0;
      buf.push(this._renderText(displayValue, font, fontSize, totalWidth, 0, prevInfo, defaultHPadding, -lineHeight + vpadding));
    }
    buf.push("ET Q EMC");
    return buf.join("\n");
  }
}
class SignatureWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);
    this.data.fieldValue = null;
  }
  getFieldObject() {
    return {
      id: this.data.id,
      value: null,
      page: this.data.pageIndex,
      type: "signature"
    };
  }
}
class TextAnnotation extends MarkupAnnotation {
  constructor(params) {
    const DEFAULT_ICON_SIZE = 22;
    super(params);
    const {
      dict
    } = params;
    this.data.annotationType = _util.AnnotationType.TEXT;
    if (this.data.hasAppearance) {
      this.data.name = "NoIcon";
    } else {
      this.data.rect[1] = this.data.rect[3] - DEFAULT_ICON_SIZE;
      this.data.rect[2] = this.data.rect[0] + DEFAULT_ICON_SIZE;
      this.data.name = dict.has("Name") ? dict.get("Name").name : "Note";
    }
    if (dict.has("State")) {
      this.data.state = dict.get("State") || null;
      this.data.stateModel = dict.get("StateModel") || null;
    } else {
      this.data.state = null;
      this.data.stateModel = null;
    }
  }
}
class LinkAnnotation extends Annotation {
  constructor(params) {
    super(params);
    this.data.annotationType = _util.AnnotationType.LINK;
    const quadPoints = getQuadPoints(params.dict, this.rectangle);
    if (quadPoints) {
      this.data.quadPoints = quadPoints;
    }
    this.data.borderColor = this.data.borderColor || this.data.color;
    _catalog.Catalog.parseDestDictionary({
      destDict: params.dict,
      resultObj: this.data,
      docBaseUrl: params.pdfManager.docBaseUrl,
      docAttachments: params.attachments
    });
  }
}
class PopupAnnotation extends Annotation {
  constructor(params) {
    super(params);
    const {
      dict
    } = params;
    this.data.annotationType = _util.AnnotationType.POPUP;
    let parentItem = dict.get("Parent");
    if (!parentItem) {
      (0, _util.warn)("Popup annotation has a missing or invalid parent annotation.");
      return;
    }
    const parentSubtype = parentItem.get("Subtype");
    this.data.parentType = parentSubtype instanceof _primitives.Name ? parentSubtype.name : null;
    const rawParent = dict.getRaw("Parent");
    this.data.parentId = rawParent instanceof _primitives.Ref ? rawParent.toString() : null;
    const parentRect = parentItem.getArray("Rect");
    if (Array.isArray(parentRect) && parentRect.length === 4) {
      this.data.parentRect = _util.Util.normalizeRect(parentRect);
    } else {
      this.data.parentRect = [0, 0, 0, 0];
    }
    const rt = parentItem.get("RT");
    if ((0, _primitives.isName)(rt, _util.AnnotationReplyType.GROUP)) {
      parentItem = parentItem.get("IRT");
    }
    if (!parentItem.has("M")) {
      this.data.modificationDate = null;
    } else {
      this.setModificationDate(parentItem.get("M"));
      this.data.modificationDate = this.modificationDate;
    }
    if (!parentItem.has("C")) {
      this.data.color = null;
    } else {
      this.setColor(parentItem.getArray("C"));
      this.data.color = this.color;
    }
    if (!this.viewable) {
      const parentFlags = parentItem.get("F");
      if (this._isViewable(parentFlags)) {
        this.setFlags(parentFlags);
      }
    }
    this.setTitle(parentItem.get("T"));
    this.data.titleObj = this._title;
    this.setContents(parentItem.get("Contents"));
    this.data.contentsObj = this._contents;
    if (parentItem.has("RC")) {
      this.data.richText = _factory.XFAFactory.getRichTextAsHtml(parentItem.get("RC"));
    }
  }
}
exports.PopupAnnotation = PopupAnnotation;
class FreeTextAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.FREETEXT;
    this.setDefaultAppearance(params);
    if (!this.appearance && this._isOffscreenCanvasSupported) {
      const strokeAlpha = params.dict.get("CA");
      const fakeUnicodeFont = new _default_appearance.FakeUnicodeFont(xref, "sans-serif");
      const fontData = this.data.defaultAppearanceData;
      this.appearance = fakeUnicodeFont.createAppearance(this._contents.str, this.rectangle, this.rotation, fontData.fontSize || 10, fontData.fontColor, strokeAlpha);
      this._streams.push(this.appearance, _default_appearance.FakeUnicodeFont.toUnicodeStream);
    } else if (!this._isOffscreenCanvasSupported) {
      (0, _util.warn)("FreeTextAnnotation: OffscreenCanvas is not supported, annotation may not render correctly.");
    }
  }
  get hasTextContent() {
    return !!this.appearance;
  }
  static createNewDict(annotation, xref, {
    apRef,
    ap
  }) {
    const {
      color,
      fontSize,
      rect,
      rotation,
      user,
      value
    } = annotation;
    const freetext = new _primitives.Dict(xref);
    freetext.set("Type", _primitives.Name.get("Annot"));
    freetext.set("Subtype", _primitives.Name.get("FreeText"));
    freetext.set("CreationDate", `D:${(0, _util.getModificationDate)()}`);
    freetext.set("Rect", rect);
    const da = `/Helv ${fontSize} Tf ${(0, _default_appearance.getPdfColor)(color, true)}`;
    freetext.set("DA", da);
    freetext.set("Contents", (0, _core_utils.isAscii)(value) ? value : (0, _core_utils.stringToUTF16String)(value, true));
    freetext.set("F", 4);
    freetext.set("Border", [0, 0, 0]);
    freetext.set("Rotate", rotation);
    if (user) {
      freetext.set("T", (0, _core_utils.isAscii)(user) ? user : (0, _core_utils.stringToUTF16String)(user, true));
    }
    if (apRef || ap) {
      const n = new _primitives.Dict(xref);
      freetext.set("AP", n);
      if (apRef) {
        n.set("N", apRef);
      } else {
        n.set("N", ap);
      }
    }
    return freetext;
  }
  static async createNewAppearanceStream(annotation, xref, params) {
    const {
      baseFontRef,
      evaluator,
      task
    } = params;
    const {
      color,
      fontSize,
      rect,
      rotation,
      value
    } = annotation;
    const resources = new _primitives.Dict(xref);
    const font = new _primitives.Dict(xref);
    if (baseFontRef) {
      font.set("Helv", baseFontRef);
    } else {
      const baseFont = new _primitives.Dict(xref);
      baseFont.set("BaseFont", _primitives.Name.get("Helvetica"));
      baseFont.set("Type", _primitives.Name.get("Font"));
      baseFont.set("Subtype", _primitives.Name.get("Type1"));
      baseFont.set("Encoding", _primitives.Name.get("WinAnsiEncoding"));
      font.set("Helv", baseFont);
    }
    resources.set("Font", font);
    const helv = await WidgetAnnotation._getFontData(evaluator, task, {
      fontName: "Helvetica",
      fontSize
    }, resources);
    const [x1, y1, x2, y2] = rect;
    let w = x2 - x1;
    let h = y2 - y1;
    if (rotation % 180 !== 0) {
      [w, h] = [h, w];
    }
    const lines = value.split("\n");
    const scale = fontSize / 1000;
    let totalWidth = -Infinity;
    const encodedLines = [];
    for (let line of lines) {
      const encoded = helv.encodeString(line);
      if (encoded.length > 1) {
        return null;
      }
      line = encoded.join("");
      encodedLines.push(line);
      let lineWidth = 0;
      const glyphs = helv.charsToGlyphs(line);
      for (const glyph of glyphs) {
        lineWidth += glyph.width * scale;
      }
      totalWidth = Math.max(totalWidth, lineWidth);
    }
    let hscale = 1;
    if (totalWidth > w) {
      hscale = w / totalWidth;
    }
    let vscale = 1;
    const lineHeight = _util.LINE_FACTOR * fontSize;
    const lineDescent = _util.LINE_DESCENT_FACTOR * fontSize;
    const totalHeight = lineHeight * lines.length;
    if (totalHeight > h) {
      vscale = h / totalHeight;
    }
    const fscale = Math.min(hscale, vscale);
    const newFontSize = fontSize * fscale;
    const buffer = ["q", `0 0 ${(0, _core_utils.numberToString)(w)} ${(0, _core_utils.numberToString)(h)} re W n`, `BT`, `1 0 0 1 0 ${(0, _core_utils.numberToString)(h + lineDescent)} Tm 0 Tc ${(0, _default_appearance.getPdfColor)(color, true)}`, `/Helv ${(0, _core_utils.numberToString)(newFontSize)} Tf`];
    const vShift = (0, _core_utils.numberToString)(lineHeight);
    for (const line of encodedLines) {
      buffer.push(`0 -${vShift} Td (${(0, _core_utils.escapeString)(line)}) Tj`);
    }
    buffer.push("ET", "Q");
    const appearance = buffer.join("\n");
    const appearanceStreamDict = new _primitives.Dict(xref);
    appearanceStreamDict.set("FormType", 1);
    appearanceStreamDict.set("Subtype", _primitives.Name.get("Form"));
    appearanceStreamDict.set("Type", _primitives.Name.get("XObject"));
    appearanceStreamDict.set("BBox", [0, 0, w, h]);
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
class LineAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.LINE;
    const lineCoordinates = dict.getArray("L");
    this.data.lineCoordinates = _util.Util.normalizeRect(lineCoordinates);
    this.setLineEndings(dict.getArray("LE"));
    this.data.lineEndings = this.lineEndings;
    if (!this.appearance) {
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");
      const interiorColor = getRgbColor(dict.getArray("IC"), null);
      const fillColor = interiorColor ? getPdfColorArray(interiorColor) : null;
      const fillAlpha = fillColor ? strokeAlpha : null;
      const borderWidth = this.borderStyle.width || 1,
        borderAdjust = 2 * borderWidth;
      const bbox = [this.data.lineCoordinates[0] - borderAdjust, this.data.lineCoordinates[1] - borderAdjust, this.data.lineCoordinates[2] + borderAdjust, this.data.lineCoordinates[3] + borderAdjust];
      if (!_util.Util.intersect(this.rectangle, bbox)) {
        this.rectangle = bbox;
      }
      this._setDefaultAppearance({
        xref,
        extra: `${borderWidth} w`,
        strokeColor,
        fillColor,
        strokeAlpha,
        fillAlpha,
        pointsCallback: (buffer, points) => {
          buffer.push(`${lineCoordinates[0]} ${lineCoordinates[1]} m`, `${lineCoordinates[2]} ${lineCoordinates[3]} l`, "S");
          return [points[0].x - borderWidth, points[1].x + borderWidth, points[3].y - borderWidth, points[1].y + borderWidth];
        }
      });
    }
  }
}
class SquareAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.SQUARE;
    if (!this.appearance) {
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");
      const interiorColor = getRgbColor(dict.getArray("IC"), null);
      const fillColor = interiorColor ? getPdfColorArray(interiorColor) : null;
      const fillAlpha = fillColor ? strokeAlpha : null;
      if (this.borderStyle.width === 0 && !fillColor) {
        return;
      }
      this._setDefaultAppearance({
        xref,
        extra: `${this.borderStyle.width} w`,
        strokeColor,
        fillColor,
        strokeAlpha,
        fillAlpha,
        pointsCallback: (buffer, points) => {
          const x = points[2].x + this.borderStyle.width / 2;
          const y = points[2].y + this.borderStyle.width / 2;
          const width = points[3].x - points[2].x - this.borderStyle.width;
          const height = points[1].y - points[3].y - this.borderStyle.width;
          buffer.push(`${x} ${y} ${width} ${height} re`);
          if (fillColor) {
            buffer.push("B");
          } else {
            buffer.push("S");
          }
          return [points[0].x, points[1].x, points[3].y, points[1].y];
        }
      });
    }
  }
}
class CircleAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.CIRCLE;
    if (!this.appearance) {
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");
      const interiorColor = getRgbColor(dict.getArray("IC"), null);
      const fillColor = interiorColor ? getPdfColorArray(interiorColor) : null;
      const fillAlpha = fillColor ? strokeAlpha : null;
      if (this.borderStyle.width === 0 && !fillColor) {
        return;
      }
      const controlPointsDistance = 4 / 3 * Math.tan(Math.PI / (2 * 4));
      this._setDefaultAppearance({
        xref,
        extra: `${this.borderStyle.width} w`,
        strokeColor,
        fillColor,
        strokeAlpha,
        fillAlpha,
        pointsCallback: (buffer, points) => {
          const x0 = points[0].x + this.borderStyle.width / 2;
          const y0 = points[0].y - this.borderStyle.width / 2;
          const x1 = points[3].x - this.borderStyle.width / 2;
          const y1 = points[3].y + this.borderStyle.width / 2;
          const xMid = x0 + (x1 - x0) / 2;
          const yMid = y0 + (y1 - y0) / 2;
          const xOffset = (x1 - x0) / 2 * controlPointsDistance;
          const yOffset = (y1 - y0) / 2 * controlPointsDistance;
          buffer.push(`${xMid} ${y1} m`, `${xMid + xOffset} ${y1} ${x1} ${yMid + yOffset} ${x1} ${yMid} c`, `${x1} ${yMid - yOffset} ${xMid + xOffset} ${y0} ${xMid} ${y0} c`, `${xMid - xOffset} ${y0} ${x0} ${yMid - yOffset} ${x0} ${yMid} c`, `${x0} ${yMid + yOffset} ${xMid - xOffset} ${y1} ${xMid} ${y1} c`, "h");
          if (fillColor) {
            buffer.push("B");
          } else {
            buffer.push("S");
          }
          return [points[0].x, points[1].x, points[3].y, points[1].y];
        }
      });
    }
  }
}
class PolylineAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.POLYLINE;
    this.data.vertices = [];
    if (!(this instanceof PolygonAnnotation)) {
      this.setLineEndings(dict.getArray("LE"));
      this.data.lineEndings = this.lineEndings;
    }
    const rawVertices = dict.getArray("Vertices");
    if (!Array.isArray(rawVertices)) {
      return;
    }
    for (let i = 0, ii = rawVertices.length; i < ii; i += 2) {
      this.data.vertices.push({
        x: rawVertices[i],
        y: rawVertices[i + 1]
      });
    }
    if (!this.appearance) {
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");
      const borderWidth = this.borderStyle.width || 1,
        borderAdjust = 2 * borderWidth;
      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const vertex of this.data.vertices) {
        bbox[0] = Math.min(bbox[0], vertex.x - borderAdjust);
        bbox[1] = Math.min(bbox[1], vertex.y - borderAdjust);
        bbox[2] = Math.max(bbox[2], vertex.x + borderAdjust);
        bbox[3] = Math.max(bbox[3], vertex.y + borderAdjust);
      }
      if (!_util.Util.intersect(this.rectangle, bbox)) {
        this.rectangle = bbox;
      }
      this._setDefaultAppearance({
        xref,
        extra: `${borderWidth} w`,
        strokeColor,
        strokeAlpha,
        pointsCallback: (buffer, points) => {
          const vertices = this.data.vertices;
          for (let i = 0, ii = vertices.length; i < ii; i++) {
            buffer.push(`${vertices[i].x} ${vertices[i].y} ${i === 0 ? "m" : "l"}`);
          }
          buffer.push("S");
          return [points[0].x, points[1].x, points[3].y, points[1].y];
        }
      });
    }
  }
}
class PolygonAnnotation extends PolylineAnnotation {
  constructor(params) {
    super(params);
    this.data.annotationType = _util.AnnotationType.POLYGON;
  }
}
class CaretAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    this.data.annotationType = _util.AnnotationType.CARET;
  }
}
class InkAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.INK;
    this.data.inkLists = [];
    const rawInkLists = dict.getArray("InkList");
    if (!Array.isArray(rawInkLists)) {
      return;
    }
    for (let i = 0, ii = rawInkLists.length; i < ii; ++i) {
      this.data.inkLists.push([]);
      for (let j = 0, jj = rawInkLists[i].length; j < jj; j += 2) {
        this.data.inkLists[i].push({
          x: xref.fetchIfRef(rawInkLists[i][j]),
          y: xref.fetchIfRef(rawInkLists[i][j + 1])
        });
      }
    }
    if (!this.appearance) {
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");
      const borderWidth = this.borderStyle.width || 1,
        borderAdjust = 2 * borderWidth;
      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const inkLists of this.data.inkLists) {
        for (const vertex of inkLists) {
          bbox[0] = Math.min(bbox[0], vertex.x - borderAdjust);
          bbox[1] = Math.min(bbox[1], vertex.y - borderAdjust);
          bbox[2] = Math.max(bbox[2], vertex.x + borderAdjust);
          bbox[3] = Math.max(bbox[3], vertex.y + borderAdjust);
        }
      }
      if (!_util.Util.intersect(this.rectangle, bbox)) {
        this.rectangle = bbox;
      }
      this._setDefaultAppearance({
        xref,
        extra: `${borderWidth} w`,
        strokeColor,
        strokeAlpha,
        pointsCallback: (buffer, points) => {
          for (const inkList of this.data.inkLists) {
            for (let i = 0, ii = inkList.length; i < ii; i++) {
              buffer.push(`${inkList[i].x} ${inkList[i].y} ${i === 0 ? "m" : "l"}`);
            }
            buffer.push("S");
          }
          return [points[0].x, points[1].x, points[3].y, points[1].y];
        }
      });
    }
  }
  static createNewDict(annotation, xref, {
    apRef,
    ap
  }) {
    const {
      paths,
      rect,
      rotation
    } = annotation;
    const ink = new _primitives.Dict(xref);
    ink.set("Type", _primitives.Name.get("Annot"));
    ink.set("Subtype", _primitives.Name.get("Ink"));
    ink.set("CreationDate", `D:${(0, _util.getModificationDate)()}`);
    ink.set("Rect", rect);
    ink.set("InkList", paths.map(p => p.points));
    ink.set("F", 4);
    ink.set("Border", [0, 0, 0]);
    ink.set("Rotate", rotation);
    const n = new _primitives.Dict(xref);
    ink.set("AP", n);
    if (apRef) {
      n.set("N", apRef);
    } else {
      n.set("N", ap);
    }
    return ink;
  }
  static async createNewAppearanceStream(annotation, xref, params) {
    const {
      color,
      rect,
      rotation,
      paths,
      thickness,
      opacity
    } = annotation;
    const [x1, y1, x2, y2] = rect;
    let w = x2 - x1;
    let h = y2 - y1;
    if (rotation % 180 !== 0) {
      [w, h] = [h, w];
    }
    const appearanceBuffer = [`${thickness} w 1 J 1 j`, `${(0, _default_appearance.getPdfColor)(color, false)}`];
    if (opacity !== 1) {
      appearanceBuffer.push("/R0 gs");
    }
    const buffer = [];
    for (const {
      bezier
    } of paths) {
      buffer.length = 0;
      buffer.push(`${(0, _core_utils.numberToString)(bezier[0])} ${(0, _core_utils.numberToString)(bezier[1])} m`);
      for (let i = 2, ii = bezier.length; i < ii; i += 6) {
        const curve = bezier.slice(i, i + 6).map(_core_utils.numberToString).join(" ");
        buffer.push(`${curve} c`);
      }
      buffer.push("S");
      appearanceBuffer.push(buffer.join("\n"));
    }
    const appearance = appearanceBuffer.join("\n");
    const appearanceStreamDict = new _primitives.Dict(xref);
    appearanceStreamDict.set("FormType", 1);
    appearanceStreamDict.set("Subtype", _primitives.Name.get("Form"));
    appearanceStreamDict.set("Type", _primitives.Name.get("XObject"));
    appearanceStreamDict.set("BBox", [0, 0, w, h]);
    appearanceStreamDict.set("Length", appearance.length);
    if (rotation) {
      const matrix = (0, _core_utils.getRotationMatrix)(rotation, w, h);
      appearanceStreamDict.set("Matrix", matrix);
    }
    if (opacity !== 1) {
      const resources = new _primitives.Dict(xref);
      const extGState = new _primitives.Dict(xref);
      const r0 = new _primitives.Dict(xref);
      r0.set("CA", opacity);
      r0.set("Type", _primitives.Name.get("ExtGState"));
      extGState.set("R0", r0);
      resources.set("ExtGState", extGState);
      appearanceStreamDict.set("Resources", resources);
    }
    const ap = new _stream.StringStream(appearance);
    ap.dict = appearanceStreamDict;
    return ap;
  }
}
class HighlightAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.HIGHLIGHT;
    const quadPoints = this.data.quadPoints = getQuadPoints(dict, null);
    if (quadPoints) {
      const resources = this.appearance && this.appearance.dict.get("Resources");
      if (!this.appearance || !(resources && resources.has("ExtGState"))) {
        if (this.appearance) {
          (0, _util.warn)("HighlightAnnotation - ignoring built-in appearance stream.");
        }
        const fillColor = this.color ? getPdfColorArray(this.color) : [1, 1, 0];
        const fillAlpha = dict.get("CA");
        this._setDefaultAppearance({
          xref,
          fillColor,
          blendMode: "Multiply",
          fillAlpha,
          pointsCallback: (buffer, points) => {
            buffer.push(`${points[0].x} ${points[0].y} m`, `${points[1].x} ${points[1].y} l`, `${points[3].x} ${points[3].y} l`, `${points[2].x} ${points[2].y} l`, "f");
            return [points[0].x, points[1].x, points[3].y, points[1].y];
          }
        });
      }
    } else {
      this.data.hasPopup = false;
    }
  }
}
class UnderlineAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.UNDERLINE;
    const quadPoints = this.data.quadPoints = getQuadPoints(dict, null);
    if (quadPoints) {
      if (!this.appearance) {
        const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
        const strokeAlpha = dict.get("CA");
        this._setDefaultAppearance({
          xref,
          extra: "[] 0 d 1 w",
          strokeColor,
          strokeAlpha,
          pointsCallback: (buffer, points) => {
            buffer.push(`${points[2].x} ${points[2].y} m`, `${points[3].x} ${points[3].y} l`, "S");
            return [points[0].x, points[1].x, points[3].y, points[1].y];
          }
        });
      }
    } else {
      this.data.hasPopup = false;
    }
  }
}
class SquigglyAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.SQUIGGLY;
    const quadPoints = this.data.quadPoints = getQuadPoints(dict, null);
    if (quadPoints) {
      if (!this.appearance) {
        const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
        const strokeAlpha = dict.get("CA");
        this._setDefaultAppearance({
          xref,
          extra: "[] 0 d 1 w",
          strokeColor,
          strokeAlpha,
          pointsCallback: (buffer, points) => {
            const dy = (points[0].y - points[2].y) / 6;
            let shift = dy;
            let x = points[2].x;
            const y = points[2].y;
            const xEnd = points[3].x;
            buffer.push(`${x} ${y + shift} m`);
            do {
              x += 2;
              shift = shift === 0 ? dy : 0;
              buffer.push(`${x} ${y + shift} l`);
            } while (x < xEnd);
            buffer.push("S");
            return [points[2].x, xEnd, y - 2 * dy, y + 2 * dy];
          }
        });
      }
    } else {
      this.data.hasPopup = false;
    }
  }
}
class StrikeOutAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    this.data.annotationType = _util.AnnotationType.STRIKEOUT;
    const quadPoints = this.data.quadPoints = getQuadPoints(dict, null);
    if (quadPoints) {
      if (!this.appearance) {
        const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
        const strokeAlpha = dict.get("CA");
        this._setDefaultAppearance({
          xref,
          extra: "[] 0 d 1 w",
          strokeColor,
          strokeAlpha,
          pointsCallback: (buffer, points) => {
            buffer.push(`${(points[0].x + points[2].x) / 2} ` + `${(points[0].y + points[2].y) / 2} m`, `${(points[1].x + points[3].x) / 2} ` + `${(points[1].y + points[3].y) / 2} l`, "S");
            return [points[0].x, points[1].x, points[3].y, points[1].y];
          }
        });
      }
    } else {
      this.data.hasPopup = false;
    }
  }
}
class StampAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    this.data.annotationType = _util.AnnotationType.STAMP;
  }
}
class FileAttachmentAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);
    const {
      dict,
      xref
    } = params;
    const file = new _file_spec.FileSpec(dict.get("FS"), xref);
    this.data.annotationType = _util.AnnotationType.FILEATTACHMENT;
    this.data.file = file.serializable;
    const name = dict.get("Name");
    this.data.name = name instanceof _primitives.Name ? (0, _util.stringToPDFString)(name.name) : "PushPin";
  }
}