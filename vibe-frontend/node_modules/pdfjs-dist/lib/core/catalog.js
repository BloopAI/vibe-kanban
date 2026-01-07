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
exports.Catalog = void 0;
var _core_utils = require("./core_utils.js");
var _util = require("../shared/util.js");
var _primitives = require("./primitives.js");
var _name_number_tree = require("./name_number_tree.js");
var _base_stream = require("./base_stream.js");
var _cleanup_helper = require("./cleanup_helper.js");
var _colorspace = require("./colorspace.js");
var _file_spec = require("./file_spec.js");
var _image_utils = require("./image_utils.js");
var _metadata_parser = require("./metadata_parser.js");
var _struct_tree = require("./struct_tree.js");
function fetchDestination(dest) {
  if (dest instanceof _primitives.Dict) {
    dest = dest.get("D");
  }
  return Array.isArray(dest) ? dest : null;
}
class Catalog {
  constructor(pdfManager, xref) {
    this.pdfManager = pdfManager;
    this.xref = xref;
    this._catDict = xref.getCatalogObj();
    if (!(this._catDict instanceof _primitives.Dict)) {
      throw new _util.FormatError("Catalog object is not a dictionary.");
    }
    this.toplevelPagesDict;
    this._actualNumPages = null;
    this.fontCache = new _primitives.RefSetCache();
    this.builtInCMapCache = new Map();
    this.standardFontDataCache = new Map();
    this.globalImageCache = new _image_utils.GlobalImageCache();
    this.pageKidsCountCache = new _primitives.RefSetCache();
    this.pageIndexCache = new _primitives.RefSetCache();
    this.nonBlendModesSet = new _primitives.RefSet();
  }
  get version() {
    const version = this._catDict.get("Version");
    if (version instanceof _primitives.Name) {
      if (_core_utils.PDF_VERSION_REGEXP.test(version.name)) {
        return (0, _util.shadow)(this, "version", version.name);
      }
      (0, _util.warn)(`Invalid PDF catalog version: ${version.name}`);
    }
    return (0, _util.shadow)(this, "version", null);
  }
  get lang() {
    const lang = this._catDict.get("Lang");
    return (0, _util.shadow)(this, "lang", typeof lang === "string" ? (0, _util.stringToPDFString)(lang) : null);
  }
  get needsRendering() {
    const needsRendering = this._catDict.get("NeedsRendering");
    return (0, _util.shadow)(this, "needsRendering", typeof needsRendering === "boolean" ? needsRendering : false);
  }
  get collection() {
    let collection = null;
    try {
      const obj = this._catDict.get("Collection");
      if (obj instanceof _primitives.Dict && obj.size > 0) {
        collection = obj;
      }
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }
      (0, _util.info)("Cannot fetch Collection entry; assuming no collection is present.");
    }
    return (0, _util.shadow)(this, "collection", collection);
  }
  get acroForm() {
    let acroForm = null;
    try {
      const obj = this._catDict.get("AcroForm");
      if (obj instanceof _primitives.Dict && obj.size > 0) {
        acroForm = obj;
      }
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }
      (0, _util.info)("Cannot fetch AcroForm entry; assuming no forms are present.");
    }
    return (0, _util.shadow)(this, "acroForm", acroForm);
  }
  get acroFormRef() {
    const value = this._catDict.getRaw("AcroForm");
    return (0, _util.shadow)(this, "acroFormRef", value instanceof _primitives.Ref ? value : null);
  }
  get metadata() {
    const streamRef = this._catDict.getRaw("Metadata");
    if (!(streamRef instanceof _primitives.Ref)) {
      return (0, _util.shadow)(this, "metadata", null);
    }
    let metadata = null;
    try {
      const suppressEncryption = !(this.xref.encrypt && this.xref.encrypt.encryptMetadata);
      const stream = this.xref.fetch(streamRef, suppressEncryption);
      if (stream instanceof _base_stream.BaseStream && stream.dict instanceof _primitives.Dict) {
        const type = stream.dict.get("Type");
        const subtype = stream.dict.get("Subtype");
        if ((0, _primitives.isName)(type, "Metadata") && (0, _primitives.isName)(subtype, "XML")) {
          const data = (0, _util.stringToUTF8String)(stream.getString());
          if (data) {
            metadata = new _metadata_parser.MetadataParser(data).serializable;
          }
        }
      }
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }
      (0, _util.info)(`Skipping invalid Metadata: "${ex}".`);
    }
    return (0, _util.shadow)(this, "metadata", metadata);
  }
  get markInfo() {
    let markInfo = null;
    try {
      markInfo = this._readMarkInfo();
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }
      (0, _util.warn)("Unable to read mark info.");
    }
    return (0, _util.shadow)(this, "markInfo", markInfo);
  }
  _readMarkInfo() {
    const obj = this._catDict.get("MarkInfo");
    if (!(obj instanceof _primitives.Dict)) {
      return null;
    }
    const markInfo = {
      Marked: false,
      UserProperties: false,
      Suspects: false
    };
    for (const key in markInfo) {
      const value = obj.get(key);
      if (typeof value === "boolean") {
        markInfo[key] = value;
      }
    }
    return markInfo;
  }
  get structTreeRoot() {
    let structTree = null;
    try {
      structTree = this._readStructTreeRoot();
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }
      (0, _util.warn)("Unable read to structTreeRoot info.");
    }
    return (0, _util.shadow)(this, "structTreeRoot", structTree);
  }
  _readStructTreeRoot() {
    const obj = this._catDict.get("StructTreeRoot");
    if (!(obj instanceof _primitives.Dict)) {
      return null;
    }
    const root = new _struct_tree.StructTreeRoot(obj);
    root.init();
    return root;
  }
  get toplevelPagesDict() {
    const pagesObj = this._catDict.get("Pages");
    if (!(pagesObj instanceof _primitives.Dict)) {
      throw new _util.FormatError("Invalid top-level pages dictionary.");
    }
    return (0, _util.shadow)(this, "toplevelPagesDict", pagesObj);
  }
  get documentOutline() {
    let obj = null;
    try {
      obj = this._readDocumentOutline();
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }
      (0, _util.warn)("Unable to read document outline.");
    }
    return (0, _util.shadow)(this, "documentOutline", obj);
  }
  _readDocumentOutline() {
    let obj = this._catDict.get("Outlines");
    if (!(obj instanceof _primitives.Dict)) {
      return null;
    }
    obj = obj.getRaw("First");
    if (!(obj instanceof _primitives.Ref)) {
      return null;
    }
    const root = {
      items: []
    };
    const queue = [{
      obj,
      parent: root
    }];
    const processed = new _primitives.RefSet();
    processed.put(obj);
    const xref = this.xref,
      blackColor = new Uint8ClampedArray(3);
    while (queue.length > 0) {
      const i = queue.shift();
      const outlineDict = xref.fetchIfRef(i.obj);
      if (outlineDict === null) {
        continue;
      }
      if (!outlineDict.has("Title")) {
        throw new _util.FormatError("Invalid outline item encountered.");
      }
      const data = {
        url: null,
        dest: null,
        action: null
      };
      Catalog.parseDestDictionary({
        destDict: outlineDict,
        resultObj: data,
        docBaseUrl: this.pdfManager.docBaseUrl,
        docAttachments: this.attachments
      });
      const title = outlineDict.get("Title");
      const flags = outlineDict.get("F") || 0;
      const color = outlineDict.getArray("C");
      const count = outlineDict.get("Count");
      let rgbColor = blackColor;
      if (Array.isArray(color) && color.length === 3 && (color[0] !== 0 || color[1] !== 0 || color[2] !== 0)) {
        rgbColor = _colorspace.ColorSpace.singletons.rgb.getRgb(color, 0);
      }
      const outlineItem = {
        action: data.action,
        attachment: data.attachment,
        dest: data.dest,
        url: data.url,
        unsafeUrl: data.unsafeUrl,
        newWindow: data.newWindow,
        setOCGState: data.setOCGState,
        title: (0, _util.stringToPDFString)(title),
        color: rgbColor,
        count: Number.isInteger(count) ? count : undefined,
        bold: !!(flags & 2),
        italic: !!(flags & 1),
        items: []
      };
      i.parent.items.push(outlineItem);
      obj = outlineDict.getRaw("First");
      if (obj instanceof _primitives.Ref && !processed.has(obj)) {
        queue.push({
          obj,
          parent: outlineItem
        });
        processed.put(obj);
      }
      obj = outlineDict.getRaw("Next");
      if (obj instanceof _primitives.Ref && !processed.has(obj)) {
        queue.push({
          obj,
          parent: i.parent
        });
        processed.put(obj);
      }
    }
    return root.items.length > 0 ? root.items : null;
  }
  get permissions() {
    let permissions = null;
    try {
      permissions = this._readPermissions();
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }
      (0, _util.warn)("Unable to read permissions.");
    }
    return (0, _util.shadow)(this, "permissions", permissions);
  }
  _readPermissions() {
    const encrypt = this.xref.trailer.get("Encrypt");
    if (!(encrypt instanceof _primitives.Dict)) {
      return null;
    }
    let flags = encrypt.get("P");
    if (typeof flags !== "number") {
      return null;
    }
    flags += 2 ** 32;
    const permissions = [];
    for (const key in _util.PermissionFlag) {
      const value = _util.PermissionFlag[key];
      if (flags & value) {
        permissions.push(value);
      }
    }
    return permissions;
  }
  get optionalContentConfig() {
    let config = null;
    try {
      const properties = this._catDict.get("OCProperties");
      if (!properties) {
        return (0, _util.shadow)(this, "optionalContentConfig", null);
      }
      const defaultConfig = properties.get("D");
      if (!defaultConfig) {
        return (0, _util.shadow)(this, "optionalContentConfig", null);
      }
      const groupsData = properties.get("OCGs");
      if (!Array.isArray(groupsData)) {
        return (0, _util.shadow)(this, "optionalContentConfig", null);
      }
      const groups = [];
      const groupRefs = [];
      for (const groupRef of groupsData) {
        if (!(groupRef instanceof _primitives.Ref)) {
          continue;
        }
        groupRefs.push(groupRef);
        const group = this.xref.fetchIfRef(groupRef);
        groups.push({
          id: groupRef.toString(),
          name: typeof group.get("Name") === "string" ? (0, _util.stringToPDFString)(group.get("Name")) : null,
          intent: typeof group.get("Intent") === "string" ? (0, _util.stringToPDFString)(group.get("Intent")) : null
        });
      }
      config = this._readOptionalContentConfig(defaultConfig, groupRefs);
      config.groups = groups;
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }
      (0, _util.warn)(`Unable to read optional content config: ${ex}`);
    }
    return (0, _util.shadow)(this, "optionalContentConfig", config);
  }
  _readOptionalContentConfig(config, contentGroupRefs) {
    function parseOnOff(refs) {
      const onParsed = [];
      if (Array.isArray(refs)) {
        for (const value of refs) {
          if (!(value instanceof _primitives.Ref)) {
            continue;
          }
          if (contentGroupRefs.includes(value)) {
            onParsed.push(value.toString());
          }
        }
      }
      return onParsed;
    }
    function parseOrder(refs, nestedLevels = 0) {
      if (!Array.isArray(refs)) {
        return null;
      }
      const order = [];
      for (const value of refs) {
        if (value instanceof _primitives.Ref && contentGroupRefs.includes(value)) {
          parsedOrderRefs.put(value);
          order.push(value.toString());
          continue;
        }
        const nestedOrder = parseNestedOrder(value, nestedLevels);
        if (nestedOrder) {
          order.push(nestedOrder);
        }
      }
      if (nestedLevels > 0) {
        return order;
      }
      const hiddenGroups = [];
      for (const groupRef of contentGroupRefs) {
        if (parsedOrderRefs.has(groupRef)) {
          continue;
        }
        hiddenGroups.push(groupRef.toString());
      }
      if (hiddenGroups.length) {
        order.push({
          name: null,
          order: hiddenGroups
        });
      }
      return order;
    }
    function parseNestedOrder(ref, nestedLevels) {
      if (++nestedLevels > MAX_NESTED_LEVELS) {
        (0, _util.warn)("parseNestedOrder - reached MAX_NESTED_LEVELS.");
        return null;
      }
      const value = xref.fetchIfRef(ref);
      if (!Array.isArray(value)) {
        return null;
      }
      const nestedName = xref.fetchIfRef(value[0]);
      if (typeof nestedName !== "string") {
        return null;
      }
      const nestedOrder = parseOrder(value.slice(1), nestedLevels);
      if (!nestedOrder || !nestedOrder.length) {
        return null;
      }
      return {
        name: (0, _util.stringToPDFString)(nestedName),
        order: nestedOrder
      };
    }
    const xref = this.xref,
      parsedOrderRefs = new _primitives.RefSet(),
      MAX_NESTED_LEVELS = 10;
    return {
      name: typeof config.get("Name") === "string" ? (0, _util.stringToPDFString)(config.get("Name")) : null,
      creator: typeof config.get("Creator") === "string" ? (0, _util.stringToPDFString)(config.get("Creator")) : null,
      baseState: config.get("BaseState") instanceof _primitives.Name ? config.get("BaseState").name : null,
      on: parseOnOff(config.get("ON")),
      off: parseOnOff(config.get("OFF")),
      order: parseOrder(config.get("Order")),
      groups: null
    };
  }
  setActualNumPages(num = null) {
    this._actualNumPages = num;
  }
  get hasActualNumPages() {
    return this._actualNumPages !== null;
  }
  get _pagesCount() {
    const obj = this.toplevelPagesDict.get("Count");
    if (!Number.isInteger(obj)) {
      throw new _util.FormatError("Page count in top-level pages dictionary is not an integer.");
    }
    return (0, _util.shadow)(this, "_pagesCount", obj);
  }
  get numPages() {
    return this.hasActualNumPages ? this._actualNumPages : this._pagesCount;
  }
  get destinations() {
    const obj = this._readDests(),
      dests = Object.create(null);
    if (obj instanceof _name_number_tree.NameTree) {
      for (const [key, value] of obj.getAll()) {
        const dest = fetchDestination(value);
        if (dest) {
          dests[(0, _util.stringToPDFString)(key)] = dest;
        }
      }
    } else if (obj instanceof _primitives.Dict) {
      obj.forEach(function (key, value) {
        const dest = fetchDestination(value);
        if (dest) {
          dests[key] = dest;
        }
      });
    }
    return (0, _util.shadow)(this, "destinations", dests);
  }
  getDestination(id) {
    const obj = this._readDests();
    if (obj instanceof _name_number_tree.NameTree) {
      const dest = fetchDestination(obj.get(id));
      if (dest) {
        return dest;
      }
      const allDest = this.destinations[id];
      if (allDest) {
        (0, _util.warn)(`Found "${id}" at an incorrect position in the NameTree.`);
        return allDest;
      }
    } else if (obj instanceof _primitives.Dict) {
      const dest = fetchDestination(obj.get(id));
      if (dest) {
        return dest;
      }
    }
    return null;
  }
  _readDests() {
    const obj = this._catDict.get("Names");
    if (obj && obj.has("Dests")) {
      return new _name_number_tree.NameTree(obj.getRaw("Dests"), this.xref);
    } else if (this._catDict.has("Dests")) {
      return this._catDict.get("Dests");
    }
    return undefined;
  }
  get pageLabels() {
    let obj = null;
    try {
      obj = this._readPageLabels();
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }
      (0, _util.warn)("Unable to read page labels.");
    }
    return (0, _util.shadow)(this, "pageLabels", obj);
  }
  _readPageLabels() {
    const obj = this._catDict.getRaw("PageLabels");
    if (!obj) {
      return null;
    }
    const pageLabels = new Array(this.numPages);
    let style = null,
      prefix = "";
    const numberTree = new _name_number_tree.NumberTree(obj, this.xref);
    const nums = numberTree.getAll();
    let currentLabel = "",
      currentIndex = 1;
    for (let i = 0, ii = this.numPages; i < ii; i++) {
      const labelDict = nums.get(i);
      if (labelDict !== undefined) {
        if (!(labelDict instanceof _primitives.Dict)) {
          throw new _util.FormatError("PageLabel is not a dictionary.");
        }
        if (labelDict.has("Type") && !(0, _primitives.isName)(labelDict.get("Type"), "PageLabel")) {
          throw new _util.FormatError("Invalid type in PageLabel dictionary.");
        }
        if (labelDict.has("S")) {
          const s = labelDict.get("S");
          if (!(s instanceof _primitives.Name)) {
            throw new _util.FormatError("Invalid style in PageLabel dictionary.");
          }
          style = s.name;
        } else {
          style = null;
        }
        if (labelDict.has("P")) {
          const p = labelDict.get("P");
          if (typeof p !== "string") {
            throw new _util.FormatError("Invalid prefix in PageLabel dictionary.");
          }
          prefix = (0, _util.stringToPDFString)(p);
        } else {
          prefix = "";
        }
        if (labelDict.has("St")) {
          const st = labelDict.get("St");
          if (!(Number.isInteger(st) && st >= 1)) {
            throw new _util.FormatError("Invalid start in PageLabel dictionary.");
          }
          currentIndex = st;
        } else {
          currentIndex = 1;
        }
      }
      switch (style) {
        case "D":
          currentLabel = currentIndex;
          break;
        case "R":
        case "r":
          currentLabel = (0, _core_utils.toRomanNumerals)(currentIndex, style === "r");
          break;
        case "A":
        case "a":
          const LIMIT = 26;
          const A_UPPER_CASE = 0x41,
            A_LOWER_CASE = 0x61;
          const baseCharCode = style === "a" ? A_LOWER_CASE : A_UPPER_CASE;
          const letterIndex = currentIndex - 1;
          const character = String.fromCharCode(baseCharCode + letterIndex % LIMIT);
          currentLabel = character.repeat(Math.floor(letterIndex / LIMIT) + 1);
          break;
        default:
          if (style) {
            throw new _util.FormatError(`Invalid style "${style}" in PageLabel dictionary.`);
          }
          currentLabel = "";
      }
      pageLabels[i] = prefix + currentLabel;
      currentIndex++;
    }
    return pageLabels;
  }
  get pageLayout() {
    const obj = this._catDict.get("PageLayout");
    let pageLayout = "";
    if (obj instanceof _primitives.Name) {
      switch (obj.name) {
        case "SinglePage":
        case "OneColumn":
        case "TwoColumnLeft":
        case "TwoColumnRight":
        case "TwoPageLeft":
        case "TwoPageRight":
          pageLayout = obj.name;
      }
    }
    return (0, _util.shadow)(this, "pageLayout", pageLayout);
  }
  get pageMode() {
    const obj = this._catDict.get("PageMode");
    let pageMode = "UseNone";
    if (obj instanceof _primitives.Name) {
      switch (obj.name) {
        case "UseNone":
        case "UseOutlines":
        case "UseThumbs":
        case "FullScreen":
        case "UseOC":
        case "UseAttachments":
          pageMode = obj.name;
      }
    }
    return (0, _util.shadow)(this, "pageMode", pageMode);
  }
  get viewerPreferences() {
    const obj = this._catDict.get("ViewerPreferences");
    if (!(obj instanceof _primitives.Dict)) {
      return (0, _util.shadow)(this, "viewerPreferences", null);
    }
    let prefs = null;
    for (const key of obj.getKeys()) {
      const value = obj.get(key);
      let prefValue;
      switch (key) {
        case "HideToolbar":
        case "HideMenubar":
        case "HideWindowUI":
        case "FitWindow":
        case "CenterWindow":
        case "DisplayDocTitle":
        case "PickTrayByPDFSize":
          if (typeof value === "boolean") {
            prefValue = value;
          }
          break;
        case "NonFullScreenPageMode":
          if (value instanceof _primitives.Name) {
            switch (value.name) {
              case "UseNone":
              case "UseOutlines":
              case "UseThumbs":
              case "UseOC":
                prefValue = value.name;
                break;
              default:
                prefValue = "UseNone";
            }
          }
          break;
        case "Direction":
          if (value instanceof _primitives.Name) {
            switch (value.name) {
              case "L2R":
              case "R2L":
                prefValue = value.name;
                break;
              default:
                prefValue = "L2R";
            }
          }
          break;
        case "ViewArea":
        case "ViewClip":
        case "PrintArea":
        case "PrintClip":
          if (value instanceof _primitives.Name) {
            switch (value.name) {
              case "MediaBox":
              case "CropBox":
              case "BleedBox":
              case "TrimBox":
              case "ArtBox":
                prefValue = value.name;
                break;
              default:
                prefValue = "CropBox";
            }
          }
          break;
        case "PrintScaling":
          if (value instanceof _primitives.Name) {
            switch (value.name) {
              case "None":
              case "AppDefault":
                prefValue = value.name;
                break;
              default:
                prefValue = "AppDefault";
            }
          }
          break;
        case "Duplex":
          if (value instanceof _primitives.Name) {
            switch (value.name) {
              case "Simplex":
              case "DuplexFlipShortEdge":
              case "DuplexFlipLongEdge":
                prefValue = value.name;
                break;
              default:
                prefValue = "None";
            }
          }
          break;
        case "PrintPageRange":
          if (Array.isArray(value) && value.length % 2 === 0) {
            const isValid = value.every((page, i, arr) => {
              return Number.isInteger(page) && page > 0 && (i === 0 || page >= arr[i - 1]) && page <= this.numPages;
            });
            if (isValid) {
              prefValue = value;
            }
          }
          break;
        case "NumCopies":
          if (Number.isInteger(value) && value > 0) {
            prefValue = value;
          }
          break;
        default:
          (0, _util.warn)(`Ignoring non-standard key in ViewerPreferences: ${key}.`);
          continue;
      }
      if (prefValue === undefined) {
        (0, _util.warn)(`Bad value, for key "${key}", in ViewerPreferences: ${value}.`);
        continue;
      }
      if (!prefs) {
        prefs = Object.create(null);
      }
      prefs[key] = prefValue;
    }
    return (0, _util.shadow)(this, "viewerPreferences", prefs);
  }
  get openAction() {
    const obj = this._catDict.get("OpenAction");
    const openAction = Object.create(null);
    if (obj instanceof _primitives.Dict) {
      const destDict = new _primitives.Dict(this.xref);
      destDict.set("A", obj);
      const resultObj = {
        url: null,
        dest: null,
        action: null
      };
      Catalog.parseDestDictionary({
        destDict,
        resultObj
      });
      if (Array.isArray(resultObj.dest)) {
        openAction.dest = resultObj.dest;
      } else if (resultObj.action) {
        openAction.action = resultObj.action;
      }
    } else if (Array.isArray(obj)) {
      openAction.dest = obj;
    }
    return (0, _util.shadow)(this, "openAction", (0, _util.objectSize)(openAction) > 0 ? openAction : null);
  }
  get attachments() {
    const obj = this._catDict.get("Names");
    let attachments = null;
    if (obj instanceof _primitives.Dict && obj.has("EmbeddedFiles")) {
      const nameTree = new _name_number_tree.NameTree(obj.getRaw("EmbeddedFiles"), this.xref);
      for (const [key, value] of nameTree.getAll()) {
        const fs = new _file_spec.FileSpec(value, this.xref);
        if (!attachments) {
          attachments = Object.create(null);
        }
        attachments[(0, _util.stringToPDFString)(key)] = fs.serializable;
      }
    }
    return (0, _util.shadow)(this, "attachments", attachments);
  }
  get xfaImages() {
    const obj = this._catDict.get("Names");
    let xfaImages = null;
    if (obj instanceof _primitives.Dict && obj.has("XFAImages")) {
      const nameTree = new _name_number_tree.NameTree(obj.getRaw("XFAImages"), this.xref);
      for (const [key, value] of nameTree.getAll()) {
        if (!xfaImages) {
          xfaImages = new _primitives.Dict(this.xref);
        }
        xfaImages.set((0, _util.stringToPDFString)(key), value);
      }
    }
    return (0, _util.shadow)(this, "xfaImages", xfaImages);
  }
  _collectJavaScript() {
    const obj = this._catDict.get("Names");
    let javaScript = null;
    function appendIfJavaScriptDict(name, jsDict) {
      if (!(jsDict instanceof _primitives.Dict)) {
        return;
      }
      if (!(0, _primitives.isName)(jsDict.get("S"), "JavaScript")) {
        return;
      }
      let js = jsDict.get("JS");
      if (js instanceof _base_stream.BaseStream) {
        js = js.getString();
      } else if (typeof js !== "string") {
        return;
      }
      if (javaScript === null) {
        javaScript = new Map();
      }
      js = (0, _util.stringToPDFString)(js).replace(/\u0000/g, "");
      javaScript.set(name, js);
    }
    if (obj instanceof _primitives.Dict && obj.has("JavaScript")) {
      const nameTree = new _name_number_tree.NameTree(obj.getRaw("JavaScript"), this.xref);
      for (const [key, value] of nameTree.getAll()) {
        appendIfJavaScriptDict((0, _util.stringToPDFString)(key), value);
      }
    }
    const openAction = this._catDict.get("OpenAction");
    if (openAction) {
      appendIfJavaScriptDict("OpenAction", openAction);
    }
    return javaScript;
  }
  get javaScript() {
    const javaScript = this._collectJavaScript();
    return (0, _util.shadow)(this, "javaScript", javaScript ? [...javaScript.values()] : null);
  }
  get jsActions() {
    const javaScript = this._collectJavaScript();
    let actions = (0, _core_utils.collectActions)(this.xref, this._catDict, _util.DocumentActionEventType);
    if (javaScript) {
      if (!actions) {
        actions = Object.create(null);
      }
      for (const [key, val] of javaScript) {
        if (key in actions) {
          actions[key].push(val);
        } else {
          actions[key] = [val];
        }
      }
    }
    return (0, _util.shadow)(this, "jsActions", actions);
  }
  async fontFallback(id, handler) {
    const translatedFonts = await Promise.all(this.fontCache);
    for (const translatedFont of translatedFonts) {
      if (translatedFont.loadedName === id) {
        translatedFont.fallback(handler);
        return;
      }
    }
  }
  async cleanup(manuallyTriggered = false) {
    (0, _cleanup_helper.clearGlobalCaches)();
    this.globalImageCache.clear(manuallyTriggered);
    this.pageKidsCountCache.clear();
    this.pageIndexCache.clear();
    this.nonBlendModesSet.clear();
    const translatedFonts = await Promise.all(this.fontCache);
    for (const {
      dict
    } of translatedFonts) {
      delete dict.cacheKey;
    }
    this.fontCache.clear();
    this.builtInCMapCache.clear();
    this.standardFontDataCache.clear();
  }
  async getPageDict(pageIndex) {
    const nodesToVisit = [this.toplevelPagesDict];
    const visitedNodes = new _primitives.RefSet();
    const pagesRef = this._catDict.getRaw("Pages");
    if (pagesRef instanceof _primitives.Ref) {
      visitedNodes.put(pagesRef);
    }
    const xref = this.xref,
      pageKidsCountCache = this.pageKidsCountCache,
      pageIndexCache = this.pageIndexCache;
    let currentPageIndex = 0;
    while (nodesToVisit.length) {
      const currentNode = nodesToVisit.pop();
      if (currentNode instanceof _primitives.Ref) {
        const count = pageKidsCountCache.get(currentNode);
        if (count >= 0 && currentPageIndex + count <= pageIndex) {
          currentPageIndex += count;
          continue;
        }
        if (visitedNodes.has(currentNode)) {
          throw new _util.FormatError("Pages tree contains circular reference.");
        }
        visitedNodes.put(currentNode);
        const obj = await xref.fetchAsync(currentNode);
        if (obj instanceof _primitives.Dict) {
          let type = obj.getRaw("Type");
          if (type instanceof _primitives.Ref) {
            type = await xref.fetchAsync(type);
          }
          if ((0, _primitives.isName)(type, "Page") || !obj.has("Kids")) {
            if (!pageKidsCountCache.has(currentNode)) {
              pageKidsCountCache.put(currentNode, 1);
            }
            if (!pageIndexCache.has(currentNode)) {
              pageIndexCache.put(currentNode, currentPageIndex);
            }
            if (currentPageIndex === pageIndex) {
              return [obj, currentNode];
            }
            currentPageIndex++;
            continue;
          }
        }
        nodesToVisit.push(obj);
        continue;
      }
      if (!(currentNode instanceof _primitives.Dict)) {
        throw new _util.FormatError("Page dictionary kid reference points to wrong type of object.");
      }
      const {
        objId
      } = currentNode;
      let count = currentNode.getRaw("Count");
      if (count instanceof _primitives.Ref) {
        count = await xref.fetchAsync(count);
      }
      if (Number.isInteger(count) && count >= 0) {
        if (objId && !pageKidsCountCache.has(objId)) {
          pageKidsCountCache.put(objId, count);
        }
        if (currentPageIndex + count <= pageIndex) {
          currentPageIndex += count;
          continue;
        }
      }
      let kids = currentNode.getRaw("Kids");
      if (kids instanceof _primitives.Ref) {
        kids = await xref.fetchAsync(kids);
      }
      if (!Array.isArray(kids)) {
        let type = currentNode.getRaw("Type");
        if (type instanceof _primitives.Ref) {
          type = await xref.fetchAsync(type);
        }
        if ((0, _primitives.isName)(type, "Page") || !currentNode.has("Kids")) {
          if (currentPageIndex === pageIndex) {
            return [currentNode, null];
          }
          currentPageIndex++;
          continue;
        }
        throw new _util.FormatError("Page dictionary kids object is not an array.");
      }
      for (let last = kids.length - 1; last >= 0; last--) {
        nodesToVisit.push(kids[last]);
      }
    }
    throw new Error(`Page index ${pageIndex} not found.`);
  }
  async getAllPageDicts(recoveryMode = false) {
    const {
      ignoreErrors
    } = this.pdfManager.evaluatorOptions;
    const queue = [{
      currentNode: this.toplevelPagesDict,
      posInKids: 0
    }];
    const visitedNodes = new _primitives.RefSet();
    const pagesRef = this._catDict.getRaw("Pages");
    if (pagesRef instanceof _primitives.Ref) {
      visitedNodes.put(pagesRef);
    }
    const map = new Map(),
      xref = this.xref,
      pageIndexCache = this.pageIndexCache;
    let pageIndex = 0;
    function addPageDict(pageDict, pageRef) {
      if (pageRef && !pageIndexCache.has(pageRef)) {
        pageIndexCache.put(pageRef, pageIndex);
      }
      map.set(pageIndex++, [pageDict, pageRef]);
    }
    function addPageError(error) {
      if (error instanceof _core_utils.XRefEntryException && !recoveryMode) {
        throw error;
      }
      if (recoveryMode && ignoreErrors && pageIndex === 0) {
        (0, _util.warn)(`getAllPageDicts - Skipping invalid first page: "${error}".`);
        error = _primitives.Dict.empty;
      }
      map.set(pageIndex++, [error, null]);
    }
    while (queue.length > 0) {
      const queueItem = queue.at(-1);
      const {
        currentNode,
        posInKids
      } = queueItem;
      let kids = currentNode.getRaw("Kids");
      if (kids instanceof _primitives.Ref) {
        try {
          kids = await xref.fetchAsync(kids);
        } catch (ex) {
          addPageError(ex);
          break;
        }
      }
      if (!Array.isArray(kids)) {
        addPageError(new _util.FormatError("Page dictionary kids object is not an array."));
        break;
      }
      if (posInKids >= kids.length) {
        queue.pop();
        continue;
      }
      const kidObj = kids[posInKids];
      let obj;
      if (kidObj instanceof _primitives.Ref) {
        if (visitedNodes.has(kidObj)) {
          addPageError(new _util.FormatError("Pages tree contains circular reference."));
          break;
        }
        visitedNodes.put(kidObj);
        try {
          obj = await xref.fetchAsync(kidObj);
        } catch (ex) {
          addPageError(ex);
          break;
        }
      } else {
        obj = kidObj;
      }
      if (!(obj instanceof _primitives.Dict)) {
        addPageError(new _util.FormatError("Page dictionary kid reference points to wrong type of object."));
        break;
      }
      let type = obj.getRaw("Type");
      if (type instanceof _primitives.Ref) {
        try {
          type = await xref.fetchAsync(type);
        } catch (ex) {
          addPageError(ex);
          break;
        }
      }
      if ((0, _primitives.isName)(type, "Page") || !obj.has("Kids")) {
        addPageDict(obj, kidObj instanceof _primitives.Ref ? kidObj : null);
      } else {
        queue.push({
          currentNode: obj,
          posInKids: 0
        });
      }
      queueItem.posInKids++;
    }
    return map;
  }
  getPageIndex(pageRef) {
    const cachedPageIndex = this.pageIndexCache.get(pageRef);
    if (cachedPageIndex !== undefined) {
      return Promise.resolve(cachedPageIndex);
    }
    const xref = this.xref;
    function pagesBeforeRef(kidRef) {
      let total = 0,
        parentRef;
      return xref.fetchAsync(kidRef).then(function (node) {
        if ((0, _primitives.isRefsEqual)(kidRef, pageRef) && !(0, _primitives.isDict)(node, "Page") && !(node instanceof _primitives.Dict && !node.has("Type") && node.has("Contents"))) {
          throw new _util.FormatError("The reference does not point to a /Page dictionary.");
        }
        if (!node) {
          return null;
        }
        if (!(node instanceof _primitives.Dict)) {
          throw new _util.FormatError("Node must be a dictionary.");
        }
        parentRef = node.getRaw("Parent");
        return node.getAsync("Parent");
      }).then(function (parent) {
        if (!parent) {
          return null;
        }
        if (!(parent instanceof _primitives.Dict)) {
          throw new _util.FormatError("Parent must be a dictionary.");
        }
        return parent.getAsync("Kids");
      }).then(function (kids) {
        if (!kids) {
          return null;
        }
        const kidPromises = [];
        let found = false;
        for (const kid of kids) {
          if (!(kid instanceof _primitives.Ref)) {
            throw new _util.FormatError("Kid must be a reference.");
          }
          if ((0, _primitives.isRefsEqual)(kid, kidRef)) {
            found = true;
            break;
          }
          kidPromises.push(xref.fetchAsync(kid).then(function (obj) {
            if (!(obj instanceof _primitives.Dict)) {
              throw new _util.FormatError("Kid node must be a dictionary.");
            }
            if (obj.has("Count")) {
              total += obj.get("Count");
            } else {
              total++;
            }
          }));
        }
        if (!found) {
          throw new _util.FormatError("Kid reference not found in parent's kids.");
        }
        return Promise.all(kidPromises).then(function () {
          return [total, parentRef];
        });
      });
    }
    let total = 0;
    const next = ref => pagesBeforeRef(ref).then(args => {
      if (!args) {
        this.pageIndexCache.put(pageRef, total);
        return total;
      }
      const [count, parentRef] = args;
      total += count;
      return next(parentRef);
    });
    return next(pageRef);
  }
  get baseUrl() {
    const uri = this._catDict.get("URI");
    if (uri instanceof _primitives.Dict) {
      const base = uri.get("Base");
      if (typeof base === "string") {
        const absoluteUrl = (0, _util.createValidAbsoluteUrl)(base, null, {
          tryConvertEncoding: true
        });
        if (absoluteUrl) {
          return (0, _util.shadow)(this, "baseUrl", absoluteUrl.href);
        }
      }
    }
    return (0, _util.shadow)(this, "baseUrl", null);
  }
  static parseDestDictionary(params) {
    const destDict = params.destDict;
    if (!(destDict instanceof _primitives.Dict)) {
      (0, _util.warn)("parseDestDictionary: `destDict` must be a dictionary.");
      return;
    }
    const resultObj = params.resultObj;
    if (typeof resultObj !== "object") {
      (0, _util.warn)("parseDestDictionary: `resultObj` must be an object.");
      return;
    }
    const docBaseUrl = params.docBaseUrl || null;
    const docAttachments = params.docAttachments || null;
    let action = destDict.get("A"),
      url,
      dest;
    if (!(action instanceof _primitives.Dict)) {
      if (destDict.has("Dest")) {
        action = destDict.get("Dest");
      } else {
        action = destDict.get("AA");
        if (action instanceof _primitives.Dict) {
          if (action.has("D")) {
            action = action.get("D");
          } else if (action.has("U")) {
            action = action.get("U");
          }
        }
      }
    }
    if (action instanceof _primitives.Dict) {
      const actionType = action.get("S");
      if (!(actionType instanceof _primitives.Name)) {
        (0, _util.warn)("parseDestDictionary: Invalid type in Action dictionary.");
        return;
      }
      const actionName = actionType.name;
      switch (actionName) {
        case "ResetForm":
          const flags = action.get("Flags");
          const include = ((typeof flags === "number" ? flags : 0) & 1) === 0;
          const fields = [];
          const refs = [];
          for (const obj of action.get("Fields") || []) {
            if (obj instanceof _primitives.Ref) {
              refs.push(obj.toString());
            } else if (typeof obj === "string") {
              fields.push((0, _util.stringToPDFString)(obj));
            }
          }
          resultObj.resetForm = {
            fields,
            refs,
            include
          };
          break;
        case "URI":
          url = action.get("URI");
          if (url instanceof _primitives.Name) {
            url = "/" + url.name;
          }
          break;
        case "GoTo":
          dest = action.get("D");
          break;
        case "Launch":
        case "GoToR":
          const urlDict = action.get("F");
          if (urlDict instanceof _primitives.Dict) {
            url = urlDict.get("F") || null;
          } else if (typeof urlDict === "string") {
            url = urlDict;
          }
          let remoteDest = action.get("D");
          if (remoteDest) {
            if (remoteDest instanceof _primitives.Name) {
              remoteDest = remoteDest.name;
            }
            if (typeof url === "string") {
              const baseUrl = url.split("#")[0];
              if (typeof remoteDest === "string") {
                url = baseUrl + "#" + remoteDest;
              } else if (Array.isArray(remoteDest)) {
                url = baseUrl + "#" + JSON.stringify(remoteDest);
              }
            }
          }
          const newWindow = action.get("NewWindow");
          if (typeof newWindow === "boolean") {
            resultObj.newWindow = newWindow;
          }
          break;
        case "GoToE":
          const target = action.get("T");
          let attachment;
          if (docAttachments && target instanceof _primitives.Dict) {
            const relationship = target.get("R");
            const name = target.get("N");
            if ((0, _primitives.isName)(relationship, "C") && typeof name === "string") {
              attachment = docAttachments[(0, _util.stringToPDFString)(name)];
            }
          }
          if (attachment) {
            resultObj.attachment = attachment;
          } else {
            (0, _util.warn)(`parseDestDictionary - unimplemented "GoToE" action.`);
          }
          break;
        case "Named":
          const namedAction = action.get("N");
          if (namedAction instanceof _primitives.Name) {
            resultObj.action = namedAction.name;
          }
          break;
        case "SetOCGState":
          const state = action.get("State");
          const preserveRB = action.get("PreserveRB");
          if (!Array.isArray(state) || state.length === 0) {
            break;
          }
          const stateArr = [];
          for (const elem of state) {
            if (elem instanceof _primitives.Name) {
              switch (elem.name) {
                case "ON":
                case "OFF":
                case "Toggle":
                  stateArr.push(elem.name);
                  break;
              }
            } else if (elem instanceof _primitives.Ref) {
              stateArr.push(elem.toString());
            }
          }
          if (stateArr.length !== state.length) {
            break;
          }
          resultObj.setOCGState = {
            state: stateArr,
            preserveRB: typeof preserveRB === "boolean" ? preserveRB : true
          };
          break;
        case "JavaScript":
          const jsAction = action.get("JS");
          let js;
          if (jsAction instanceof _base_stream.BaseStream) {
            js = jsAction.getString();
          } else if (typeof jsAction === "string") {
            js = jsAction;
          }
          const jsURL = js && (0, _core_utils.recoverJsURL)((0, _util.stringToPDFString)(js));
          if (jsURL) {
            url = jsURL.url;
            resultObj.newWindow = jsURL.newWindow;
            break;
          }
        default:
          if (actionName === "JavaScript" || actionName === "SubmitForm") {
            break;
          }
          (0, _util.warn)(`parseDestDictionary - unsupported action: "${actionName}".`);
          break;
      }
    } else if (destDict.has("Dest")) {
      dest = destDict.get("Dest");
    }
    if (typeof url === "string") {
      const absoluteUrl = (0, _util.createValidAbsoluteUrl)(url, docBaseUrl, {
        addDefaultProtocol: true,
        tryConvertEncoding: true
      });
      if (absoluteUrl) {
        resultObj.url = absoluteUrl.href;
      }
      resultObj.unsafeUrl = url;
    }
    if (dest) {
      if (dest instanceof _primitives.Name) {
        dest = dest.name;
      }
      if (typeof dest === "string") {
        resultObj.dest = (0, _util.stringToPDFString)(dest);
      } else if (Array.isArray(dest)) {
        resultObj.dest = dest;
      }
    }
  }
}
exports.Catalog = Catalog;