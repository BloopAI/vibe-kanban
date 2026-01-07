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
exports.PartialEvaluator = exports.EvaluatorPreprocessor = void 0;
var _util = require("../shared/util.js");
var _cmap = require("./cmap.js");
var _primitives = require("./primitives.js");
var _fonts = require("./fonts.js");
var _encodings = require("./encodings.js");
var _standard_fonts = require("./standard_fonts.js");
var _pattern = require("./pattern.js");
var _xfa_fonts = require("./xfa_fonts.js");
var _to_unicode_map = require("./to_unicode_map.js");
var _function = require("./function.js");
var _parser = require("./parser.js");
var _image_utils = require("./image_utils.js");
var _stream = require("./stream.js");
var _base_stream = require("./base_stream.js");
var _bidi = require("./bidi.js");
var _colorspace = require("./colorspace.js");
var _decode_stream = require("./decode_stream.js");
var _fonts_utils = require("./fonts_utils.js");
var _glyphlist = require("./glyphlist.js");
var _core_utils = require("./core_utils.js");
var _metrics = require("./metrics.js");
var _unicode = require("./unicode.js");
var _murmurhash = require("../shared/murmurhash3.js");
var _operator_list = require("./operator_list.js");
var _image = require("./image.js");
const DefaultPartialEvaluatorOptions = Object.freeze({
  maxImageSize: -1,
  disableFontFace: false,
  ignoreErrors: false,
  isEvalSupported: true,
  isOffscreenCanvasSupported: true,
  fontExtraProperties: false,
  useSystemFonts: true,
  cMapUrl: null,
  standardFontDataUrl: null
});
const PatternType = {
  TILING: 1,
  SHADING: 2
};
const TEXT_CHUNK_BATCH_SIZE = 10;
const deferred = Promise.resolve();
function normalizeBlendMode(value, parsingArray = false) {
  if (Array.isArray(value)) {
    for (const val of value) {
      const maybeBM = normalizeBlendMode(val, true);
      if (maybeBM) {
        return maybeBM;
      }
    }
    (0, _util.warn)(`Unsupported blend mode Array: ${value}`);
    return "source-over";
  }
  if (!(value instanceof _primitives.Name)) {
    if (parsingArray) {
      return null;
    }
    return "source-over";
  }
  switch (value.name) {
    case "Normal":
    case "Compatible":
      return "source-over";
    case "Multiply":
      return "multiply";
    case "Screen":
      return "screen";
    case "Overlay":
      return "overlay";
    case "Darken":
      return "darken";
    case "Lighten":
      return "lighten";
    case "ColorDodge":
      return "color-dodge";
    case "ColorBurn":
      return "color-burn";
    case "HardLight":
      return "hard-light";
    case "SoftLight":
      return "soft-light";
    case "Difference":
      return "difference";
    case "Exclusion":
      return "exclusion";
    case "Hue":
      return "hue";
    case "Saturation":
      return "saturation";
    case "Color":
      return "color";
    case "Luminosity":
      return "luminosity";
  }
  if (parsingArray) {
    return null;
  }
  (0, _util.warn)(`Unsupported blend mode: ${value.name}`);
  return "source-over";
}
function incrementCachedImageMaskCount(data) {
  if (data.fn === _util.OPS.paintImageMaskXObject && data.args[0] && data.args[0].count > 0) {
    data.args[0].count++;
  }
}
class TimeSlotManager {
  static get TIME_SLOT_DURATION_MS() {
    return (0, _util.shadow)(this, "TIME_SLOT_DURATION_MS", 20);
  }
  static get CHECK_TIME_EVERY() {
    return (0, _util.shadow)(this, "CHECK_TIME_EVERY", 100);
  }
  constructor() {
    this.reset();
  }
  check() {
    if (++this.checked < TimeSlotManager.CHECK_TIME_EVERY) {
      return false;
    }
    this.checked = 0;
    return this.endTime <= Date.now();
  }
  reset() {
    this.endTime = Date.now() + TimeSlotManager.TIME_SLOT_DURATION_MS;
    this.checked = 0;
  }
}
class PartialEvaluator {
  constructor({
    xref,
    handler,
    pageIndex,
    idFactory,
    fontCache,
    builtInCMapCache,
    standardFontDataCache,
    globalImageCache,
    options = null
  }) {
    this.xref = xref;
    this.handler = handler;
    this.pageIndex = pageIndex;
    this.idFactory = idFactory;
    this.fontCache = fontCache;
    this.builtInCMapCache = builtInCMapCache;
    this.standardFontDataCache = standardFontDataCache;
    this.globalImageCache = globalImageCache;
    this.options = options || DefaultPartialEvaluatorOptions;
    this.parsingType3Font = false;
    this._fetchBuiltInCMapBound = this.fetchBuiltInCMap.bind(this);
  }
  get _pdfFunctionFactory() {
    const pdfFunctionFactory = new _function.PDFFunctionFactory({
      xref: this.xref,
      isEvalSupported: this.options.isEvalSupported
    });
    return (0, _util.shadow)(this, "_pdfFunctionFactory", pdfFunctionFactory);
  }
  clone(newOptions = null) {
    const newEvaluator = Object.create(this);
    newEvaluator.options = Object.assign(Object.create(null), this.options, newOptions);
    return newEvaluator;
  }
  hasBlendModes(resources, nonBlendModesSet) {
    if (!(resources instanceof _primitives.Dict)) {
      return false;
    }
    if (resources.objId && nonBlendModesSet.has(resources.objId)) {
      return false;
    }
    const processed = new _primitives.RefSet(nonBlendModesSet);
    if (resources.objId) {
      processed.put(resources.objId);
    }
    const nodes = [resources],
      xref = this.xref;
    while (nodes.length) {
      const node = nodes.shift();
      const graphicStates = node.get("ExtGState");
      if (graphicStates instanceof _primitives.Dict) {
        for (let graphicState of graphicStates.getRawValues()) {
          if (graphicState instanceof _primitives.Ref) {
            if (processed.has(graphicState)) {
              continue;
            }
            try {
              graphicState = xref.fetch(graphicState);
            } catch (ex) {
              processed.put(graphicState);
              (0, _util.info)(`hasBlendModes - ignoring ExtGState: "${ex}".`);
              continue;
            }
          }
          if (!(graphicState instanceof _primitives.Dict)) {
            continue;
          }
          if (graphicState.objId) {
            processed.put(graphicState.objId);
          }
          const bm = graphicState.get("BM");
          if (bm instanceof _primitives.Name) {
            if (bm.name !== "Normal") {
              return true;
            }
            continue;
          }
          if (bm !== undefined && Array.isArray(bm)) {
            for (const element of bm) {
              if (element instanceof _primitives.Name && element.name !== "Normal") {
                return true;
              }
            }
          }
        }
      }
      const xObjects = node.get("XObject");
      if (!(xObjects instanceof _primitives.Dict)) {
        continue;
      }
      for (let xObject of xObjects.getRawValues()) {
        if (xObject instanceof _primitives.Ref) {
          if (processed.has(xObject)) {
            continue;
          }
          try {
            xObject = xref.fetch(xObject);
          } catch (ex) {
            processed.put(xObject);
            (0, _util.info)(`hasBlendModes - ignoring XObject: "${ex}".`);
            continue;
          }
        }
        if (!(xObject instanceof _base_stream.BaseStream)) {
          continue;
        }
        if (xObject.dict.objId) {
          processed.put(xObject.dict.objId);
        }
        const xResources = xObject.dict.get("Resources");
        if (!(xResources instanceof _primitives.Dict)) {
          continue;
        }
        if (xResources.objId && processed.has(xResources.objId)) {
          continue;
        }
        nodes.push(xResources);
        if (xResources.objId) {
          processed.put(xResources.objId);
        }
      }
    }
    for (const ref of processed) {
      nonBlendModesSet.put(ref);
    }
    return false;
  }
  async fetchBuiltInCMap(name) {
    const cachedData = this.builtInCMapCache.get(name);
    if (cachedData) {
      return cachedData;
    }
    let data;
    if (this.options.cMapUrl !== null) {
      const url = `${this.options.cMapUrl}${name}.bcmap`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`fetchBuiltInCMap: failed to fetch file "${url}" with "${response.statusText}".`);
      }
      data = {
        cMapData: new Uint8Array(await response.arrayBuffer()),
        compressionType: _util.CMapCompressionType.BINARY
      };
    } else {
      data = await this.handler.sendWithPromise("FetchBuiltInCMap", {
        name
      });
    }
    if (data.compressionType !== _util.CMapCompressionType.NONE) {
      this.builtInCMapCache.set(name, data);
    }
    return data;
  }
  async fetchStandardFontData(name) {
    const cachedData = this.standardFontDataCache.get(name);
    if (cachedData) {
      return new _stream.Stream(cachedData);
    }
    if (this.options.useSystemFonts && name !== "Symbol" && name !== "ZapfDingbats") {
      return null;
    }
    const standardFontNameToFileName = (0, _standard_fonts.getFontNameToFileMap)(),
      filename = standardFontNameToFileName[name];
    let data;
    if (this.options.standardFontDataUrl !== null) {
      const url = `${this.options.standardFontDataUrl}${filename}`;
      const response = await fetch(url);
      if (!response.ok) {
        (0, _util.warn)(`fetchStandardFontData: failed to fetch file "${url}" with "${response.statusText}".`);
      } else {
        data = await response.arrayBuffer();
      }
    } else {
      try {
        data = await this.handler.sendWithPromise("FetchStandardFontData", {
          filename
        });
      } catch (e) {
        (0, _util.warn)(`fetchStandardFontData: failed to fetch file "${filename}" with "${e}".`);
      }
    }
    if (!data) {
      return null;
    }
    this.standardFontDataCache.set(name, data);
    return new _stream.Stream(data);
  }
  async buildFormXObject(resources, xobj, smask, operatorList, task, initialState, localColorSpaceCache) {
    const dict = xobj.dict;
    const matrix = dict.getArray("Matrix");
    let bbox = dict.getArray("BBox");
    if (Array.isArray(bbox) && bbox.length === 4) {
      bbox = _util.Util.normalizeRect(bbox);
    } else {
      bbox = null;
    }
    let optionalContent, groupOptions;
    if (dict.has("OC")) {
      optionalContent = await this.parseMarkedContentProps(dict.get("OC"), resources);
    }
    if (optionalContent !== undefined) {
      operatorList.addOp(_util.OPS.beginMarkedContentProps, ["OC", optionalContent]);
    }
    const group = dict.get("Group");
    if (group) {
      groupOptions = {
        matrix,
        bbox,
        smask,
        isolated: false,
        knockout: false
      };
      const groupSubtype = group.get("S");
      let colorSpace = null;
      if ((0, _primitives.isName)(groupSubtype, "Transparency")) {
        groupOptions.isolated = group.get("I") || false;
        groupOptions.knockout = group.get("K") || false;
        if (group.has("CS")) {
          const cs = group.getRaw("CS");
          const cachedColorSpace = _colorspace.ColorSpace.getCached(cs, this.xref, localColorSpaceCache);
          if (cachedColorSpace) {
            colorSpace = cachedColorSpace;
          } else {
            colorSpace = await this.parseColorSpace({
              cs,
              resources,
              localColorSpaceCache
            });
          }
        }
      }
      if (smask && smask.backdrop) {
        colorSpace = colorSpace || _colorspace.ColorSpace.singletons.rgb;
        smask.backdrop = colorSpace.getRgb(smask.backdrop, 0);
      }
      operatorList.addOp(_util.OPS.beginGroup, [groupOptions]);
    }
    const args = group ? [matrix, null] : [matrix, bbox];
    operatorList.addOp(_util.OPS.paintFormXObjectBegin, args);
    return this.getOperatorList({
      stream: xobj,
      task,
      resources: dict.get("Resources") || resources,
      operatorList,
      initialState
    }).then(function () {
      operatorList.addOp(_util.OPS.paintFormXObjectEnd, []);
      if (group) {
        operatorList.addOp(_util.OPS.endGroup, [groupOptions]);
      }
      if (optionalContent !== undefined) {
        operatorList.addOp(_util.OPS.endMarkedContent, []);
      }
    });
  }
  _sendImgData(objId, imgData, cacheGlobally = false) {
    const transfers = imgData ? [imgData.bitmap || imgData.data.buffer] : null;
    if (this.parsingType3Font || cacheGlobally) {
      return this.handler.send("commonobj", [objId, "Image", imgData], transfers);
    }
    return this.handler.send("obj", [objId, this.pageIndex, "Image", imgData], transfers);
  }
  async buildPaintImageXObject({
    resources,
    image,
    isInline = false,
    operatorList,
    cacheKey,
    localImageCache,
    localColorSpaceCache
  }) {
    const dict = image.dict;
    const imageRef = dict.objId;
    const w = dict.get("W", "Width");
    const h = dict.get("H", "Height");
    if (!(w && typeof w === "number") || !(h && typeof h === "number")) {
      (0, _util.warn)("Image dimensions are missing, or not numbers.");
      return;
    }
    const maxImageSize = this.options.maxImageSize;
    if (maxImageSize !== -1 && w * h > maxImageSize) {
      const msg = "Image exceeded maximum allowed size and was removed.";
      if (this.options.ignoreErrors) {
        (0, _util.warn)(msg);
        return;
      }
      throw new Error(msg);
    }
    let optionalContent;
    if (dict.has("OC")) {
      optionalContent = await this.parseMarkedContentProps(dict.get("OC"), resources);
    }
    const imageMask = dict.get("IM", "ImageMask") || false;
    let imgData, args;
    if (imageMask) {
      const interpolate = dict.get("I", "Interpolate");
      const bitStrideLength = w + 7 >> 3;
      const imgArray = image.getBytes(bitStrideLength * h);
      const decode = dict.getArray("D", "Decode");
      if (this.parsingType3Font) {
        imgData = _image.PDFImage.createRawMask({
          imgArray,
          width: w,
          height: h,
          imageIsFromDecodeStream: image instanceof _decode_stream.DecodeStream,
          inverseDecode: !!decode && decode[0] > 0,
          interpolate
        });
        imgData.cached = !!cacheKey;
        args = [imgData];
        operatorList.addImageOps(_util.OPS.paintImageMaskXObject, args, optionalContent);
        if (cacheKey) {
          localImageCache.set(cacheKey, imageRef, {
            fn: _util.OPS.paintImageMaskXObject,
            args,
            optionalContent
          });
        }
        return;
      }
      imgData = _image.PDFImage.createMask({
        imgArray,
        width: w,
        height: h,
        imageIsFromDecodeStream: image instanceof _decode_stream.DecodeStream,
        inverseDecode: !!decode && decode[0] > 0,
        interpolate,
        isOffscreenCanvasSupported: this.options.isOffscreenCanvasSupported
      });
      if (imgData.isSingleOpaquePixel) {
        operatorList.addImageOps(_util.OPS.paintSolidColorImageMask, [], optionalContent);
        if (cacheKey) {
          localImageCache.set(cacheKey, imageRef, {
            fn: _util.OPS.paintSolidColorImageMask,
            args: [],
            optionalContent
          });
        }
        return;
      }
      const objId = `mask_${this.idFactory.createObjId()}`;
      operatorList.addDependency(objId);
      this._sendImgData(objId, imgData);
      args = [{
        data: objId,
        width: imgData.width,
        height: imgData.height,
        interpolate: imgData.interpolate,
        count: 1
      }];
      operatorList.addImageOps(_util.OPS.paintImageMaskXObject, args, optionalContent);
      if (cacheKey) {
        localImageCache.set(cacheKey, imageRef, {
          fn: _util.OPS.paintImageMaskXObject,
          args,
          optionalContent
        });
      }
      return;
    }
    const softMask = dict.get("SM", "SMask") || false;
    const mask = dict.get("Mask") || false;
    const SMALL_IMAGE_DIMENSIONS = 200;
    if (isInline && !softMask && !mask && w + h < SMALL_IMAGE_DIMENSIONS) {
      const imageObj = new _image.PDFImage({
        xref: this.xref,
        res: resources,
        image,
        isInline,
        pdfFunctionFactory: this._pdfFunctionFactory,
        localColorSpaceCache
      });
      imgData = imageObj.createImageData(true);
      operatorList.addImageOps(_util.OPS.paintInlineImageXObject, [imgData], optionalContent);
      return;
    }
    let objId = `img_${this.idFactory.createObjId()}`,
      cacheGlobally = false;
    if (this.parsingType3Font) {
      objId = `${this.idFactory.getDocId()}_type3_${objId}`;
    } else if (imageRef) {
      cacheGlobally = this.globalImageCache.shouldCache(imageRef, this.pageIndex);
      if (cacheGlobally) {
        objId = `${this.idFactory.getDocId()}_${objId}`;
      }
    }
    operatorList.addDependency(objId);
    args = [objId, w, h];
    _image.PDFImage.buildImage({
      xref: this.xref,
      res: resources,
      image,
      isInline,
      pdfFunctionFactory: this._pdfFunctionFactory,
      localColorSpaceCache
    }).then(imageObj => {
      imgData = imageObj.createImageData(false);
      if (cacheKey && imageRef && cacheGlobally) {
        this.globalImageCache.addByteSize(imageRef, imgData.data.length);
      }
      return this._sendImgData(objId, imgData, cacheGlobally);
    }).catch(reason => {
      (0, _util.warn)(`Unable to decode image "${objId}": "${reason}".`);
      return this._sendImgData(objId, null, cacheGlobally);
    });
    operatorList.addImageOps(_util.OPS.paintImageXObject, args, optionalContent);
    if (cacheKey) {
      localImageCache.set(cacheKey, imageRef, {
        fn: _util.OPS.paintImageXObject,
        args,
        optionalContent
      });
      if (imageRef) {
        (0, _util.assert)(!isInline, "Cannot cache an inline image globally.");
        this.globalImageCache.addPageIndex(imageRef, this.pageIndex);
        if (cacheGlobally) {
          this.globalImageCache.setData(imageRef, {
            objId,
            fn: _util.OPS.paintImageXObject,
            args,
            optionalContent,
            byteSize: 0
          });
        }
      }
    }
  }
  handleSMask(smask, resources, operatorList, task, stateManager, localColorSpaceCache) {
    const smaskContent = smask.get("G");
    const smaskOptions = {
      subtype: smask.get("S").name,
      backdrop: smask.get("BC")
    };
    const transferObj = smask.get("TR");
    if ((0, _function.isPDFFunction)(transferObj)) {
      const transferFn = this._pdfFunctionFactory.create(transferObj);
      const transferMap = new Uint8Array(256);
      const tmp = new Float32Array(1);
      for (let i = 0; i < 256; i++) {
        tmp[0] = i / 255;
        transferFn(tmp, 0, tmp, 0);
        transferMap[i] = tmp[0] * 255 | 0;
      }
      smaskOptions.transferMap = transferMap;
    }
    return this.buildFormXObject(resources, smaskContent, smaskOptions, operatorList, task, stateManager.state.clone(), localColorSpaceCache);
  }
  handleTransferFunction(tr) {
    let transferArray;
    if (Array.isArray(tr)) {
      transferArray = tr;
    } else if ((0, _function.isPDFFunction)(tr)) {
      transferArray = [tr];
    } else {
      return null;
    }
    const transferMaps = [];
    let numFns = 0,
      numEffectfulFns = 0;
    for (const entry of transferArray) {
      const transferObj = this.xref.fetchIfRef(entry);
      numFns++;
      if ((0, _primitives.isName)(transferObj, "Identity")) {
        transferMaps.push(null);
        continue;
      } else if (!(0, _function.isPDFFunction)(transferObj)) {
        return null;
      }
      const transferFn = this._pdfFunctionFactory.create(transferObj);
      const transferMap = new Uint8Array(256),
        tmp = new Float32Array(1);
      for (let j = 0; j < 256; j++) {
        tmp[0] = j / 255;
        transferFn(tmp, 0, tmp, 0);
        transferMap[j] = tmp[0] * 255 | 0;
      }
      transferMaps.push(transferMap);
      numEffectfulFns++;
    }
    if (!(numFns === 1 || numFns === 4)) {
      return null;
    }
    if (numEffectfulFns === 0) {
      return null;
    }
    return transferMaps;
  }
  handleTilingType(fn, color, resources, pattern, patternDict, operatorList, task, localTilingPatternCache) {
    const tilingOpList = new _operator_list.OperatorList();
    const patternResources = _primitives.Dict.merge({
      xref: this.xref,
      dictArray: [patternDict.get("Resources"), resources]
    });
    return this.getOperatorList({
      stream: pattern,
      task,
      resources: patternResources,
      operatorList: tilingOpList
    }).then(function () {
      const operatorListIR = tilingOpList.getIR();
      const tilingPatternIR = (0, _pattern.getTilingPatternIR)(operatorListIR, patternDict, color);
      operatorList.addDependencies(tilingOpList.dependencies);
      operatorList.addOp(fn, tilingPatternIR);
      if (patternDict.objId) {
        localTilingPatternCache.set(null, patternDict.objId, {
          operatorListIR,
          dict: patternDict
        });
      }
    }).catch(reason => {
      if (reason instanceof _util.AbortException) {
        return;
      }
      if (this.options.ignoreErrors) {
        this.handler.send("UnsupportedFeature", {
          featureId: _util.UNSUPPORTED_FEATURES.errorTilingPattern
        });
        (0, _util.warn)(`handleTilingType - ignoring pattern: "${reason}".`);
        return;
      }
      throw reason;
    });
  }
  handleSetFont(resources, fontArgs, fontRef, operatorList, task, state, fallbackFontDict = null, cssFontInfo = null) {
    const fontName = fontArgs && fontArgs[0] instanceof _primitives.Name ? fontArgs[0].name : null;
    return this.loadFont(fontName, fontRef, resources, fallbackFontDict, cssFontInfo).then(translated => {
      if (!translated.font.isType3Font) {
        return translated;
      }
      return translated.loadType3Data(this, resources, task).then(function () {
        operatorList.addDependencies(translated.type3Dependencies);
        return translated;
      }).catch(reason => {
        this.handler.send("UnsupportedFeature", {
          featureId: _util.UNSUPPORTED_FEATURES.errorFontLoadType3
        });
        return new TranslatedFont({
          loadedName: "g_font_error",
          font: new _fonts.ErrorFont(`Type3 font load error: ${reason}`),
          dict: translated.font,
          evaluatorOptions: this.options
        });
      });
    }).then(translated => {
      state.font = translated.font;
      translated.send(this.handler);
      return translated.loadedName;
    });
  }
  handleText(chars, state) {
    const font = state.font;
    const glyphs = font.charsToGlyphs(chars);
    if (font.data) {
      const isAddToPathSet = !!(state.textRenderingMode & _util.TextRenderingMode.ADD_TO_PATH_FLAG);
      if (isAddToPathSet || state.fillColorSpace.name === "Pattern" || font.disableFontFace || this.options.disableFontFace) {
        PartialEvaluator.buildFontPaths(font, glyphs, this.handler, this.options);
      }
    }
    return glyphs;
  }
  ensureStateFont(state) {
    if (state.font) {
      return;
    }
    const reason = new _util.FormatError("Missing setFont (Tf) operator before text rendering operator.");
    if (this.options.ignoreErrors) {
      this.handler.send("UnsupportedFeature", {
        featureId: _util.UNSUPPORTED_FEATURES.errorFontState
      });
      (0, _util.warn)(`ensureStateFont: "${reason}".`);
      return;
    }
    throw reason;
  }
  async setGState({
    resources,
    gState,
    operatorList,
    cacheKey,
    task,
    stateManager,
    localGStateCache,
    localColorSpaceCache
  }) {
    const gStateRef = gState.objId;
    let isSimpleGState = true;
    const gStateObj = [];
    let promise = Promise.resolve();
    for (const key of gState.getKeys()) {
      const value = gState.get(key);
      switch (key) {
        case "Type":
          break;
        case "LW":
        case "LC":
        case "LJ":
        case "ML":
        case "D":
        case "RI":
        case "FL":
        case "CA":
        case "ca":
          gStateObj.push([key, value]);
          break;
        case "Font":
          isSimpleGState = false;
          promise = promise.then(() => {
            return this.handleSetFont(resources, null, value[0], operatorList, task, stateManager.state).then(function (loadedName) {
              operatorList.addDependency(loadedName);
              gStateObj.push([key, [loadedName, value[1]]]);
            });
          });
          break;
        case "BM":
          gStateObj.push([key, normalizeBlendMode(value)]);
          break;
        case "SMask":
          if ((0, _primitives.isName)(value, "None")) {
            gStateObj.push([key, false]);
            break;
          }
          if (value instanceof _primitives.Dict) {
            isSimpleGState = false;
            promise = promise.then(() => {
              return this.handleSMask(value, resources, operatorList, task, stateManager, localColorSpaceCache);
            });
            gStateObj.push([key, true]);
          } else {
            (0, _util.warn)("Unsupported SMask type");
          }
          break;
        case "TR":
          const transferMaps = this.handleTransferFunction(value);
          gStateObj.push([key, transferMaps]);
          break;
        case "OP":
        case "op":
        case "OPM":
        case "BG":
        case "BG2":
        case "UCR":
        case "UCR2":
        case "TR2":
        case "HT":
        case "SM":
        case "SA":
        case "AIS":
        case "TK":
          (0, _util.info)("graphic state operator " + key);
          break;
        default:
          (0, _util.info)("Unknown graphic state operator " + key);
          break;
      }
    }
    return promise.then(function () {
      if (gStateObj.length > 0) {
        operatorList.addOp(_util.OPS.setGState, [gStateObj]);
      }
      if (isSimpleGState) {
        localGStateCache.set(cacheKey, gStateRef, gStateObj);
      }
    });
  }
  loadFont(fontName, font, resources, fallbackFontDict = null, cssFontInfo = null) {
    const errorFont = async () => {
      return new TranslatedFont({
        loadedName: "g_font_error",
        font: new _fonts.ErrorFont(`Font "${fontName}" is not available.`),
        dict: font,
        evaluatorOptions: this.options
      });
    };
    const xref = this.xref;
    let fontRef;
    if (font) {
      if (font instanceof _primitives.Ref) {
        fontRef = font;
      }
    } else {
      const fontRes = resources.get("Font");
      if (fontRes) {
        fontRef = fontRes.getRaw(fontName);
      }
    }
    if (!fontRef) {
      const partialMsg = `Font "${fontName || font && font.toString()}" is not available`;
      if (!this.options.ignoreErrors && !this.parsingType3Font) {
        (0, _util.warn)(`${partialMsg}.`);
        return errorFont();
      }
      this.handler.send("UnsupportedFeature", {
        featureId: _util.UNSUPPORTED_FEATURES.errorFontMissing
      });
      (0, _util.warn)(`${partialMsg} -- attempting to fallback to a default font.`);
      if (fallbackFontDict) {
        fontRef = fallbackFontDict;
      } else {
        fontRef = PartialEvaluator.fallbackFontDict;
      }
    }
    if (this.parsingType3Font && this.type3FontRefs.has(fontRef)) {
      return errorFont();
    }
    if (this.fontCache.has(fontRef)) {
      return this.fontCache.get(fontRef);
    }
    font = xref.fetchIfRef(fontRef);
    if (!(font instanceof _primitives.Dict)) {
      return errorFont();
    }
    if (font.cacheKey && this.fontCache.has(font.cacheKey)) {
      return this.fontCache.get(font.cacheKey);
    }
    const fontCapability = (0, _util.createPromiseCapability)();
    let preEvaluatedFont;
    try {
      preEvaluatedFont = this.preEvaluateFont(font);
      preEvaluatedFont.cssFontInfo = cssFontInfo;
    } catch (reason) {
      (0, _util.warn)(`loadFont - preEvaluateFont failed: "${reason}".`);
      return errorFont();
    }
    const {
      descriptor,
      hash
    } = preEvaluatedFont;
    const fontRefIsRef = fontRef instanceof _primitives.Ref;
    let fontID;
    if (fontRefIsRef) {
      fontID = `f${fontRef.toString()}`;
    }
    if (hash && descriptor instanceof _primitives.Dict) {
      if (!descriptor.fontAliases) {
        descriptor.fontAliases = Object.create(null);
      }
      const fontAliases = descriptor.fontAliases;
      if (fontAliases[hash]) {
        const aliasFontRef = fontAliases[hash].aliasRef;
        if (fontRefIsRef && aliasFontRef && this.fontCache.has(aliasFontRef)) {
          this.fontCache.putAlias(fontRef, aliasFontRef);
          return this.fontCache.get(fontRef);
        }
      } else {
        fontAliases[hash] = {
          fontID: this.idFactory.createFontId()
        };
      }
      if (fontRefIsRef) {
        fontAliases[hash].aliasRef = fontRef;
      }
      fontID = fontAliases[hash].fontID;
    }
    if (fontRefIsRef) {
      this.fontCache.put(fontRef, fontCapability.promise);
    } else {
      if (!fontID) {
        fontID = this.idFactory.createFontId();
      }
      font.cacheKey = `cacheKey_${fontID}`;
      this.fontCache.put(font.cacheKey, fontCapability.promise);
    }
    (0, _util.assert)(fontID && fontID.startsWith("f"), 'The "fontID" must be (correctly) defined.');
    font.loadedName = `${this.idFactory.getDocId()}_${fontID}`;
    this.translateFont(preEvaluatedFont).then(translatedFont => {
      fontCapability.resolve(new TranslatedFont({
        loadedName: font.loadedName,
        font: translatedFont,
        dict: font,
        evaluatorOptions: this.options
      }));
    }).catch(reason => {
      this.handler.send("UnsupportedFeature", {
        featureId: _util.UNSUPPORTED_FEATURES.errorFontTranslate
      });
      (0, _util.warn)(`loadFont - translateFont failed: "${reason}".`);
      fontCapability.resolve(new TranslatedFont({
        loadedName: font.loadedName,
        font: new _fonts.ErrorFont(reason instanceof Error ? reason.message : reason),
        dict: font,
        evaluatorOptions: this.options
      }));
    });
    return fontCapability.promise;
  }
  buildPath(operatorList, fn, args, parsingText = false) {
    const lastIndex = operatorList.length - 1;
    if (!args) {
      args = [];
    }
    if (lastIndex < 0 || operatorList.fnArray[lastIndex] !== _util.OPS.constructPath) {
      if (parsingText) {
        (0, _util.warn)(`Encountered path operator "${fn}" inside of a text object.`);
        operatorList.addOp(_util.OPS.save, null);
      }
      let minMax;
      switch (fn) {
        case _util.OPS.rectangle:
          const x = args[0] + args[2];
          const y = args[1] + args[3];
          minMax = [Math.min(args[0], x), Math.max(args[0], x), Math.min(args[1], y), Math.max(args[1], y)];
          break;
        case _util.OPS.moveTo:
        case _util.OPS.lineTo:
          minMax = [args[0], args[0], args[1], args[1]];
          break;
        default:
          minMax = [Infinity, -Infinity, Infinity, -Infinity];
          break;
      }
      operatorList.addOp(_util.OPS.constructPath, [[fn], args, minMax]);
      if (parsingText) {
        operatorList.addOp(_util.OPS.restore, null);
      }
    } else {
      const opArgs = operatorList.argsArray[lastIndex];
      opArgs[0].push(fn);
      opArgs[1].push(...args);
      const minMax = opArgs[2];
      switch (fn) {
        case _util.OPS.rectangle:
          const x = args[0] + args[2];
          const y = args[1] + args[3];
          minMax[0] = Math.min(minMax[0], args[0], x);
          minMax[1] = Math.max(minMax[1], args[0], x);
          minMax[2] = Math.min(minMax[2], args[1], y);
          minMax[3] = Math.max(minMax[3], args[1], y);
          break;
        case _util.OPS.moveTo:
        case _util.OPS.lineTo:
          minMax[0] = Math.min(minMax[0], args[0]);
          minMax[1] = Math.max(minMax[1], args[0]);
          minMax[2] = Math.min(minMax[2], args[1]);
          minMax[3] = Math.max(minMax[3], args[1]);
          break;
      }
    }
  }
  parseColorSpace({
    cs,
    resources,
    localColorSpaceCache
  }) {
    return _colorspace.ColorSpace.parseAsync({
      cs,
      xref: this.xref,
      resources,
      pdfFunctionFactory: this._pdfFunctionFactory,
      localColorSpaceCache
    }).catch(reason => {
      if (reason instanceof _util.AbortException) {
        return null;
      }
      if (this.options.ignoreErrors) {
        this.handler.send("UnsupportedFeature", {
          featureId: _util.UNSUPPORTED_FEATURES.errorColorSpace
        });
        (0, _util.warn)(`parseColorSpace - ignoring ColorSpace: "${reason}".`);
        return null;
      }
      throw reason;
    });
  }
  parseShading({
    shading,
    resources,
    localColorSpaceCache,
    localShadingPatternCache
  }) {
    let id = localShadingPatternCache.get(shading);
    if (!id) {
      var shadingFill = _pattern.Pattern.parseShading(shading, this.xref, resources, this.handler, this._pdfFunctionFactory, localColorSpaceCache);
      const patternIR = shadingFill.getIR();
      id = `pattern_${this.idFactory.createObjId()}`;
      localShadingPatternCache.set(shading, id);
      this.handler.send("obj", [id, this.pageIndex, "Pattern", patternIR]);
    }
    return id;
  }
  handleColorN(operatorList, fn, args, cs, patterns, resources, task, localColorSpaceCache, localTilingPatternCache, localShadingPatternCache) {
    const patternName = args.pop();
    if (patternName instanceof _primitives.Name) {
      const rawPattern = patterns.getRaw(patternName.name);
      const localTilingPattern = rawPattern instanceof _primitives.Ref && localTilingPatternCache.getByRef(rawPattern);
      if (localTilingPattern) {
        try {
          const color = cs.base ? cs.base.getRgb(args, 0) : null;
          const tilingPatternIR = (0, _pattern.getTilingPatternIR)(localTilingPattern.operatorListIR, localTilingPattern.dict, color);
          operatorList.addOp(fn, tilingPatternIR);
          return undefined;
        } catch (ex) {}
      }
      const pattern = this.xref.fetchIfRef(rawPattern);
      if (pattern) {
        const dict = pattern instanceof _base_stream.BaseStream ? pattern.dict : pattern;
        const typeNum = dict.get("PatternType");
        if (typeNum === PatternType.TILING) {
          const color = cs.base ? cs.base.getRgb(args, 0) : null;
          return this.handleTilingType(fn, color, resources, pattern, dict, operatorList, task, localTilingPatternCache);
        } else if (typeNum === PatternType.SHADING) {
          const shading = dict.get("Shading");
          const matrix = dict.getArray("Matrix");
          const objId = this.parseShading({
            shading,
            resources,
            localColorSpaceCache,
            localShadingPatternCache
          });
          operatorList.addOp(fn, ["Shading", objId, matrix]);
          return undefined;
        }
        throw new _util.FormatError(`Unknown PatternType: ${typeNum}`);
      }
    }
    throw new _util.FormatError(`Unknown PatternName: ${patternName}`);
  }
  _parseVisibilityExpression(array, nestingCounter, currentResult) {
    const MAX_NESTING = 10;
    if (++nestingCounter > MAX_NESTING) {
      (0, _util.warn)("Visibility expression is too deeply nested");
      return;
    }
    const length = array.length;
    const operator = this.xref.fetchIfRef(array[0]);
    if (length < 2 || !(operator instanceof _primitives.Name)) {
      (0, _util.warn)("Invalid visibility expression");
      return;
    }
    switch (operator.name) {
      case "And":
      case "Or":
      case "Not":
        currentResult.push(operator.name);
        break;
      default:
        (0, _util.warn)(`Invalid operator ${operator.name} in visibility expression`);
        return;
    }
    for (let i = 1; i < length; i++) {
      const raw = array[i];
      const object = this.xref.fetchIfRef(raw);
      if (Array.isArray(object)) {
        const nestedResult = [];
        currentResult.push(nestedResult);
        this._parseVisibilityExpression(object, nestingCounter, nestedResult);
      } else if (raw instanceof _primitives.Ref) {
        currentResult.push(raw.toString());
      }
    }
  }
  async parseMarkedContentProps(contentProperties, resources) {
    let optionalContent;
    if (contentProperties instanceof _primitives.Name) {
      const properties = resources.get("Properties");
      optionalContent = properties.get(contentProperties.name);
    } else if (contentProperties instanceof _primitives.Dict) {
      optionalContent = contentProperties;
    } else {
      throw new _util.FormatError("Optional content properties malformed.");
    }
    const optionalContentType = optionalContent.get("Type").name;
    if (optionalContentType === "OCG") {
      return {
        type: optionalContentType,
        id: optionalContent.objId
      };
    } else if (optionalContentType === "OCMD") {
      const expression = optionalContent.get("VE");
      if (Array.isArray(expression)) {
        const result = [];
        this._parseVisibilityExpression(expression, 0, result);
        if (result.length > 0) {
          return {
            type: "OCMD",
            expression: result
          };
        }
      }
      const optionalContentGroups = optionalContent.get("OCGs");
      if (Array.isArray(optionalContentGroups) || optionalContentGroups instanceof _primitives.Dict) {
        const groupIds = [];
        if (Array.isArray(optionalContentGroups)) {
          for (const ocg of optionalContentGroups) {
            groupIds.push(ocg.toString());
          }
        } else {
          groupIds.push(optionalContentGroups.objId);
        }
        return {
          type: optionalContentType,
          ids: groupIds,
          policy: optionalContent.get("P") instanceof _primitives.Name ? optionalContent.get("P").name : null,
          expression: null
        };
      } else if (optionalContentGroups instanceof _primitives.Ref) {
        return {
          type: optionalContentType,
          id: optionalContentGroups.toString()
        };
      }
    }
    return null;
  }
  getOperatorList({
    stream,
    task,
    resources,
    operatorList,
    initialState = null,
    fallbackFontDict = null
  }) {
    resources = resources || _primitives.Dict.empty;
    initialState = initialState || new EvalState();
    if (!operatorList) {
      throw new Error('getOperatorList: missing "operatorList" parameter');
    }
    const self = this;
    const xref = this.xref;
    let parsingText = false;
    const localImageCache = new _image_utils.LocalImageCache();
    const localColorSpaceCache = new _image_utils.LocalColorSpaceCache();
    const localGStateCache = new _image_utils.LocalGStateCache();
    const localTilingPatternCache = new _image_utils.LocalTilingPatternCache();
    const localShadingPatternCache = new Map();
    const xobjs = resources.get("XObject") || _primitives.Dict.empty;
    const patterns = resources.get("Pattern") || _primitives.Dict.empty;
    const stateManager = new StateManager(initialState);
    const preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager);
    const timeSlotManager = new TimeSlotManager();
    function closePendingRestoreOPS(argument) {
      for (let i = 0, ii = preprocessor.savedStatesDepth; i < ii; i++) {
        operatorList.addOp(_util.OPS.restore, []);
      }
    }
    return new Promise(function promiseBody(resolve, reject) {
      const next = function (promise) {
        Promise.all([promise, operatorList.ready]).then(function () {
          try {
            promiseBody(resolve, reject);
          } catch (ex) {
            reject(ex);
          }
        }, reject);
      };
      task.ensureNotTerminated();
      timeSlotManager.reset();
      const operation = {};
      let stop, i, ii, cs, name, isValidName;
      while (!(stop = timeSlotManager.check())) {
        operation.args = null;
        if (!preprocessor.read(operation)) {
          break;
        }
        let args = operation.args;
        let fn = operation.fn;
        switch (fn | 0) {
          case _util.OPS.paintXObject:
            isValidName = args[0] instanceof _primitives.Name;
            name = args[0].name;
            if (isValidName) {
              const localImage = localImageCache.getByName(name);
              if (localImage) {
                operatorList.addImageOps(localImage.fn, localImage.args, localImage.optionalContent);
                incrementCachedImageMaskCount(localImage);
                args = null;
                continue;
              }
            }
            next(new Promise(function (resolveXObject, rejectXObject) {
              if (!isValidName) {
                throw new _util.FormatError("XObject must be referred to by name.");
              }
              let xobj = xobjs.getRaw(name);
              if (xobj instanceof _primitives.Ref) {
                const localImage = localImageCache.getByRef(xobj);
                if (localImage) {
                  operatorList.addImageOps(localImage.fn, localImage.args, localImage.optionalContent);
                  incrementCachedImageMaskCount(localImage);
                  resolveXObject();
                  return;
                }
                const globalImage = self.globalImageCache.getData(xobj, self.pageIndex);
                if (globalImage) {
                  operatorList.addDependency(globalImage.objId);
                  operatorList.addImageOps(globalImage.fn, globalImage.args, globalImage.optionalContent);
                  resolveXObject();
                  return;
                }
                xobj = xref.fetch(xobj);
              }
              if (!(xobj instanceof _base_stream.BaseStream)) {
                throw new _util.FormatError("XObject should be a stream");
              }
              const type = xobj.dict.get("Subtype");
              if (!(type instanceof _primitives.Name)) {
                throw new _util.FormatError("XObject should have a Name subtype");
              }
              if (type.name === "Form") {
                stateManager.save();
                self.buildFormXObject(resources, xobj, null, operatorList, task, stateManager.state.clone(), localColorSpaceCache).then(function () {
                  stateManager.restore();
                  resolveXObject();
                }, rejectXObject);
                return;
              } else if (type.name === "Image") {
                self.buildPaintImageXObject({
                  resources,
                  image: xobj,
                  operatorList,
                  cacheKey: name,
                  localImageCache,
                  localColorSpaceCache
                }).then(resolveXObject, rejectXObject);
                return;
              } else if (type.name === "PS") {
                (0, _util.info)("Ignored XObject subtype PS");
              } else {
                throw new _util.FormatError(`Unhandled XObject subtype ${type.name}`);
              }
              resolveXObject();
            }).catch(function (reason) {
              if (reason instanceof _util.AbortException) {
                return;
              }
              if (self.options.ignoreErrors) {
                self.handler.send("UnsupportedFeature", {
                  featureId: _util.UNSUPPORTED_FEATURES.errorXObject
                });
                (0, _util.warn)(`getOperatorList - ignoring XObject: "${reason}".`);
                return;
              }
              throw reason;
            }));
            return;
          case _util.OPS.setFont:
            var fontSize = args[1];
            next(self.handleSetFont(resources, args, null, operatorList, task, stateManager.state, fallbackFontDict).then(function (loadedName) {
              operatorList.addDependency(loadedName);
              operatorList.addOp(_util.OPS.setFont, [loadedName, fontSize]);
            }));
            return;
          case _util.OPS.beginText:
            parsingText = true;
            break;
          case _util.OPS.endText:
            parsingText = false;
            break;
          case _util.OPS.endInlineImage:
            var cacheKey = args[0].cacheKey;
            if (cacheKey) {
              const localImage = localImageCache.getByName(cacheKey);
              if (localImage) {
                operatorList.addImageOps(localImage.fn, localImage.args, localImage.optionalContent);
                incrementCachedImageMaskCount(localImage);
                args = null;
                continue;
              }
            }
            next(self.buildPaintImageXObject({
              resources,
              image: args[0],
              isInline: true,
              operatorList,
              cacheKey,
              localImageCache,
              localColorSpaceCache
            }));
            return;
          case _util.OPS.showText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            args[0] = self.handleText(args[0], stateManager.state);
            break;
          case _util.OPS.showSpacedText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            var combinedGlyphs = [];
            var state = stateManager.state;
            for (const arrItem of args[0]) {
              if (typeof arrItem === "string") {
                combinedGlyphs.push(...self.handleText(arrItem, state));
              } else if (typeof arrItem === "number") {
                combinedGlyphs.push(arrItem);
              }
            }
            args[0] = combinedGlyphs;
            fn = _util.OPS.showText;
            break;
          case _util.OPS.nextLineShowText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            operatorList.addOp(_util.OPS.nextLine);
            args[0] = self.handleText(args[0], stateManager.state);
            fn = _util.OPS.showText;
            break;
          case _util.OPS.nextLineSetSpacingShowText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            operatorList.addOp(_util.OPS.nextLine);
            operatorList.addOp(_util.OPS.setWordSpacing, [args.shift()]);
            operatorList.addOp(_util.OPS.setCharSpacing, [args.shift()]);
            args[0] = self.handleText(args[0], stateManager.state);
            fn = _util.OPS.showText;
            break;
          case _util.OPS.setTextRenderingMode:
            stateManager.state.textRenderingMode = args[0];
            break;
          case _util.OPS.setFillColorSpace:
            {
              const cachedColorSpace = _colorspace.ColorSpace.getCached(args[0], xref, localColorSpaceCache);
              if (cachedColorSpace) {
                stateManager.state.fillColorSpace = cachedColorSpace;
                continue;
              }
              next(self.parseColorSpace({
                cs: args[0],
                resources,
                localColorSpaceCache
              }).then(function (colorSpace) {
                if (colorSpace) {
                  stateManager.state.fillColorSpace = colorSpace;
                }
              }));
              return;
            }
          case _util.OPS.setStrokeColorSpace:
            {
              const cachedColorSpace = _colorspace.ColorSpace.getCached(args[0], xref, localColorSpaceCache);
              if (cachedColorSpace) {
                stateManager.state.strokeColorSpace = cachedColorSpace;
                continue;
              }
              next(self.parseColorSpace({
                cs: args[0],
                resources,
                localColorSpaceCache
              }).then(function (colorSpace) {
                if (colorSpace) {
                  stateManager.state.strokeColorSpace = colorSpace;
                }
              }));
              return;
            }
          case _util.OPS.setFillColor:
            cs = stateManager.state.fillColorSpace;
            args = cs.getRgb(args, 0);
            fn = _util.OPS.setFillRGBColor;
            break;
          case _util.OPS.setStrokeColor:
            cs = stateManager.state.strokeColorSpace;
            args = cs.getRgb(args, 0);
            fn = _util.OPS.setStrokeRGBColor;
            break;
          case _util.OPS.setFillGray:
            stateManager.state.fillColorSpace = _colorspace.ColorSpace.singletons.gray;
            args = _colorspace.ColorSpace.singletons.gray.getRgb(args, 0);
            fn = _util.OPS.setFillRGBColor;
            break;
          case _util.OPS.setStrokeGray:
            stateManager.state.strokeColorSpace = _colorspace.ColorSpace.singletons.gray;
            args = _colorspace.ColorSpace.singletons.gray.getRgb(args, 0);
            fn = _util.OPS.setStrokeRGBColor;
            break;
          case _util.OPS.setFillCMYKColor:
            stateManager.state.fillColorSpace = _colorspace.ColorSpace.singletons.cmyk;
            args = _colorspace.ColorSpace.singletons.cmyk.getRgb(args, 0);
            fn = _util.OPS.setFillRGBColor;
            break;
          case _util.OPS.setStrokeCMYKColor:
            stateManager.state.strokeColorSpace = _colorspace.ColorSpace.singletons.cmyk;
            args = _colorspace.ColorSpace.singletons.cmyk.getRgb(args, 0);
            fn = _util.OPS.setStrokeRGBColor;
            break;
          case _util.OPS.setFillRGBColor:
            stateManager.state.fillColorSpace = _colorspace.ColorSpace.singletons.rgb;
            args = _colorspace.ColorSpace.singletons.rgb.getRgb(args, 0);
            break;
          case _util.OPS.setStrokeRGBColor:
            stateManager.state.strokeColorSpace = _colorspace.ColorSpace.singletons.rgb;
            args = _colorspace.ColorSpace.singletons.rgb.getRgb(args, 0);
            break;
          case _util.OPS.setFillColorN:
            cs = stateManager.state.fillColorSpace;
            if (cs.name === "Pattern") {
              next(self.handleColorN(operatorList, _util.OPS.setFillColorN, args, cs, patterns, resources, task, localColorSpaceCache, localTilingPatternCache, localShadingPatternCache));
              return;
            }
            args = cs.getRgb(args, 0);
            fn = _util.OPS.setFillRGBColor;
            break;
          case _util.OPS.setStrokeColorN:
            cs = stateManager.state.strokeColorSpace;
            if (cs.name === "Pattern") {
              next(self.handleColorN(operatorList, _util.OPS.setStrokeColorN, args, cs, patterns, resources, task, localColorSpaceCache, localTilingPatternCache, localShadingPatternCache));
              return;
            }
            args = cs.getRgb(args, 0);
            fn = _util.OPS.setStrokeRGBColor;
            break;
          case _util.OPS.shadingFill:
            var shadingRes = resources.get("Shading");
            if (!shadingRes) {
              throw new _util.FormatError("No shading resource found");
            }
            var shading = shadingRes.get(args[0].name);
            if (!shading) {
              throw new _util.FormatError("No shading object found");
            }
            const patternId = self.parseShading({
              shading,
              resources,
              localColorSpaceCache,
              localShadingPatternCache
            });
            args = [patternId];
            fn = _util.OPS.shadingFill;
            break;
          case _util.OPS.setGState:
            isValidName = args[0] instanceof _primitives.Name;
            name = args[0].name;
            if (isValidName) {
              const localGStateObj = localGStateCache.getByName(name);
              if (localGStateObj) {
                if (localGStateObj.length > 0) {
                  operatorList.addOp(_util.OPS.setGState, [localGStateObj]);
                }
                args = null;
                continue;
              }
            }
            next(new Promise(function (resolveGState, rejectGState) {
              if (!isValidName) {
                throw new _util.FormatError("GState must be referred to by name.");
              }
              const extGState = resources.get("ExtGState");
              if (!(extGState instanceof _primitives.Dict)) {
                throw new _util.FormatError("ExtGState should be a dictionary.");
              }
              const gState = extGState.get(name);
              if (!(gState instanceof _primitives.Dict)) {
                throw new _util.FormatError("GState should be a dictionary.");
              }
              self.setGState({
                resources,
                gState,
                operatorList,
                cacheKey: name,
                task,
                stateManager,
                localGStateCache,
                localColorSpaceCache
              }).then(resolveGState, rejectGState);
            }).catch(function (reason) {
              if (reason instanceof _util.AbortException) {
                return;
              }
              if (self.options.ignoreErrors) {
                self.handler.send("UnsupportedFeature", {
                  featureId: _util.UNSUPPORTED_FEATURES.errorExtGState
                });
                (0, _util.warn)(`getOperatorList - ignoring ExtGState: "${reason}".`);
                return;
              }
              throw reason;
            }));
            return;
          case _util.OPS.moveTo:
          case _util.OPS.lineTo:
          case _util.OPS.curveTo:
          case _util.OPS.curveTo2:
          case _util.OPS.curveTo3:
          case _util.OPS.closePath:
          case _util.OPS.rectangle:
            self.buildPath(operatorList, fn, args, parsingText);
            continue;
          case _util.OPS.markPoint:
          case _util.OPS.markPointProps:
          case _util.OPS.beginCompat:
          case _util.OPS.endCompat:
            continue;
          case _util.OPS.beginMarkedContentProps:
            if (!(args[0] instanceof _primitives.Name)) {
              (0, _util.warn)(`Expected name for beginMarkedContentProps arg0=${args[0]}`);
              continue;
            }
            if (args[0].name === "OC") {
              next(self.parseMarkedContentProps(args[1], resources).then(data => {
                operatorList.addOp(_util.OPS.beginMarkedContentProps, ["OC", data]);
              }).catch(reason => {
                if (reason instanceof _util.AbortException) {
                  return;
                }
                if (self.options.ignoreErrors) {
                  self.handler.send("UnsupportedFeature", {
                    featureId: _util.UNSUPPORTED_FEATURES.errorMarkedContent
                  });
                  (0, _util.warn)(`getOperatorList - ignoring beginMarkedContentProps: "${reason}".`);
                  return;
                }
                throw reason;
              }));
              return;
            }
            args = [args[0].name, args[1] instanceof _primitives.Dict ? args[1].get("MCID") : null];
            break;
          case _util.OPS.beginMarkedContent:
          case _util.OPS.endMarkedContent:
          default:
            if (args !== null) {
              for (i = 0, ii = args.length; i < ii; i++) {
                if (args[i] instanceof _primitives.Dict) {
                  break;
                }
              }
              if (i < ii) {
                (0, _util.warn)("getOperatorList - ignoring operator: " + fn);
                continue;
              }
            }
        }
        operatorList.addOp(fn, args);
      }
      if (stop) {
        next(deferred);
        return;
      }
      closePendingRestoreOPS();
      resolve();
    }).catch(reason => {
      if (reason instanceof _util.AbortException) {
        return;
      }
      if (this.options.ignoreErrors) {
        this.handler.send("UnsupportedFeature", {
          featureId: _util.UNSUPPORTED_FEATURES.errorOperatorList
        });
        (0, _util.warn)(`getOperatorList - ignoring errors during "${task.name}" ` + `task: "${reason}".`);
        closePendingRestoreOPS();
        return;
      }
      throw reason;
    });
  }
  getTextContent({
    stream,
    task,
    resources,
    stateManager = null,
    combineTextItems = false,
    includeMarkedContent = false,
    sink,
    seenStyles = new Set(),
    viewBox,
    markedContentData = null
  }) {
    resources = resources || _primitives.Dict.empty;
    stateManager = stateManager || new StateManager(new TextState());
    if (includeMarkedContent) {
      markedContentData = markedContentData || {
        level: 0
      };
    }
    const textContent = {
      items: [],
      styles: Object.create(null)
    };
    const textContentItem = {
      initialized: false,
      str: [],
      totalWidth: 0,
      totalHeight: 0,
      width: 0,
      height: 0,
      vertical: false,
      prevTransform: null,
      textAdvanceScale: 0,
      spaceInFlowMin: 0,
      spaceInFlowMax: 0,
      trackingSpaceMin: Infinity,
      negativeSpaceMax: -Infinity,
      notASpace: -Infinity,
      transform: null,
      fontName: null,
      hasEOL: false
    };
    const twoLastChars = [" ", " "];
    let twoLastCharsPos = 0;
    function saveLastChar(char) {
      const nextPos = (twoLastCharsPos + 1) % 2;
      const ret = twoLastChars[twoLastCharsPos] !== " " && twoLastChars[nextPos] === " ";
      twoLastChars[twoLastCharsPos] = char;
      twoLastCharsPos = nextPos;
      return ret;
    }
    function resetLastChars() {
      twoLastChars[0] = twoLastChars[1] = " ";
      twoLastCharsPos = 0;
    }
    const TRACKING_SPACE_FACTOR = 0.1;
    const NOT_A_SPACE_FACTOR = 0.03;
    const NEGATIVE_SPACE_FACTOR = -0.2;
    const SPACE_IN_FLOW_MIN_FACTOR = 0.1;
    const SPACE_IN_FLOW_MAX_FACTOR = 0.6;
    const self = this;
    const xref = this.xref;
    const showSpacedTextBuffer = [];
    let xobjs = null;
    const emptyXObjectCache = new _image_utils.LocalImageCache();
    const emptyGStateCache = new _image_utils.LocalGStateCache();
    const preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager);
    let textState;
    function getCurrentTextTransform() {
      const font = textState.font;
      const tsm = [textState.fontSize * textState.textHScale, 0, 0, textState.fontSize, 0, textState.textRise];
      if (font.isType3Font && (textState.fontSize <= 1 || font.isCharBBox) && !(0, _util.isArrayEqual)(textState.fontMatrix, _util.FONT_IDENTITY_MATRIX)) {
        const glyphHeight = font.bbox[3] - font.bbox[1];
        if (glyphHeight > 0) {
          tsm[3] *= glyphHeight * textState.fontMatrix[3];
        }
      }
      return _util.Util.transform(textState.ctm, _util.Util.transform(textState.textMatrix, tsm));
    }
    function ensureTextContentItem() {
      if (textContentItem.initialized) {
        return textContentItem;
      }
      const {
        font,
        loadedName
      } = textState;
      if (!seenStyles.has(loadedName)) {
        seenStyles.add(loadedName);
        textContent.styles[loadedName] = {
          fontFamily: font.fallbackName,
          ascent: font.ascent,
          descent: font.descent,
          vertical: font.vertical
        };
      }
      textContentItem.fontName = loadedName;
      const trm = textContentItem.transform = getCurrentTextTransform();
      if (!font.vertical) {
        textContentItem.width = textContentItem.totalWidth = 0;
        textContentItem.height = textContentItem.totalHeight = Math.hypot(trm[2], trm[3]);
        textContentItem.vertical = false;
      } else {
        textContentItem.width = textContentItem.totalWidth = Math.hypot(trm[0], trm[1]);
        textContentItem.height = textContentItem.totalHeight = 0;
        textContentItem.vertical = true;
      }
      const scaleLineX = Math.hypot(textState.textLineMatrix[0], textState.textLineMatrix[1]);
      const scaleCtmX = Math.hypot(textState.ctm[0], textState.ctm[1]);
      textContentItem.textAdvanceScale = scaleCtmX * scaleLineX;
      textContentItem.trackingSpaceMin = textState.fontSize * TRACKING_SPACE_FACTOR;
      textContentItem.notASpace = textState.fontSize * NOT_A_SPACE_FACTOR;
      textContentItem.negativeSpaceMax = textState.fontSize * NEGATIVE_SPACE_FACTOR;
      textContentItem.spaceInFlowMin = textState.fontSize * SPACE_IN_FLOW_MIN_FACTOR;
      textContentItem.spaceInFlowMax = textState.fontSize * SPACE_IN_FLOW_MAX_FACTOR;
      textContentItem.hasEOL = false;
      textContentItem.initialized = true;
      return textContentItem;
    }
    function updateAdvanceScale() {
      if (!textContentItem.initialized) {
        return;
      }
      const scaleLineX = Math.hypot(textState.textLineMatrix[0], textState.textLineMatrix[1]);
      const scaleCtmX = Math.hypot(textState.ctm[0], textState.ctm[1]);
      const scaleFactor = scaleCtmX * scaleLineX;
      if (scaleFactor === textContentItem.textAdvanceScale) {
        return;
      }
      if (!textContentItem.vertical) {
        textContentItem.totalWidth += textContentItem.width * textContentItem.textAdvanceScale;
        textContentItem.width = 0;
      } else {
        textContentItem.totalHeight += textContentItem.height * textContentItem.textAdvanceScale;
        textContentItem.height = 0;
      }
      textContentItem.textAdvanceScale = scaleFactor;
    }
    function runBidiTransform(textChunk) {
      const text = textChunk.str.join("");
      const bidiResult = (0, _bidi.bidi)(text, -1, textChunk.vertical);
      return {
        str: bidiResult.str,
        dir: bidiResult.dir,
        width: Math.abs(textChunk.totalWidth),
        height: Math.abs(textChunk.totalHeight),
        transform: textChunk.transform,
        fontName: textChunk.fontName,
        hasEOL: textChunk.hasEOL
      };
    }
    function handleSetFont(fontName, fontRef) {
      return self.loadFont(fontName, fontRef, resources).then(function (translated) {
        if (!translated.font.isType3Font) {
          return translated;
        }
        return translated.loadType3Data(self, resources, task).catch(function () {}).then(function () {
          return translated;
        });
      }).then(function (translated) {
        textState.loadedName = translated.loadedName;
        textState.font = translated.font;
        textState.fontMatrix = translated.font.fontMatrix || _util.FONT_IDENTITY_MATRIX;
      });
    }
    function applyInverseRotation(x, y, matrix) {
      const scale = Math.hypot(matrix[0], matrix[1]);
      return [(matrix[0] * x + matrix[1] * y) / scale, (matrix[2] * x + matrix[3] * y) / scale];
    }
    function compareWithLastPosition() {
      const currentTransform = getCurrentTextTransform();
      let posX = currentTransform[4];
      let posY = currentTransform[5];
      const shiftedX = posX - viewBox[0];
      const shiftedY = posY - viewBox[1];
      if (shiftedX < 0 || shiftedX > viewBox[2] || shiftedY < 0 || shiftedY > viewBox[3]) {
        return false;
      }
      if (!combineTextItems || !textState.font || !textContentItem.prevTransform) {
        return true;
      }
      let lastPosX = textContentItem.prevTransform[4];
      let lastPosY = textContentItem.prevTransform[5];
      if (lastPosX === posX && lastPosY === posY) {
        return true;
      }
      let rotate = -1;
      if (currentTransform[0] && currentTransform[1] === 0 && currentTransform[2] === 0) {
        rotate = currentTransform[0] > 0 ? 0 : 180;
      } else if (currentTransform[1] && currentTransform[0] === 0 && currentTransform[3] === 0) {
        rotate = currentTransform[1] > 0 ? 90 : 270;
      }
      switch (rotate) {
        case 0:
          break;
        case 90:
          [posX, posY] = [posY, posX];
          [lastPosX, lastPosY] = [lastPosY, lastPosX];
          break;
        case 180:
          [posX, posY, lastPosX, lastPosY] = [-posX, -posY, -lastPosX, -lastPosY];
          break;
        case 270:
          [posX, posY] = [-posY, -posX];
          [lastPosX, lastPosY] = [-lastPosY, -lastPosX];
          break;
        default:
          [posX, posY] = applyInverseRotation(posX, posY, currentTransform);
          [lastPosX, lastPosY] = applyInverseRotation(lastPosX, lastPosY, textContentItem.prevTransform);
      }
      if (textState.font.vertical) {
        const advanceY = (lastPosY - posY) / textContentItem.textAdvanceScale;
        const advanceX = posX - lastPosX;
        const textOrientation = Math.sign(textContentItem.height);
        if (advanceY < textOrientation * textContentItem.negativeSpaceMax) {
          if (Math.abs(advanceX) > 0.5 * textContentItem.width) {
            appendEOL();
            return true;
          }
          resetLastChars();
          flushTextContentItem();
          return true;
        }
        if (Math.abs(advanceX) > textContentItem.width) {
          appendEOL();
          return true;
        }
        if (advanceY <= textOrientation * textContentItem.notASpace) {
          resetLastChars();
        }
        if (advanceY <= textOrientation * textContentItem.trackingSpaceMin) {
          textContentItem.height += advanceY;
        } else if (!addFakeSpaces(advanceY, textContentItem.prevTransform, textOrientation)) {
          if (textContentItem.str.length === 0) {
            resetLastChars();
            textContent.items.push({
              str: " ",
              dir: "ltr",
              width: 0,
              height: Math.abs(advanceY),
              transform: textContentItem.prevTransform,
              fontName: textContentItem.fontName,
              hasEOL: false
            });
          } else {
            textContentItem.height += advanceY;
          }
        }
        return true;
      }
      const advanceX = (posX - lastPosX) / textContentItem.textAdvanceScale;
      const advanceY = posY - lastPosY;
      const textOrientation = Math.sign(textContentItem.width);
      if (advanceX < textOrientation * textContentItem.negativeSpaceMax) {
        if (Math.abs(advanceY) > 0.5 * textContentItem.height) {
          appendEOL();
          return true;
        }
        resetLastChars();
        flushTextContentItem();
        return true;
      }
      if (Math.abs(advanceY) > textContentItem.height) {
        appendEOL();
        return true;
      }
      if (advanceX <= textOrientation * textContentItem.notASpace) {
        resetLastChars();
      }
      if (advanceX <= textOrientation * textContentItem.trackingSpaceMin) {
        textContentItem.width += advanceX;
      } else if (!addFakeSpaces(advanceX, textContentItem.prevTransform, textOrientation)) {
        if (textContentItem.str.length === 0) {
          resetLastChars();
          textContent.items.push({
            str: " ",
            dir: "ltr",
            width: Math.abs(advanceX),
            height: 0,
            transform: textContentItem.prevTransform,
            fontName: textContentItem.fontName,
            hasEOL: false
          });
        } else {
          textContentItem.width += advanceX;
        }
      }
      return true;
    }
    function buildTextContentItem({
      chars,
      extraSpacing
    }) {
      const font = textState.font;
      if (!chars) {
        const charSpacing = textState.charSpacing + extraSpacing;
        if (charSpacing) {
          if (!font.vertical) {
            textState.translateTextMatrix(charSpacing * textState.textHScale, 0);
          } else {
            textState.translateTextMatrix(0, -charSpacing);
          }
        }
        return;
      }
      const glyphs = font.charsToGlyphs(chars);
      const scale = textState.fontMatrix[0] * textState.fontSize;
      for (let i = 0, ii = glyphs.length; i < ii; i++) {
        const glyph = glyphs[i];
        const {
          category
        } = glyph;
        if (category.isInvisibleFormatMark) {
          continue;
        }
        let charSpacing = textState.charSpacing + (i + 1 === ii ? extraSpacing : 0);
        let glyphWidth = glyph.width;
        if (font.vertical) {
          glyphWidth = glyph.vmetric ? glyph.vmetric[0] : -glyphWidth;
        }
        let scaledDim = glyphWidth * scale;
        if (category.isWhitespace) {
          if (!font.vertical) {
            charSpacing += scaledDim + textState.wordSpacing;
            textState.translateTextMatrix(charSpacing * textState.textHScale, 0);
          } else {
            charSpacing += -scaledDim + textState.wordSpacing;
            textState.translateTextMatrix(0, -charSpacing);
          }
          saveLastChar(" ");
          continue;
        }
        if (!category.isZeroWidthDiacritic && !compareWithLastPosition()) {
          continue;
        }
        const textChunk = ensureTextContentItem();
        if (category.isZeroWidthDiacritic) {
          scaledDim = 0;
        }
        if (!font.vertical) {
          scaledDim *= textState.textHScale;
          textState.translateTextMatrix(scaledDim, 0);
          textChunk.width += scaledDim;
        } else {
          textState.translateTextMatrix(0, scaledDim);
          scaledDim = Math.abs(scaledDim);
          textChunk.height += scaledDim;
        }
        if (scaledDim) {
          textChunk.prevTransform = getCurrentTextTransform();
        }
        const glyphUnicode = glyph.normalizedUnicode;
        if (saveLastChar(glyphUnicode)) {
          textChunk.str.push(" ");
        }
        textChunk.str.push(glyphUnicode);
        if (charSpacing) {
          if (!font.vertical) {
            textState.translateTextMatrix(charSpacing * textState.textHScale, 0);
          } else {
            textState.translateTextMatrix(0, -charSpacing);
          }
        }
      }
    }
    function appendEOL() {
      resetLastChars();
      if (textContentItem.initialized) {
        textContentItem.hasEOL = true;
        flushTextContentItem();
      } else {
        textContent.items.push({
          str: "",
          dir: "ltr",
          width: 0,
          height: 0,
          transform: getCurrentTextTransform(),
          fontName: textState.loadedName,
          hasEOL: true
        });
      }
    }
    function addFakeSpaces(width, transf, textOrientation) {
      if (textOrientation * textContentItem.spaceInFlowMin <= width && width <= textOrientation * textContentItem.spaceInFlowMax) {
        if (textContentItem.initialized) {
          resetLastChars();
          textContentItem.str.push(" ");
        }
        return false;
      }
      const fontName = textContentItem.fontName;
      let height = 0;
      if (textContentItem.vertical) {
        height = width;
        width = 0;
      }
      flushTextContentItem();
      resetLastChars();
      textContent.items.push({
        str: " ",
        dir: "ltr",
        width: Math.abs(width),
        height: Math.abs(height),
        transform: transf || getCurrentTextTransform(),
        fontName,
        hasEOL: false
      });
      return true;
    }
    function flushTextContentItem() {
      if (!textContentItem.initialized || !textContentItem.str) {
        return;
      }
      if (!textContentItem.vertical) {
        textContentItem.totalWidth += textContentItem.width * textContentItem.textAdvanceScale;
      } else {
        textContentItem.totalHeight += textContentItem.height * textContentItem.textAdvanceScale;
      }
      textContent.items.push(runBidiTransform(textContentItem));
      textContentItem.initialized = false;
      textContentItem.str.length = 0;
    }
    function enqueueChunk(batch = false) {
      const length = textContent.items.length;
      if (length === 0) {
        return;
      }
      if (batch && length < TEXT_CHUNK_BATCH_SIZE) {
        return;
      }
      sink.enqueue(textContent, length);
      textContent.items = [];
      textContent.styles = Object.create(null);
    }
    const timeSlotManager = new TimeSlotManager();
    return new Promise(function promiseBody(resolve, reject) {
      const next = function (promise) {
        enqueueChunk(true);
        Promise.all([promise, sink.ready]).then(function () {
          try {
            promiseBody(resolve, reject);
          } catch (ex) {
            reject(ex);
          }
        }, reject);
      };
      task.ensureNotTerminated();
      timeSlotManager.reset();
      const operation = {};
      let stop,
        args = [];
      while (!(stop = timeSlotManager.check())) {
        args.length = 0;
        operation.args = args;
        if (!preprocessor.read(operation)) {
          break;
        }
        textState = stateManager.state;
        const fn = operation.fn;
        args = operation.args;
        switch (fn | 0) {
          case _util.OPS.setFont:
            var fontNameArg = args[0].name,
              fontSizeArg = args[1];
            if (textState.font && fontNameArg === textState.fontName && fontSizeArg === textState.fontSize) {
              break;
            }
            flushTextContentItem();
            textState.fontName = fontNameArg;
            textState.fontSize = fontSizeArg;
            next(handleSetFont(fontNameArg, null));
            return;
          case _util.OPS.setTextRise:
            textState.textRise = args[0];
            break;
          case _util.OPS.setHScale:
            textState.textHScale = args[0] / 100;
            break;
          case _util.OPS.setLeading:
            textState.leading = args[0];
            break;
          case _util.OPS.moveText:
            textState.translateTextLineMatrix(args[0], args[1]);
            textState.textMatrix = textState.textLineMatrix.slice();
            break;
          case _util.OPS.setLeadingMoveText:
            textState.leading = -args[1];
            textState.translateTextLineMatrix(args[0], args[1]);
            textState.textMatrix = textState.textLineMatrix.slice();
            break;
          case _util.OPS.nextLine:
            textState.carriageReturn();
            break;
          case _util.OPS.setTextMatrix:
            textState.setTextMatrix(args[0], args[1], args[2], args[3], args[4], args[5]);
            textState.setTextLineMatrix(args[0], args[1], args[2], args[3], args[4], args[5]);
            updateAdvanceScale();
            break;
          case _util.OPS.setCharSpacing:
            textState.charSpacing = args[0];
            break;
          case _util.OPS.setWordSpacing:
            textState.wordSpacing = args[0];
            break;
          case _util.OPS.beginText:
            textState.textMatrix = _util.IDENTITY_MATRIX.slice();
            textState.textLineMatrix = _util.IDENTITY_MATRIX.slice();
            break;
          case _util.OPS.showSpacedText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            const spaceFactor = (textState.font.vertical ? 1 : -1) * textState.fontSize / 1000;
            const elements = args[0];
            for (let i = 0, ii = elements.length; i < ii - 1; i++) {
              const item = elements[i];
              if (typeof item === "string") {
                showSpacedTextBuffer.push(item);
              } else if (typeof item === "number" && item !== 0) {
                const str = showSpacedTextBuffer.join("");
                showSpacedTextBuffer.length = 0;
                buildTextContentItem({
                  chars: str,
                  extraSpacing: item * spaceFactor
                });
              }
            }
            const item = elements.at(-1);
            if (typeof item === "string") {
              showSpacedTextBuffer.push(item);
            }
            if (showSpacedTextBuffer.length > 0) {
              const str = showSpacedTextBuffer.join("");
              showSpacedTextBuffer.length = 0;
              buildTextContentItem({
                chars: str,
                extraSpacing: 0
              });
            }
            break;
          case _util.OPS.showText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            buildTextContentItem({
              chars: args[0],
              extraSpacing: 0
            });
            break;
          case _util.OPS.nextLineShowText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            textState.carriageReturn();
            buildTextContentItem({
              chars: args[0],
              extraSpacing: 0
            });
            break;
          case _util.OPS.nextLineSetSpacingShowText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            textState.wordSpacing = args[0];
            textState.charSpacing = args[1];
            textState.carriageReturn();
            buildTextContentItem({
              chars: args[2],
              extraSpacing: 0
            });
            break;
          case _util.OPS.paintXObject:
            flushTextContentItem();
            if (!xobjs) {
              xobjs = resources.get("XObject") || _primitives.Dict.empty;
            }
            var isValidName = args[0] instanceof _primitives.Name;
            var name = args[0].name;
            if (isValidName && emptyXObjectCache.getByName(name)) {
              break;
            }
            next(new Promise(function (resolveXObject, rejectXObject) {
              if (!isValidName) {
                throw new _util.FormatError("XObject must be referred to by name.");
              }
              let xobj = xobjs.getRaw(name);
              if (xobj instanceof _primitives.Ref) {
                if (emptyXObjectCache.getByRef(xobj)) {
                  resolveXObject();
                  return;
                }
                const globalImage = self.globalImageCache.getData(xobj, self.pageIndex);
                if (globalImage) {
                  resolveXObject();
                  return;
                }
                xobj = xref.fetch(xobj);
              }
              if (!(xobj instanceof _base_stream.BaseStream)) {
                throw new _util.FormatError("XObject should be a stream");
              }
              const type = xobj.dict.get("Subtype");
              if (!(type instanceof _primitives.Name)) {
                throw new _util.FormatError("XObject should have a Name subtype");
              }
              if (type.name !== "Form") {
                emptyXObjectCache.set(name, xobj.dict.objId, true);
                resolveXObject();
                return;
              }
              const currentState = stateManager.state.clone();
              const xObjStateManager = new StateManager(currentState);
              const matrix = xobj.dict.getArray("Matrix");
              if (Array.isArray(matrix) && matrix.length === 6) {
                xObjStateManager.transform(matrix);
              }
              enqueueChunk();
              const sinkWrapper = {
                enqueueInvoked: false,
                enqueue(chunk, size) {
                  this.enqueueInvoked = true;
                  sink.enqueue(chunk, size);
                },
                get desiredSize() {
                  return sink.desiredSize;
                },
                get ready() {
                  return sink.ready;
                }
              };
              self.getTextContent({
                stream: xobj,
                task,
                resources: xobj.dict.get("Resources") || resources,
                stateManager: xObjStateManager,
                combineTextItems,
                includeMarkedContent,
                sink: sinkWrapper,
                seenStyles,
                viewBox,
                markedContentData
              }).then(function () {
                if (!sinkWrapper.enqueueInvoked) {
                  emptyXObjectCache.set(name, xobj.dict.objId, true);
                }
                resolveXObject();
              }, rejectXObject);
            }).catch(function (reason) {
              if (reason instanceof _util.AbortException) {
                return;
              }
              if (self.options.ignoreErrors) {
                (0, _util.warn)(`getTextContent - ignoring XObject: "${reason}".`);
                return;
              }
              throw reason;
            }));
            return;
          case _util.OPS.setGState:
            isValidName = args[0] instanceof _primitives.Name;
            name = args[0].name;
            if (isValidName && emptyGStateCache.getByName(name)) {
              break;
            }
            next(new Promise(function (resolveGState, rejectGState) {
              if (!isValidName) {
                throw new _util.FormatError("GState must be referred to by name.");
              }
              const extGState = resources.get("ExtGState");
              if (!(extGState instanceof _primitives.Dict)) {
                throw new _util.FormatError("ExtGState should be a dictionary.");
              }
              const gState = extGState.get(name);
              if (!(gState instanceof _primitives.Dict)) {
                throw new _util.FormatError("GState should be a dictionary.");
              }
              const gStateFont = gState.get("Font");
              if (!gStateFont) {
                emptyGStateCache.set(name, gState.objId, true);
                resolveGState();
                return;
              }
              flushTextContentItem();
              textState.fontName = null;
              textState.fontSize = gStateFont[1];
              handleSetFont(null, gStateFont[0]).then(resolveGState, rejectGState);
            }).catch(function (reason) {
              if (reason instanceof _util.AbortException) {
                return;
              }
              if (self.options.ignoreErrors) {
                (0, _util.warn)(`getTextContent - ignoring ExtGState: "${reason}".`);
                return;
              }
              throw reason;
            }));
            return;
          case _util.OPS.beginMarkedContent:
            flushTextContentItem();
            if (includeMarkedContent) {
              markedContentData.level++;
              textContent.items.push({
                type: "beginMarkedContent",
                tag: args[0] instanceof _primitives.Name ? args[0].name : null
              });
            }
            break;
          case _util.OPS.beginMarkedContentProps:
            flushTextContentItem();
            if (includeMarkedContent) {
              markedContentData.level++;
              let mcid = null;
              if (args[1] instanceof _primitives.Dict) {
                mcid = args[1].get("MCID");
              }
              textContent.items.push({
                type: "beginMarkedContentProps",
                id: Number.isInteger(mcid) ? `${self.idFactory.getPageObjId()}_mcid${mcid}` : null,
                tag: args[0] instanceof _primitives.Name ? args[0].name : null
              });
            }
            break;
          case _util.OPS.endMarkedContent:
            flushTextContentItem();
            if (includeMarkedContent) {
              if (markedContentData.level === 0) {
                break;
              }
              markedContentData.level--;
              textContent.items.push({
                type: "endMarkedContent"
              });
            }
            break;
        }
        if (textContent.items.length >= sink.desiredSize) {
          stop = true;
          break;
        }
      }
      if (stop) {
        next(deferred);
        return;
      }
      flushTextContentItem();
      enqueueChunk();
      resolve();
    }).catch(reason => {
      if (reason instanceof _util.AbortException) {
        return;
      }
      if (this.options.ignoreErrors) {
        (0, _util.warn)(`getTextContent - ignoring errors during "${task.name}" ` + `task: "${reason}".`);
        flushTextContentItem();
        enqueueChunk();
        return;
      }
      throw reason;
    });
  }
  extractDataStructures(dict, baseDict, properties) {
    const xref = this.xref;
    let cidToGidBytes;
    const toUnicodePromise = this.readToUnicode(properties.toUnicode || dict.get("ToUnicode") || baseDict.get("ToUnicode"));
    if (properties.composite) {
      const cidSystemInfo = dict.get("CIDSystemInfo");
      if (cidSystemInfo instanceof _primitives.Dict) {
        properties.cidSystemInfo = {
          registry: (0, _util.stringToPDFString)(cidSystemInfo.get("Registry")),
          ordering: (0, _util.stringToPDFString)(cidSystemInfo.get("Ordering")),
          supplement: cidSystemInfo.get("Supplement")
        };
      }
      try {
        const cidToGidMap = dict.get("CIDToGIDMap");
        if (cidToGidMap instanceof _base_stream.BaseStream) {
          cidToGidBytes = cidToGidMap.getBytes();
        }
      } catch (ex) {
        if (!this.options.ignoreErrors) {
          throw ex;
        }
        (0, _util.warn)(`extractDataStructures - ignoring CIDToGIDMap data: "${ex}".`);
      }
    }
    const differences = [];
    let baseEncodingName = null;
    let encoding;
    if (dict.has("Encoding")) {
      encoding = dict.get("Encoding");
      if (encoding instanceof _primitives.Dict) {
        baseEncodingName = encoding.get("BaseEncoding");
        baseEncodingName = baseEncodingName instanceof _primitives.Name ? baseEncodingName.name : null;
        if (encoding.has("Differences")) {
          const diffEncoding = encoding.get("Differences");
          let index = 0;
          for (const entry of diffEncoding) {
            const data = xref.fetchIfRef(entry);
            if (typeof data === "number") {
              index = data;
            } else if (data instanceof _primitives.Name) {
              differences[index++] = data.name;
            } else {
              throw new _util.FormatError(`Invalid entry in 'Differences' array: ${data}`);
            }
          }
        }
      } else if (encoding instanceof _primitives.Name) {
        baseEncodingName = encoding.name;
      } else {
        const msg = "Encoding is not a Name nor a Dict";
        if (!this.options.ignoreErrors) {
          throw new _util.FormatError(msg);
        }
        (0, _util.warn)(msg);
      }
      if (baseEncodingName !== "MacRomanEncoding" && baseEncodingName !== "MacExpertEncoding" && baseEncodingName !== "WinAnsiEncoding") {
        baseEncodingName = null;
      }
    }
    if (baseEncodingName) {
      properties.defaultEncoding = (0, _encodings.getEncoding)(baseEncodingName);
    } else {
      const isSymbolicFont = !!(properties.flags & _fonts_utils.FontFlags.Symbolic);
      const isNonsymbolicFont = !!(properties.flags & _fonts_utils.FontFlags.Nonsymbolic);
      encoding = _encodings.StandardEncoding;
      if (properties.type === "TrueType" && !isNonsymbolicFont) {
        encoding = _encodings.WinAnsiEncoding;
      }
      if (isSymbolicFont) {
        encoding = _encodings.MacRomanEncoding;
        if (!properties.file || properties.isInternalFont) {
          if (/Symbol/i.test(properties.name)) {
            encoding = _encodings.SymbolSetEncoding;
          } else if (/Dingbats|Wingdings/i.test(properties.name)) {
            encoding = _encodings.ZapfDingbatsEncoding;
          }
        }
      }
      properties.defaultEncoding = encoding;
    }
    properties.differences = differences;
    properties.baseEncodingName = baseEncodingName;
    properties.hasEncoding = !!baseEncodingName || differences.length > 0;
    properties.dict = dict;
    return toUnicodePromise.then(readToUnicode => {
      properties.toUnicode = readToUnicode;
      return this.buildToUnicode(properties);
    }).then(builtToUnicode => {
      properties.toUnicode = builtToUnicode;
      if (cidToGidBytes) {
        properties.cidToGidMap = this.readCidToGidMap(cidToGidBytes, builtToUnicode);
      }
      return properties;
    });
  }
  _simpleFontToUnicode(properties, forceGlyphs = false) {
    (0, _util.assert)(!properties.composite, "Must be a simple font.");
    const toUnicode = [];
    const encoding = properties.defaultEncoding.slice();
    const baseEncodingName = properties.baseEncodingName;
    const differences = properties.differences;
    for (const charcode in differences) {
      const glyphName = differences[charcode];
      if (glyphName === ".notdef") {
        continue;
      }
      encoding[charcode] = glyphName;
    }
    const glyphsUnicodeMap = (0, _glyphlist.getGlyphsUnicode)();
    for (const charcode in encoding) {
      let glyphName = encoding[charcode];
      if (glyphName === "") {
        continue;
      }
      let unicode = glyphsUnicodeMap[glyphName];
      if (unicode !== undefined) {
        toUnicode[charcode] = String.fromCharCode(unicode);
        continue;
      }
      let code = 0;
      switch (glyphName[0]) {
        case "G":
          if (glyphName.length === 3) {
            code = parseInt(glyphName.substring(1), 16);
          }
          break;
        case "g":
          if (glyphName.length === 5) {
            code = parseInt(glyphName.substring(1), 16);
          }
          break;
        case "C":
        case "c":
          if (glyphName.length >= 3 && glyphName.length <= 4) {
            const codeStr = glyphName.substring(1);
            if (forceGlyphs) {
              code = parseInt(codeStr, 16);
              break;
            }
            code = +codeStr;
            if (Number.isNaN(code) && Number.isInteger(parseInt(codeStr, 16))) {
              return this._simpleFontToUnicode(properties, true);
            }
          }
          break;
        case "u":
          unicode = (0, _unicode.getUnicodeForGlyph)(glyphName, glyphsUnicodeMap);
          if (unicode !== -1) {
            code = unicode;
          }
          break;
      }
      if (code > 0 && code <= 0x10ffff && Number.isInteger(code)) {
        if (baseEncodingName && code === +charcode) {
          const baseEncoding = (0, _encodings.getEncoding)(baseEncodingName);
          if (baseEncoding && (glyphName = baseEncoding[charcode])) {
            toUnicode[charcode] = String.fromCharCode(glyphsUnicodeMap[glyphName]);
            continue;
          }
        }
        toUnicode[charcode] = String.fromCodePoint(code);
      }
    }
    return toUnicode;
  }
  async buildToUnicode(properties) {
    properties.hasIncludedToUnicodeMap = !!properties.toUnicode && properties.toUnicode.length > 0;
    if (properties.hasIncludedToUnicodeMap) {
      if (!properties.composite && properties.hasEncoding) {
        properties.fallbackToUnicode = this._simpleFontToUnicode(properties);
      }
      return properties.toUnicode;
    }
    if (!properties.composite) {
      return new _to_unicode_map.ToUnicodeMap(this._simpleFontToUnicode(properties));
    }
    if (properties.composite && (properties.cMap.builtInCMap && !(properties.cMap instanceof _cmap.IdentityCMap) || properties.cidSystemInfo.registry === "Adobe" && (properties.cidSystemInfo.ordering === "GB1" || properties.cidSystemInfo.ordering === "CNS1" || properties.cidSystemInfo.ordering === "Japan1" || properties.cidSystemInfo.ordering === "Korea1"))) {
      const {
        registry,
        ordering
      } = properties.cidSystemInfo;
      const ucs2CMapName = _primitives.Name.get(`${registry}-${ordering}-UCS2`);
      const ucs2CMap = await _cmap.CMapFactory.create({
        encoding: ucs2CMapName,
        fetchBuiltInCMap: this._fetchBuiltInCMapBound,
        useCMap: null
      });
      const toUnicode = [];
      properties.cMap.forEach(function (charcode, cid) {
        if (cid > 0xffff) {
          throw new _util.FormatError("Max size of CID is 65,535");
        }
        const ucs2 = ucs2CMap.lookup(cid);
        if (ucs2) {
          toUnicode[charcode] = String.fromCharCode((ucs2.charCodeAt(0) << 8) + ucs2.charCodeAt(1));
        }
      });
      return new _to_unicode_map.ToUnicodeMap(toUnicode);
    }
    return new _to_unicode_map.IdentityToUnicodeMap(properties.firstChar, properties.lastChar);
  }
  readToUnicode(cmapObj) {
    if (!cmapObj) {
      return Promise.resolve(null);
    }
    if (cmapObj instanceof _primitives.Name) {
      return _cmap.CMapFactory.create({
        encoding: cmapObj,
        fetchBuiltInCMap: this._fetchBuiltInCMapBound,
        useCMap: null
      }).then(function (cmap) {
        if (cmap instanceof _cmap.IdentityCMap) {
          return new _to_unicode_map.IdentityToUnicodeMap(0, 0xffff);
        }
        return new _to_unicode_map.ToUnicodeMap(cmap.getMap());
      });
    } else if (cmapObj instanceof _base_stream.BaseStream) {
      return _cmap.CMapFactory.create({
        encoding: cmapObj,
        fetchBuiltInCMap: this._fetchBuiltInCMapBound,
        useCMap: null
      }).then(function (cmap) {
        if (cmap instanceof _cmap.IdentityCMap) {
          return new _to_unicode_map.IdentityToUnicodeMap(0, 0xffff);
        }
        const map = new Array(cmap.length);
        cmap.forEach(function (charCode, token) {
          if (typeof token === "number") {
            map[charCode] = String.fromCodePoint(token);
            return;
          }
          const str = [];
          for (let k = 0; k < token.length; k += 2) {
            const w1 = token.charCodeAt(k) << 8 | token.charCodeAt(k + 1);
            if ((w1 & 0xf800) !== 0xd800) {
              str.push(w1);
              continue;
            }
            k += 2;
            const w2 = token.charCodeAt(k) << 8 | token.charCodeAt(k + 1);
            str.push(((w1 & 0x3ff) << 10) + (w2 & 0x3ff) + 0x10000);
          }
          map[charCode] = String.fromCodePoint(...str);
        });
        return new _to_unicode_map.ToUnicodeMap(map);
      }, reason => {
        if (reason instanceof _util.AbortException) {
          return null;
        }
        if (this.options.ignoreErrors) {
          this.handler.send("UnsupportedFeature", {
            featureId: _util.UNSUPPORTED_FEATURES.errorFontToUnicode
          });
          (0, _util.warn)(`readToUnicode - ignoring ToUnicode data: "${reason}".`);
          return null;
        }
        throw reason;
      });
    }
    return Promise.resolve(null);
  }
  readCidToGidMap(glyphsData, toUnicode) {
    const result = [];
    for (let j = 0, jj = glyphsData.length; j < jj; j++) {
      const glyphID = glyphsData[j++] << 8 | glyphsData[j];
      const code = j >> 1;
      if (glyphID === 0 && !toUnicode.has(code)) {
        continue;
      }
      result[code] = glyphID;
    }
    return result;
  }
  extractWidths(dict, descriptor, properties) {
    const xref = this.xref;
    let glyphsWidths = [];
    let defaultWidth = 0;
    const glyphsVMetrics = [];
    let defaultVMetrics;
    let i, ii, j, jj, start, code, widths;
    if (properties.composite) {
      defaultWidth = dict.has("DW") ? dict.get("DW") : 1000;
      widths = dict.get("W");
      if (widths) {
        for (i = 0, ii = widths.length; i < ii; i++) {
          start = xref.fetchIfRef(widths[i++]);
          code = xref.fetchIfRef(widths[i]);
          if (Array.isArray(code)) {
            for (j = 0, jj = code.length; j < jj; j++) {
              glyphsWidths[start++] = xref.fetchIfRef(code[j]);
            }
          } else {
            const width = xref.fetchIfRef(widths[++i]);
            for (j = start; j <= code; j++) {
              glyphsWidths[j] = width;
            }
          }
        }
      }
      if (properties.vertical) {
        let vmetrics = dict.getArray("DW2") || [880, -1000];
        defaultVMetrics = [vmetrics[1], defaultWidth * 0.5, vmetrics[0]];
        vmetrics = dict.get("W2");
        if (vmetrics) {
          for (i = 0, ii = vmetrics.length; i < ii; i++) {
            start = xref.fetchIfRef(vmetrics[i++]);
            code = xref.fetchIfRef(vmetrics[i]);
            if (Array.isArray(code)) {
              for (j = 0, jj = code.length; j < jj; j++) {
                glyphsVMetrics[start++] = [xref.fetchIfRef(code[j++]), xref.fetchIfRef(code[j++]), xref.fetchIfRef(code[j])];
              }
            } else {
              const vmetric = [xref.fetchIfRef(vmetrics[++i]), xref.fetchIfRef(vmetrics[++i]), xref.fetchIfRef(vmetrics[++i])];
              for (j = start; j <= code; j++) {
                glyphsVMetrics[j] = vmetric;
              }
            }
          }
        }
      }
    } else {
      const firstChar = properties.firstChar;
      widths = dict.get("Widths");
      if (widths) {
        j = firstChar;
        for (i = 0, ii = widths.length; i < ii; i++) {
          glyphsWidths[j++] = xref.fetchIfRef(widths[i]);
        }
        defaultWidth = parseFloat(descriptor.get("MissingWidth")) || 0;
      } else {
        const baseFontName = dict.get("BaseFont");
        if (baseFontName instanceof _primitives.Name) {
          const metrics = this.getBaseFontMetrics(baseFontName.name);
          glyphsWidths = this.buildCharCodeToWidth(metrics.widths, properties);
          defaultWidth = metrics.defaultWidth;
        }
      }
    }
    let isMonospace = true;
    let firstWidth = defaultWidth;
    for (const glyph in glyphsWidths) {
      const glyphWidth = glyphsWidths[glyph];
      if (!glyphWidth) {
        continue;
      }
      if (!firstWidth) {
        firstWidth = glyphWidth;
        continue;
      }
      if (firstWidth !== glyphWidth) {
        isMonospace = false;
        break;
      }
    }
    if (isMonospace) {
      properties.flags |= _fonts_utils.FontFlags.FixedPitch;
    }
    properties.defaultWidth = defaultWidth;
    properties.widths = glyphsWidths;
    properties.defaultVMetrics = defaultVMetrics;
    properties.vmetrics = glyphsVMetrics;
  }
  isSerifFont(baseFontName) {
    const fontNameWoStyle = baseFontName.split("-")[0];
    return fontNameWoStyle in (0, _standard_fonts.getSerifFonts)() || /serif/gi.test(fontNameWoStyle);
  }
  getBaseFontMetrics(name) {
    let defaultWidth = 0;
    let widths = Object.create(null);
    let monospace = false;
    const stdFontMap = (0, _standard_fonts.getStdFontMap)();
    let lookupName = stdFontMap[name] || name;
    const Metrics = (0, _metrics.getMetrics)();
    if (!(lookupName in Metrics)) {
      if (this.isSerifFont(name)) {
        lookupName = "Times-Roman";
      } else {
        lookupName = "Helvetica";
      }
    }
    const glyphWidths = Metrics[lookupName];
    if (typeof glyphWidths === "number") {
      defaultWidth = glyphWidths;
      monospace = true;
    } else {
      widths = glyphWidths();
    }
    return {
      defaultWidth,
      monospace,
      widths
    };
  }
  buildCharCodeToWidth(widthsByGlyphName, properties) {
    const widths = Object.create(null);
    const differences = properties.differences;
    const encoding = properties.defaultEncoding;
    for (let charCode = 0; charCode < 256; charCode++) {
      if (charCode in differences && widthsByGlyphName[differences[charCode]]) {
        widths[charCode] = widthsByGlyphName[differences[charCode]];
        continue;
      }
      if (charCode in encoding && widthsByGlyphName[encoding[charCode]]) {
        widths[charCode] = widthsByGlyphName[encoding[charCode]];
        continue;
      }
    }
    return widths;
  }
  preEvaluateFont(dict) {
    const baseDict = dict;
    let type = dict.get("Subtype");
    if (!(type instanceof _primitives.Name)) {
      throw new _util.FormatError("invalid font Subtype");
    }
    let composite = false;
    let hash, toUnicode;
    if (type.name === "Type0") {
      const df = dict.get("DescendantFonts");
      if (!df) {
        throw new _util.FormatError("Descendant fonts are not specified");
      }
      dict = Array.isArray(df) ? this.xref.fetchIfRef(df[0]) : df;
      if (!(dict instanceof _primitives.Dict)) {
        throw new _util.FormatError("Descendant font is not a dictionary.");
      }
      type = dict.get("Subtype");
      if (!(type instanceof _primitives.Name)) {
        throw new _util.FormatError("invalid font Subtype");
      }
      composite = true;
    }
    const firstChar = dict.get("FirstChar") || 0,
      lastChar = dict.get("LastChar") || (composite ? 0xffff : 0xff);
    const descriptor = dict.get("FontDescriptor");
    if (descriptor) {
      hash = new _murmurhash.MurmurHash3_64();
      const encoding = baseDict.getRaw("Encoding");
      if (encoding instanceof _primitives.Name) {
        hash.update(encoding.name);
      } else if (encoding instanceof _primitives.Ref) {
        hash.update(encoding.toString());
      } else if (encoding instanceof _primitives.Dict) {
        for (const entry of encoding.getRawValues()) {
          if (entry instanceof _primitives.Name) {
            hash.update(entry.name);
          } else if (entry instanceof _primitives.Ref) {
            hash.update(entry.toString());
          } else if (Array.isArray(entry)) {
            const diffLength = entry.length,
              diffBuf = new Array(diffLength);
            for (let j = 0; j < diffLength; j++) {
              const diffEntry = entry[j];
              if (diffEntry instanceof _primitives.Name) {
                diffBuf[j] = diffEntry.name;
              } else if (typeof diffEntry === "number" || diffEntry instanceof _primitives.Ref) {
                diffBuf[j] = diffEntry.toString();
              }
            }
            hash.update(diffBuf.join());
          }
        }
      }
      hash.update(`${firstChar}-${lastChar}`);
      toUnicode = dict.get("ToUnicode") || baseDict.get("ToUnicode");
      if (toUnicode instanceof _base_stream.BaseStream) {
        const stream = toUnicode.str || toUnicode;
        const uint8array = stream.buffer ? new Uint8Array(stream.buffer.buffer, 0, stream.bufferLength) : new Uint8Array(stream.bytes.buffer, stream.start, stream.end - stream.start);
        hash.update(uint8array);
      } else if (toUnicode instanceof _primitives.Name) {
        hash.update(toUnicode.name);
      }
      const widths = dict.get("Widths") || baseDict.get("Widths");
      if (Array.isArray(widths)) {
        const widthsBuf = [];
        for (const entry of widths) {
          if (typeof entry === "number" || entry instanceof _primitives.Ref) {
            widthsBuf.push(entry.toString());
          }
        }
        hash.update(widthsBuf.join());
      }
      if (composite) {
        hash.update("compositeFont");
        const compositeWidths = dict.get("W") || baseDict.get("W");
        if (Array.isArray(compositeWidths)) {
          const widthsBuf = [];
          for (const entry of compositeWidths) {
            if (typeof entry === "number" || entry instanceof _primitives.Ref) {
              widthsBuf.push(entry.toString());
            } else if (Array.isArray(entry)) {
              const subWidthsBuf = [];
              for (const element of entry) {
                if (typeof element === "number" || element instanceof _primitives.Ref) {
                  subWidthsBuf.push(element.toString());
                }
              }
              widthsBuf.push(`[${subWidthsBuf.join()}]`);
            }
          }
          hash.update(widthsBuf.join());
        }
        const cidToGidMap = dict.getRaw("CIDToGIDMap") || baseDict.getRaw("CIDToGIDMap");
        if (cidToGidMap instanceof _primitives.Name) {
          hash.update(cidToGidMap.name);
        } else if (cidToGidMap instanceof _primitives.Ref) {
          hash.update(cidToGidMap.toString());
        } else if (cidToGidMap instanceof _base_stream.BaseStream) {
          hash.update(cidToGidMap.peekBytes());
        }
      }
    }
    return {
      descriptor,
      dict,
      baseDict,
      composite,
      type: type.name,
      firstChar,
      lastChar,
      toUnicode,
      hash: hash ? hash.hexdigest() : ""
    };
  }
  async translateFont({
    descriptor,
    dict,
    baseDict,
    composite,
    type,
    firstChar,
    lastChar,
    toUnicode,
    cssFontInfo
  }) {
    const isType3Font = type === "Type3";
    let properties;
    if (!descriptor) {
      if (isType3Font) {
        descriptor = new _primitives.Dict(null);
        descriptor.set("FontName", _primitives.Name.get(type));
        descriptor.set("FontBBox", dict.getArray("FontBBox") || [0, 0, 0, 0]);
      } else {
        let baseFontName = dict.get("BaseFont");
        if (!(baseFontName instanceof _primitives.Name)) {
          throw new _util.FormatError("Base font is not specified");
        }
        baseFontName = baseFontName.name.replace(/[,_]/g, "-");
        const metrics = this.getBaseFontMetrics(baseFontName);
        const fontNameWoStyle = baseFontName.split("-")[0];
        const flags = (this.isSerifFont(fontNameWoStyle) ? _fonts_utils.FontFlags.Serif : 0) | (metrics.monospace ? _fonts_utils.FontFlags.FixedPitch : 0) | ((0, _standard_fonts.getSymbolsFonts)()[fontNameWoStyle] ? _fonts_utils.FontFlags.Symbolic : _fonts_utils.FontFlags.Nonsymbolic);
        properties = {
          type,
          name: baseFontName,
          loadedName: baseDict.loadedName,
          widths: metrics.widths,
          defaultWidth: metrics.defaultWidth,
          isSimulatedFlags: true,
          flags,
          firstChar,
          lastChar,
          toUnicode,
          xHeight: 0,
          capHeight: 0,
          italicAngle: 0,
          isType3Font
        };
        const widths = dict.get("Widths");
        const standardFontName = (0, _standard_fonts.getStandardFontName)(baseFontName);
        let file = null;
        if (standardFontName) {
          properties.isStandardFont = true;
          file = await this.fetchStandardFontData(standardFontName);
          properties.isInternalFont = !!file;
        }
        return this.extractDataStructures(dict, dict, properties).then(newProperties => {
          if (widths) {
            const glyphWidths = [];
            let j = firstChar;
            for (const width of widths) {
              glyphWidths[j++] = this.xref.fetchIfRef(width);
            }
            newProperties.widths = glyphWidths;
          } else {
            newProperties.widths = this.buildCharCodeToWidth(metrics.widths, newProperties);
          }
          return new _fonts.Font(baseFontName, file, newProperties);
        });
      }
    }
    let fontName = descriptor.get("FontName");
    let baseFont = dict.get("BaseFont");
    if (typeof fontName === "string") {
      fontName = _primitives.Name.get(fontName);
    }
    if (typeof baseFont === "string") {
      baseFont = _primitives.Name.get(baseFont);
    }
    if (!isType3Font) {
      const fontNameStr = fontName && fontName.name;
      const baseFontStr = baseFont && baseFont.name;
      if (fontNameStr !== baseFontStr) {
        (0, _util.info)(`The FontDescriptor's FontName is "${fontNameStr}" but ` + `should be the same as the Font's BaseFont "${baseFontStr}".`);
        if (fontNameStr && baseFontStr && baseFontStr.startsWith(fontNameStr)) {
          fontName = baseFont;
        }
      }
    }
    fontName = fontName || baseFont;
    if (!(fontName instanceof _primitives.Name)) {
      throw new _util.FormatError("invalid font name");
    }
    let fontFile, subtype, length1, length2, length3;
    try {
      fontFile = descriptor.get("FontFile", "FontFile2", "FontFile3");
    } catch (ex) {
      if (!this.options.ignoreErrors) {
        throw ex;
      }
      (0, _util.warn)(`translateFont - fetching "${fontName.name}" font file: "${ex}".`);
      fontFile = new _stream.NullStream();
    }
    let isStandardFont = false;
    let isInternalFont = false;
    let glyphScaleFactors = null;
    if (fontFile) {
      if (fontFile.dict) {
        const subtypeEntry = fontFile.dict.get("Subtype");
        if (subtypeEntry instanceof _primitives.Name) {
          subtype = subtypeEntry.name;
        }
        length1 = fontFile.dict.get("Length1");
        length2 = fontFile.dict.get("Length2");
        length3 = fontFile.dict.get("Length3");
      }
    } else if (cssFontInfo) {
      const standardFontName = (0, _xfa_fonts.getXfaFontName)(fontName.name);
      if (standardFontName) {
        cssFontInfo.fontFamily = `${cssFontInfo.fontFamily}-PdfJS-XFA`;
        cssFontInfo.metrics = standardFontName.metrics || null;
        glyphScaleFactors = standardFontName.factors || null;
        fontFile = await this.fetchStandardFontData(standardFontName.name);
        isInternalFont = !!fontFile;
        baseDict = dict = (0, _xfa_fonts.getXfaFontDict)(fontName.name);
        composite = true;
      }
    } else if (!isType3Font) {
      const standardFontName = (0, _standard_fonts.getStandardFontName)(fontName.name);
      if (standardFontName) {
        isStandardFont = true;
        fontFile = await this.fetchStandardFontData(standardFontName);
        isInternalFont = !!fontFile;
      }
    }
    properties = {
      type,
      name: fontName.name,
      subtype,
      file: fontFile,
      length1,
      length2,
      length3,
      isStandardFont,
      isInternalFont,
      loadedName: baseDict.loadedName,
      composite,
      fixedPitch: false,
      fontMatrix: dict.getArray("FontMatrix") || _util.FONT_IDENTITY_MATRIX,
      firstChar,
      lastChar,
      toUnicode,
      bbox: descriptor.getArray("FontBBox") || dict.getArray("FontBBox"),
      ascent: descriptor.get("Ascent"),
      descent: descriptor.get("Descent"),
      xHeight: descriptor.get("XHeight") || 0,
      capHeight: descriptor.get("CapHeight") || 0,
      flags: descriptor.get("Flags"),
      italicAngle: descriptor.get("ItalicAngle") || 0,
      isType3Font,
      cssFontInfo,
      scaleFactors: glyphScaleFactors
    };
    if (composite) {
      const cidEncoding = baseDict.get("Encoding");
      if (cidEncoding instanceof _primitives.Name) {
        properties.cidEncoding = cidEncoding.name;
      }
      const cMap = await _cmap.CMapFactory.create({
        encoding: cidEncoding,
        fetchBuiltInCMap: this._fetchBuiltInCMapBound,
        useCMap: null
      });
      properties.cMap = cMap;
      properties.vertical = properties.cMap.vertical;
    }
    return this.extractDataStructures(dict, baseDict, properties).then(newProperties => {
      this.extractWidths(dict, descriptor, newProperties);
      return new _fonts.Font(fontName.name, fontFile, newProperties);
    });
  }
  static buildFontPaths(font, glyphs, handler, evaluatorOptions) {
    function buildPath(fontChar) {
      const glyphName = `${font.loadedName}_path_${fontChar}`;
      try {
        if (font.renderer.hasBuiltPath(fontChar)) {
          return;
        }
        handler.send("commonobj", [glyphName, "FontPath", font.renderer.getPathJs(fontChar)]);
      } catch (reason) {
        if (evaluatorOptions.ignoreErrors) {
          handler.send("UnsupportedFeature", {
            featureId: _util.UNSUPPORTED_FEATURES.errorFontBuildPath
          });
          (0, _util.warn)(`buildFontPaths - ignoring ${glyphName} glyph: "${reason}".`);
          return;
        }
        throw reason;
      }
    }
    for (const glyph of glyphs) {
      buildPath(glyph.fontChar);
      const accent = glyph.accent;
      if (accent && accent.fontChar) {
        buildPath(accent.fontChar);
      }
    }
  }
  static get fallbackFontDict() {
    const dict = new _primitives.Dict();
    dict.set("BaseFont", _primitives.Name.get("PDFJS-FallbackFont"));
    dict.set("Type", _primitives.Name.get("FallbackType"));
    dict.set("Subtype", _primitives.Name.get("FallbackType"));
    dict.set("Encoding", _primitives.Name.get("WinAnsiEncoding"));
    return (0, _util.shadow)(this, "fallbackFontDict", dict);
  }
}
exports.PartialEvaluator = PartialEvaluator;
class TranslatedFont {
  constructor({
    loadedName,
    font,
    dict,
    evaluatorOptions
  }) {
    this.loadedName = loadedName;
    this.font = font;
    this.dict = dict;
    this._evaluatorOptions = evaluatorOptions || DefaultPartialEvaluatorOptions;
    this.type3Loaded = null;
    this.type3Dependencies = font.isType3Font ? new Set() : null;
    this.sent = false;
  }
  send(handler) {
    if (this.sent) {
      return;
    }
    this.sent = true;
    handler.send("commonobj", [this.loadedName, "Font", this.font.exportData(this._evaluatorOptions.fontExtraProperties)]);
  }
  fallback(handler) {
    if (!this.font.data) {
      return;
    }
    this.font.disableFontFace = true;
    PartialEvaluator.buildFontPaths(this.font, this.font.glyphCacheValues, handler, this._evaluatorOptions);
  }
  loadType3Data(evaluator, resources, task) {
    if (this.type3Loaded) {
      return this.type3Loaded;
    }
    if (!this.font.isType3Font) {
      throw new Error("Must be a Type3 font.");
    }
    const type3Evaluator = evaluator.clone({
      ignoreErrors: false
    });
    type3Evaluator.parsingType3Font = true;
    const type3FontRefs = new _primitives.RefSet(evaluator.type3FontRefs);
    if (this.dict.objId && !type3FontRefs.has(this.dict.objId)) {
      type3FontRefs.put(this.dict.objId);
    }
    type3Evaluator.type3FontRefs = type3FontRefs;
    const translatedFont = this.font,
      type3Dependencies = this.type3Dependencies;
    let loadCharProcsPromise = Promise.resolve();
    const charProcs = this.dict.get("CharProcs");
    const fontResources = this.dict.get("Resources") || resources;
    const charProcOperatorList = Object.create(null);
    const fontBBox = _util.Util.normalizeRect(translatedFont.bbox || [0, 0, 0, 0]),
      width = fontBBox[2] - fontBBox[0],
      height = fontBBox[3] - fontBBox[1];
    const fontBBoxSize = Math.hypot(width, height);
    for (const key of charProcs.getKeys()) {
      loadCharProcsPromise = loadCharProcsPromise.then(() => {
        const glyphStream = charProcs.get(key);
        const operatorList = new _operator_list.OperatorList();
        return type3Evaluator.getOperatorList({
          stream: glyphStream,
          task,
          resources: fontResources,
          operatorList
        }).then(() => {
          if (operatorList.fnArray[0] === _util.OPS.setCharWidthAndBounds) {
            this._removeType3ColorOperators(operatorList, fontBBoxSize);
          }
          charProcOperatorList[key] = operatorList.getIR();
          for (const dependency of operatorList.dependencies) {
            type3Dependencies.add(dependency);
          }
        }).catch(function (reason) {
          (0, _util.warn)(`Type3 font resource "${key}" is not available.`);
          const dummyOperatorList = new _operator_list.OperatorList();
          charProcOperatorList[key] = dummyOperatorList.getIR();
        });
      });
    }
    this.type3Loaded = loadCharProcsPromise.then(() => {
      translatedFont.charProcOperatorList = charProcOperatorList;
      if (this._bbox) {
        translatedFont.isCharBBox = true;
        translatedFont.bbox = this._bbox;
      }
    });
    return this.type3Loaded;
  }
  _removeType3ColorOperators(operatorList, fontBBoxSize = NaN) {
    const charBBox = _util.Util.normalizeRect(operatorList.argsArray[0].slice(2)),
      width = charBBox[2] - charBBox[0],
      height = charBBox[3] - charBBox[1];
    const charBBoxSize = Math.hypot(width, height);
    if (width === 0 || height === 0) {
      operatorList.fnArray.splice(0, 1);
      operatorList.argsArray.splice(0, 1);
    } else if (fontBBoxSize === 0 || Math.round(charBBoxSize / fontBBoxSize) >= 10) {
      if (!this._bbox) {
        this._bbox = [Infinity, Infinity, -Infinity, -Infinity];
      }
      this._bbox[0] = Math.min(this._bbox[0], charBBox[0]);
      this._bbox[1] = Math.min(this._bbox[1], charBBox[1]);
      this._bbox[2] = Math.max(this._bbox[2], charBBox[2]);
      this._bbox[3] = Math.max(this._bbox[3], charBBox[3]);
    }
    let i = 0,
      ii = operatorList.length;
    while (i < ii) {
      switch (operatorList.fnArray[i]) {
        case _util.OPS.setCharWidthAndBounds:
          break;
        case _util.OPS.setStrokeColorSpace:
        case _util.OPS.setFillColorSpace:
        case _util.OPS.setStrokeColor:
        case _util.OPS.setStrokeColorN:
        case _util.OPS.setFillColor:
        case _util.OPS.setFillColorN:
        case _util.OPS.setStrokeGray:
        case _util.OPS.setFillGray:
        case _util.OPS.setStrokeRGBColor:
        case _util.OPS.setFillRGBColor:
        case _util.OPS.setStrokeCMYKColor:
        case _util.OPS.setFillCMYKColor:
        case _util.OPS.shadingFill:
        case _util.OPS.setRenderingIntent:
          operatorList.fnArray.splice(i, 1);
          operatorList.argsArray.splice(i, 1);
          ii--;
          continue;
        case _util.OPS.setGState:
          const [gStateObj] = operatorList.argsArray[i];
          let j = 0,
            jj = gStateObj.length;
          while (j < jj) {
            const [gStateKey] = gStateObj[j];
            switch (gStateKey) {
              case "TR":
              case "TR2":
              case "HT":
              case "BG":
              case "BG2":
              case "UCR":
              case "UCR2":
                gStateObj.splice(j, 1);
                jj--;
                continue;
            }
            j++;
          }
          break;
      }
      i++;
    }
  }
}
class StateManager {
  constructor(initialState = new EvalState()) {
    this.state = initialState;
    this.stateStack = [];
  }
  save() {
    const old = this.state;
    this.stateStack.push(this.state);
    this.state = old.clone();
  }
  restore() {
    const prev = this.stateStack.pop();
    if (prev) {
      this.state = prev;
    }
  }
  transform(args) {
    this.state.ctm = _util.Util.transform(this.state.ctm, args);
  }
}
class TextState {
  constructor() {
    this.ctm = new Float32Array(_util.IDENTITY_MATRIX);
    this.fontName = null;
    this.fontSize = 0;
    this.loadedName = null;
    this.font = null;
    this.fontMatrix = _util.FONT_IDENTITY_MATRIX;
    this.textMatrix = _util.IDENTITY_MATRIX.slice();
    this.textLineMatrix = _util.IDENTITY_MATRIX.slice();
    this.charSpacing = 0;
    this.wordSpacing = 0;
    this.leading = 0;
    this.textHScale = 1;
    this.textRise = 0;
  }
  setTextMatrix(a, b, c, d, e, f) {
    const m = this.textMatrix;
    m[0] = a;
    m[1] = b;
    m[2] = c;
    m[3] = d;
    m[4] = e;
    m[5] = f;
  }
  setTextLineMatrix(a, b, c, d, e, f) {
    const m = this.textLineMatrix;
    m[0] = a;
    m[1] = b;
    m[2] = c;
    m[3] = d;
    m[4] = e;
    m[5] = f;
  }
  translateTextMatrix(x, y) {
    const m = this.textMatrix;
    m[4] = m[0] * x + m[2] * y + m[4];
    m[5] = m[1] * x + m[3] * y + m[5];
  }
  translateTextLineMatrix(x, y) {
    const m = this.textLineMatrix;
    m[4] = m[0] * x + m[2] * y + m[4];
    m[5] = m[1] * x + m[3] * y + m[5];
  }
  carriageReturn() {
    this.translateTextLineMatrix(0, -this.leading);
    this.textMatrix = this.textLineMatrix.slice();
  }
  clone() {
    const clone = Object.create(this);
    clone.textMatrix = this.textMatrix.slice();
    clone.textLineMatrix = this.textLineMatrix.slice();
    clone.fontMatrix = this.fontMatrix.slice();
    return clone;
  }
}
class EvalState {
  constructor() {
    this.ctm = new Float32Array(_util.IDENTITY_MATRIX);
    this.font = null;
    this.textRenderingMode = _util.TextRenderingMode.FILL;
    this.fillColorSpace = _colorspace.ColorSpace.singletons.gray;
    this.strokeColorSpace = _colorspace.ColorSpace.singletons.gray;
  }
  clone() {
    return Object.create(this);
  }
}
class EvaluatorPreprocessor {
  static get opMap() {
    const getOPMap = (0, _core_utils.getLookupTableFactory)(function (t) {
      t.w = {
        id: _util.OPS.setLineWidth,
        numArgs: 1,
        variableArgs: false
      };
      t.J = {
        id: _util.OPS.setLineCap,
        numArgs: 1,
        variableArgs: false
      };
      t.j = {
        id: _util.OPS.setLineJoin,
        numArgs: 1,
        variableArgs: false
      };
      t.M = {
        id: _util.OPS.setMiterLimit,
        numArgs: 1,
        variableArgs: false
      };
      t.d = {
        id: _util.OPS.setDash,
        numArgs: 2,
        variableArgs: false
      };
      t.ri = {
        id: _util.OPS.setRenderingIntent,
        numArgs: 1,
        variableArgs: false
      };
      t.i = {
        id: _util.OPS.setFlatness,
        numArgs: 1,
        variableArgs: false
      };
      t.gs = {
        id: _util.OPS.setGState,
        numArgs: 1,
        variableArgs: false
      };
      t.q = {
        id: _util.OPS.save,
        numArgs: 0,
        variableArgs: false
      };
      t.Q = {
        id: _util.OPS.restore,
        numArgs: 0,
        variableArgs: false
      };
      t.cm = {
        id: _util.OPS.transform,
        numArgs: 6,
        variableArgs: false
      };
      t.m = {
        id: _util.OPS.moveTo,
        numArgs: 2,
        variableArgs: false
      };
      t.l = {
        id: _util.OPS.lineTo,
        numArgs: 2,
        variableArgs: false
      };
      t.c = {
        id: _util.OPS.curveTo,
        numArgs: 6,
        variableArgs: false
      };
      t.v = {
        id: _util.OPS.curveTo2,
        numArgs: 4,
        variableArgs: false
      };
      t.y = {
        id: _util.OPS.curveTo3,
        numArgs: 4,
        variableArgs: false
      };
      t.h = {
        id: _util.OPS.closePath,
        numArgs: 0,
        variableArgs: false
      };
      t.re = {
        id: _util.OPS.rectangle,
        numArgs: 4,
        variableArgs: false
      };
      t.S = {
        id: _util.OPS.stroke,
        numArgs: 0,
        variableArgs: false
      };
      t.s = {
        id: _util.OPS.closeStroke,
        numArgs: 0,
        variableArgs: false
      };
      t.f = {
        id: _util.OPS.fill,
        numArgs: 0,
        variableArgs: false
      };
      t.F = {
        id: _util.OPS.fill,
        numArgs: 0,
        variableArgs: false
      };
      t["f*"] = {
        id: _util.OPS.eoFill,
        numArgs: 0,
        variableArgs: false
      };
      t.B = {
        id: _util.OPS.fillStroke,
        numArgs: 0,
        variableArgs: false
      };
      t["B*"] = {
        id: _util.OPS.eoFillStroke,
        numArgs: 0,
        variableArgs: false
      };
      t.b = {
        id: _util.OPS.closeFillStroke,
        numArgs: 0,
        variableArgs: false
      };
      t["b*"] = {
        id: _util.OPS.closeEOFillStroke,
        numArgs: 0,
        variableArgs: false
      };
      t.n = {
        id: _util.OPS.endPath,
        numArgs: 0,
        variableArgs: false
      };
      t.W = {
        id: _util.OPS.clip,
        numArgs: 0,
        variableArgs: false
      };
      t["W*"] = {
        id: _util.OPS.eoClip,
        numArgs: 0,
        variableArgs: false
      };
      t.BT = {
        id: _util.OPS.beginText,
        numArgs: 0,
        variableArgs: false
      };
      t.ET = {
        id: _util.OPS.endText,
        numArgs: 0,
        variableArgs: false
      };
      t.Tc = {
        id: _util.OPS.setCharSpacing,
        numArgs: 1,
        variableArgs: false
      };
      t.Tw = {
        id: _util.OPS.setWordSpacing,
        numArgs: 1,
        variableArgs: false
      };
      t.Tz = {
        id: _util.OPS.setHScale,
        numArgs: 1,
        variableArgs: false
      };
      t.TL = {
        id: _util.OPS.setLeading,
        numArgs: 1,
        variableArgs: false
      };
      t.Tf = {
        id: _util.OPS.setFont,
        numArgs: 2,
        variableArgs: false
      };
      t.Tr = {
        id: _util.OPS.setTextRenderingMode,
        numArgs: 1,
        variableArgs: false
      };
      t.Ts = {
        id: _util.OPS.setTextRise,
        numArgs: 1,
        variableArgs: false
      };
      t.Td = {
        id: _util.OPS.moveText,
        numArgs: 2,
        variableArgs: false
      };
      t.TD = {
        id: _util.OPS.setLeadingMoveText,
        numArgs: 2,
        variableArgs: false
      };
      t.Tm = {
        id: _util.OPS.setTextMatrix,
        numArgs: 6,
        variableArgs: false
      };
      t["T*"] = {
        id: _util.OPS.nextLine,
        numArgs: 0,
        variableArgs: false
      };
      t.Tj = {
        id: _util.OPS.showText,
        numArgs: 1,
        variableArgs: false
      };
      t.TJ = {
        id: _util.OPS.showSpacedText,
        numArgs: 1,
        variableArgs: false
      };
      t["'"] = {
        id: _util.OPS.nextLineShowText,
        numArgs: 1,
        variableArgs: false
      };
      t['"'] = {
        id: _util.OPS.nextLineSetSpacingShowText,
        numArgs: 3,
        variableArgs: false
      };
      t.d0 = {
        id: _util.OPS.setCharWidth,
        numArgs: 2,
        variableArgs: false
      };
      t.d1 = {
        id: _util.OPS.setCharWidthAndBounds,
        numArgs: 6,
        variableArgs: false
      };
      t.CS = {
        id: _util.OPS.setStrokeColorSpace,
        numArgs: 1,
        variableArgs: false
      };
      t.cs = {
        id: _util.OPS.setFillColorSpace,
        numArgs: 1,
        variableArgs: false
      };
      t.SC = {
        id: _util.OPS.setStrokeColor,
        numArgs: 4,
        variableArgs: true
      };
      t.SCN = {
        id: _util.OPS.setStrokeColorN,
        numArgs: 33,
        variableArgs: true
      };
      t.sc = {
        id: _util.OPS.setFillColor,
        numArgs: 4,
        variableArgs: true
      };
      t.scn = {
        id: _util.OPS.setFillColorN,
        numArgs: 33,
        variableArgs: true
      };
      t.G = {
        id: _util.OPS.setStrokeGray,
        numArgs: 1,
        variableArgs: false
      };
      t.g = {
        id: _util.OPS.setFillGray,
        numArgs: 1,
        variableArgs: false
      };
      t.RG = {
        id: _util.OPS.setStrokeRGBColor,
        numArgs: 3,
        variableArgs: false
      };
      t.rg = {
        id: _util.OPS.setFillRGBColor,
        numArgs: 3,
        variableArgs: false
      };
      t.K = {
        id: _util.OPS.setStrokeCMYKColor,
        numArgs: 4,
        variableArgs: false
      };
      t.k = {
        id: _util.OPS.setFillCMYKColor,
        numArgs: 4,
        variableArgs: false
      };
      t.sh = {
        id: _util.OPS.shadingFill,
        numArgs: 1,
        variableArgs: false
      };
      t.BI = {
        id: _util.OPS.beginInlineImage,
        numArgs: 0,
        variableArgs: false
      };
      t.ID = {
        id: _util.OPS.beginImageData,
        numArgs: 0,
        variableArgs: false
      };
      t.EI = {
        id: _util.OPS.endInlineImage,
        numArgs: 1,
        variableArgs: false
      };
      t.Do = {
        id: _util.OPS.paintXObject,
        numArgs: 1,
        variableArgs: false
      };
      t.MP = {
        id: _util.OPS.markPoint,
        numArgs: 1,
        variableArgs: false
      };
      t.DP = {
        id: _util.OPS.markPointProps,
        numArgs: 2,
        variableArgs: false
      };
      t.BMC = {
        id: _util.OPS.beginMarkedContent,
        numArgs: 1,
        variableArgs: false
      };
      t.BDC = {
        id: _util.OPS.beginMarkedContentProps,
        numArgs: 2,
        variableArgs: false
      };
      t.EMC = {
        id: _util.OPS.endMarkedContent,
        numArgs: 0,
        variableArgs: false
      };
      t.BX = {
        id: _util.OPS.beginCompat,
        numArgs: 0,
        variableArgs: false
      };
      t.EX = {
        id: _util.OPS.endCompat,
        numArgs: 0,
        variableArgs: false
      };
      t.BM = null;
      t.BD = null;
      t.true = null;
      t.fa = null;
      t.fal = null;
      t.fals = null;
      t.false = null;
      t.nu = null;
      t.nul = null;
      t.null = null;
    });
    return (0, _util.shadow)(this, "opMap", getOPMap());
  }
  static get MAX_INVALID_PATH_OPS() {
    return (0, _util.shadow)(this, "MAX_INVALID_PATH_OPS", 10);
  }
  constructor(stream, xref, stateManager = new StateManager()) {
    this.parser = new _parser.Parser({
      lexer: new _parser.Lexer(stream, EvaluatorPreprocessor.opMap),
      xref
    });
    this.stateManager = stateManager;
    this.nonProcessedArgs = [];
    this._isPathOp = false;
    this._numInvalidPathOPS = 0;
  }
  get savedStatesDepth() {
    return this.stateManager.stateStack.length;
  }
  read(operation) {
    let args = operation.args;
    while (true) {
      const obj = this.parser.getObj();
      if (obj instanceof _primitives.Cmd) {
        const cmd = obj.cmd;
        const opSpec = EvaluatorPreprocessor.opMap[cmd];
        if (!opSpec) {
          (0, _util.warn)(`Unknown command "${cmd}".`);
          continue;
        }
        const fn = opSpec.id;
        const numArgs = opSpec.numArgs;
        let argsLength = args !== null ? args.length : 0;
        if (!this._isPathOp) {
          this._numInvalidPathOPS = 0;
        }
        this._isPathOp = fn >= _util.OPS.moveTo && fn <= _util.OPS.endPath;
        if (!opSpec.variableArgs) {
          if (argsLength !== numArgs) {
            const nonProcessedArgs = this.nonProcessedArgs;
            while (argsLength > numArgs) {
              nonProcessedArgs.push(args.shift());
              argsLength--;
            }
            while (argsLength < numArgs && nonProcessedArgs.length !== 0) {
              if (args === null) {
                args = [];
              }
              args.unshift(nonProcessedArgs.pop());
              argsLength++;
            }
          }
          if (argsLength < numArgs) {
            const partialMsg = `command ${cmd}: expected ${numArgs} args, ` + `but received ${argsLength} args.`;
            if (this._isPathOp && ++this._numInvalidPathOPS > EvaluatorPreprocessor.MAX_INVALID_PATH_OPS) {
              throw new _util.FormatError(`Invalid ${partialMsg}`);
            }
            (0, _util.warn)(`Skipping ${partialMsg}`);
            if (args !== null) {
              args.length = 0;
            }
            continue;
          }
        } else if (argsLength > numArgs) {
          (0, _util.info)(`Command ${cmd}: expected [0, ${numArgs}] args, ` + `but received ${argsLength} args.`);
        }
        this.preprocessCommand(fn, args);
        operation.fn = fn;
        operation.args = args;
        return true;
      }
      if (obj === _primitives.EOF) {
        return false;
      }
      if (obj !== null) {
        if (args === null) {
          args = [];
        }
        args.push(obj);
        if (args.length > 33) {
          throw new _util.FormatError("Too many arguments");
        }
      }
    }
  }
  preprocessCommand(fn, args) {
    switch (fn | 0) {
      case _util.OPS.save:
        this.stateManager.save();
        break;
      case _util.OPS.restore:
        this.stateManager.restore();
        break;
      case _util.OPS.transform:
        this.stateManager.transform(args);
        break;
    }
  }
}
exports.EvaluatorPreprocessor = EvaluatorPreprocessor;