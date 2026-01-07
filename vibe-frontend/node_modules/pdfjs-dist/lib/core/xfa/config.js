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
exports.ConfigNamespace = void 0;
var _namespaces = require("./namespaces.js");
var _xfa_object = require("./xfa_object.js");
var _utils = require("./utils.js");
var _util = require("../../shared/util.js");
const CONFIG_NS_ID = _namespaces.NamespaceIds.config.id;
class Acrobat extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "acrobat", true);
    this.acrobat7 = null;
    this.autoSave = null;
    this.common = null;
    this.validate = null;
    this.validateApprovalSignatures = null;
    this.submitUrl = new _xfa_object.XFAObjectArray();
  }
}
class Acrobat7 extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "acrobat7", true);
    this.dynamicRender = null;
  }
}
class ADBE_JSConsole extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "ADBE_JSConsole", ["delegate", "Enable", "Disable"]);
  }
}
class ADBE_JSDebugger extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "ADBE_JSDebugger", ["delegate", "Enable", "Disable"]);
  }
}
class AddSilentPrint extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "addSilentPrint");
  }
}
class AddViewerPreferences extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "addViewerPreferences");
  }
}
class AdjustData extends _xfa_object.Option10 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "adjustData");
  }
}
class AdobeExtensionLevel extends _xfa_object.IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "adobeExtensionLevel", 0, n => n >= 1 && n <= 8);
  }
}
class Agent extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "agent", true);
    this.name = attributes.name ? attributes.name.trim() : "";
    this.common = new _xfa_object.XFAObjectArray();
  }
}
class AlwaysEmbed extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "alwaysEmbed");
  }
}
class Amd extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "amd");
  }
}
class Area extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "area");
    this.level = (0, _utils.getInteger)({
      data: attributes.level,
      defaultValue: 0,
      validate: n => n >= 1 && n <= 3
    });
    this.name = (0, _utils.getStringOption)(attributes.name, ["", "barcode", "coreinit", "deviceDriver", "font", "general", "layout", "merge", "script", "signature", "sourceSet", "templateCache"]);
  }
}
class Attributes extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "attributes", ["preserve", "delegate", "ignore"]);
  }
}
class AutoSave extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "autoSave", ["disabled", "enabled"]);
  }
}
class Base extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "base");
  }
}
class BatchOutput extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "batchOutput");
    this.format = (0, _utils.getStringOption)(attributes.format, ["none", "concat", "zip", "zipCompress"]);
  }
}
class BehaviorOverride extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "behaviorOverride");
  }
  [_xfa_object.$finalize]() {
    this[_xfa_object.$content] = new Map(this[_xfa_object.$content].trim().split(/\s+/).filter(x => x.includes(":")).map(x => x.split(":", 2)));
  }
}
class Cache extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "cache", true);
    this.templateCache = null;
  }
}
class Change extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "change");
  }
}
class Common extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "common", true);
    this.data = null;
    this.locale = null;
    this.localeSet = null;
    this.messaging = null;
    this.suppressBanner = null;
    this.template = null;
    this.validationMessaging = null;
    this.versionControl = null;
    this.log = new _xfa_object.XFAObjectArray();
  }
}
class Compress extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "compress");
    this.scope = (0, _utils.getStringOption)(attributes.scope, ["imageOnly", "document"]);
  }
}
class CompressLogicalStructure extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "compressLogicalStructure");
  }
}
class CompressObjectStream extends _xfa_object.Option10 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "compressObjectStream");
  }
}
class Compression extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "compression", true);
    this.compressLogicalStructure = null;
    this.compressObjectStream = null;
    this.level = null;
    this.type = null;
  }
}
class Config extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "config", true);
    this.acrobat = null;
    this.present = null;
    this.trace = null;
    this.agent = new _xfa_object.XFAObjectArray();
  }
}
class Conformance extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "conformance", ["A", "B"]);
  }
}
class ContentCopy extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "contentCopy");
  }
}
class Copies extends _xfa_object.IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "copies", 1, n => n >= 1);
  }
}
class Creator extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "creator");
  }
}
class CurrentPage extends _xfa_object.IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "currentPage", 0, n => n >= 0);
  }
}
class Data extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "data", true);
    this.adjustData = null;
    this.attributes = null;
    this.incrementalLoad = null;
    this.outputXSL = null;
    this.range = null;
    this.record = null;
    this.startNode = null;
    this.uri = null;
    this.window = null;
    this.xsl = null;
    this.excludeNS = new _xfa_object.XFAObjectArray();
    this.transform = new _xfa_object.XFAObjectArray();
  }
}
class Debug extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "debug", true);
    this.uri = null;
  }
}
class DefaultTypeface extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "defaultTypeface");
    this.writingScript = (0, _utils.getStringOption)(attributes.writingScript, ["*", "Arabic", "Cyrillic", "EastEuropeanRoman", "Greek", "Hebrew", "Japanese", "Korean", "Roman", "SimplifiedChinese", "Thai", "TraditionalChinese", "Vietnamese"]);
  }
}
class Destination extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "destination", ["pdf", "pcl", "ps", "webClient", "zpl"]);
  }
}
class DocumentAssembly extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "documentAssembly");
  }
}
class Driver extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "driver", true);
    this.name = attributes.name ? attributes.name.trim() : "";
    this.fontInfo = null;
    this.xdc = null;
  }
}
class DuplexOption extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "duplexOption", ["simplex", "duplexFlipLongEdge", "duplexFlipShortEdge"]);
  }
}
class DynamicRender extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "dynamicRender", ["forbidden", "required"]);
  }
}
class Embed extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "embed");
  }
}
class Encrypt extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "encrypt");
  }
}
class Encryption extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "encryption", true);
    this.encrypt = null;
    this.encryptionLevel = null;
    this.permissions = null;
  }
}
class EncryptionLevel extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "encryptionLevel", ["40bit", "128bit"]);
  }
}
class Enforce extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "enforce");
  }
}
class Equate extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "equate");
    this.force = (0, _utils.getInteger)({
      data: attributes.force,
      defaultValue: 1,
      validate: n => n === 0
    });
    this.from = attributes.from || "";
    this.to = attributes.to || "";
  }
}
class EquateRange extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "equateRange");
    this.from = attributes.from || "";
    this.to = attributes.to || "";
    this._unicodeRange = attributes.unicodeRange || "";
  }
  get unicodeRange() {
    const ranges = [];
    const unicodeRegex = /U\+([0-9a-fA-F]+)/;
    const unicodeRange = this._unicodeRange;
    for (let range of unicodeRange.split(",").map(x => x.trim()).filter(x => !!x)) {
      range = range.split("-", 2).map(x => {
        const found = x.match(unicodeRegex);
        if (!found) {
          return 0;
        }
        return parseInt(found[1], 16);
      });
      if (range.length === 1) {
        range.push(range[0]);
      }
      ranges.push(range);
    }
    return (0, _util.shadow)(this, "unicodeRange", ranges);
  }
}
class Exclude extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "exclude");
  }
  [_xfa_object.$finalize]() {
    this[_xfa_object.$content] = this[_xfa_object.$content].trim().split(/\s+/).filter(x => x && ["calculate", "close", "enter", "exit", "initialize", "ready", "validate"].includes(x));
  }
}
class ExcludeNS extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "excludeNS");
  }
}
class FlipLabel extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "flipLabel", ["usePrinterSetting", "on", "off"]);
  }
}
class FontInfo extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "fontInfo", true);
    this.embed = null;
    this.map = null;
    this.subsetBelow = null;
    this.alwaysEmbed = new _xfa_object.XFAObjectArray();
    this.defaultTypeface = new _xfa_object.XFAObjectArray();
    this.neverEmbed = new _xfa_object.XFAObjectArray();
  }
}
class FormFieldFilling extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "formFieldFilling");
  }
}
class GroupParent extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "groupParent");
  }
}
class IfEmpty extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "ifEmpty", ["dataValue", "dataGroup", "ignore", "remove"]);
  }
}
class IncludeXDPContent extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "includeXDPContent");
  }
}
class IncrementalLoad extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "incrementalLoad", ["none", "forwardOnly"]);
  }
}
class IncrementalMerge extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "incrementalMerge");
  }
}
class Interactive extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "interactive");
  }
}
class Jog extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "jog", ["usePrinterSetting", "none", "pageSet"]);
  }
}
class LabelPrinter extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "labelPrinter", true);
    this.name = (0, _utils.getStringOption)(attributes.name, ["zpl", "dpl", "ipl", "tcpl"]);
    this.batchOutput = null;
    this.flipLabel = null;
    this.fontInfo = null;
    this.xdc = null;
  }
}
class Layout extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "layout", ["paginate", "panel"]);
  }
}
class Level extends _xfa_object.IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "level", 0, n => n > 0);
  }
}
class Linearized extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "linearized");
  }
}
class Locale extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "locale");
  }
}
class LocaleSet extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "localeSet");
  }
}
class Log extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "log", true);
    this.mode = null;
    this.threshold = null;
    this.to = null;
    this.uri = null;
  }
}
class MapElement extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "map", true);
    this.equate = new _xfa_object.XFAObjectArray();
    this.equateRange = new _xfa_object.XFAObjectArray();
  }
}
class MediumInfo extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "mediumInfo", true);
    this.map = null;
  }
}
class Message extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "message", true);
    this.msgId = null;
    this.severity = null;
  }
}
class Messaging extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "messaging", true);
    this.message = new _xfa_object.XFAObjectArray();
  }
}
class Mode extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "mode", ["append", "overwrite"]);
  }
}
class ModifyAnnots extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "modifyAnnots");
  }
}
class MsgId extends _xfa_object.IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "msgId", 1, n => n >= 1);
  }
}
class NameAttr extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "nameAttr");
  }
}
class NeverEmbed extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "neverEmbed");
  }
}
class NumberOfCopies extends _xfa_object.IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "numberOfCopies", null, n => n >= 2 && n <= 5);
  }
}
class OpenAction extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "openAction", true);
    this.destination = null;
  }
}
class Output extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "output", true);
    this.to = null;
    this.type = null;
    this.uri = null;
  }
}
class OutputBin extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "outputBin");
  }
}
class OutputXSL extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "outputXSL", true);
    this.uri = null;
  }
}
class Overprint extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "overprint", ["none", "both", "draw", "field"]);
  }
}
class Packets extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "packets");
  }
  [_xfa_object.$finalize]() {
    if (this[_xfa_object.$content] === "*") {
      return;
    }
    this[_xfa_object.$content] = this[_xfa_object.$content].trim().split(/\s+/).filter(x => ["config", "datasets", "template", "xfdf", "xslt"].includes(x));
  }
}
class PageOffset extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "pageOffset");
    this.x = (0, _utils.getInteger)({
      data: attributes.x,
      defaultValue: "useXDCSetting",
      validate: n => true
    });
    this.y = (0, _utils.getInteger)({
      data: attributes.y,
      defaultValue: "useXDCSetting",
      validate: n => true
    });
  }
}
class PageRange extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "pageRange");
  }
  [_xfa_object.$finalize]() {
    const numbers = this[_xfa_object.$content].trim().split(/\s+/).map(x => parseInt(x, 10));
    const ranges = [];
    for (let i = 0, ii = numbers.length; i < ii; i += 2) {
      ranges.push(numbers.slice(i, i + 2));
    }
    this[_xfa_object.$content] = ranges;
  }
}
class Pagination extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "pagination", ["simplex", "duplexShortEdge", "duplexLongEdge"]);
  }
}
class PaginationOverride extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "paginationOverride", ["none", "forceDuplex", "forceDuplexLongEdge", "forceDuplexShortEdge", "forceSimplex"]);
  }
}
class Part extends _xfa_object.IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "part", 1, n => false);
  }
}
class Pcl extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "pcl", true);
    this.name = attributes.name || "";
    this.batchOutput = null;
    this.fontInfo = null;
    this.jog = null;
    this.mediumInfo = null;
    this.outputBin = null;
    this.pageOffset = null;
    this.staple = null;
    this.xdc = null;
  }
}
class Pdf extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "pdf", true);
    this.name = attributes.name || "";
    this.adobeExtensionLevel = null;
    this.batchOutput = null;
    this.compression = null;
    this.creator = null;
    this.encryption = null;
    this.fontInfo = null;
    this.interactive = null;
    this.linearized = null;
    this.openAction = null;
    this.pdfa = null;
    this.producer = null;
    this.renderPolicy = null;
    this.scriptModel = null;
    this.silentPrint = null;
    this.submitFormat = null;
    this.tagged = null;
    this.version = null;
    this.viewerPreferences = null;
    this.xdc = null;
  }
}
class Pdfa extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "pdfa", true);
    this.amd = null;
    this.conformance = null;
    this.includeXDPContent = null;
    this.part = null;
  }
}
class Permissions extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "permissions", true);
    this.accessibleContent = null;
    this.change = null;
    this.contentCopy = null;
    this.documentAssembly = null;
    this.formFieldFilling = null;
    this.modifyAnnots = null;
    this.plaintextMetadata = null;
    this.print = null;
    this.printHighQuality = null;
  }
}
class PickTrayByPDFSize extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "pickTrayByPDFSize");
  }
}
class Picture extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "picture");
  }
}
class PlaintextMetadata extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "plaintextMetadata");
  }
}
class Presence extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "presence", ["preserve", "dissolve", "dissolveStructure", "ignore", "remove"]);
  }
}
class Present extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "present", true);
    this.behaviorOverride = null;
    this.cache = null;
    this.common = null;
    this.copies = null;
    this.destination = null;
    this.incrementalMerge = null;
    this.layout = null;
    this.output = null;
    this.overprint = null;
    this.pagination = null;
    this.paginationOverride = null;
    this.script = null;
    this.validate = null;
    this.xdp = null;
    this.driver = new _xfa_object.XFAObjectArray();
    this.labelPrinter = new _xfa_object.XFAObjectArray();
    this.pcl = new _xfa_object.XFAObjectArray();
    this.pdf = new _xfa_object.XFAObjectArray();
    this.ps = new _xfa_object.XFAObjectArray();
    this.submitUrl = new _xfa_object.XFAObjectArray();
    this.webClient = new _xfa_object.XFAObjectArray();
    this.zpl = new _xfa_object.XFAObjectArray();
  }
}
class Print extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "print");
  }
}
class PrintHighQuality extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "printHighQuality");
  }
}
class PrintScaling extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "printScaling", ["appdefault", "noScaling"]);
  }
}
class PrinterName extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "printerName");
  }
}
class Producer extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "producer");
  }
}
class Ps extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "ps", true);
    this.name = attributes.name || "";
    this.batchOutput = null;
    this.fontInfo = null;
    this.jog = null;
    this.mediumInfo = null;
    this.outputBin = null;
    this.staple = null;
    this.xdc = null;
  }
}
class Range extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "range");
  }
  [_xfa_object.$finalize]() {
    this[_xfa_object.$content] = this[_xfa_object.$content].trim().split(/\s*,\s*/, 2).map(range => range.split("-").map(x => parseInt(x.trim(), 10))).filter(range => range.every(x => !isNaN(x))).map(range => {
      if (range.length === 1) {
        range.push(range[0]);
      }
      return range;
    });
  }
}
class Record extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "record");
  }
  [_xfa_object.$finalize]() {
    this[_xfa_object.$content] = this[_xfa_object.$content].trim();
    const n = parseInt(this[_xfa_object.$content], 10);
    if (!isNaN(n) && n >= 0) {
      this[_xfa_object.$content] = n;
    }
  }
}
class Relevant extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "relevant");
  }
  [_xfa_object.$finalize]() {
    this[_xfa_object.$content] = this[_xfa_object.$content].trim().split(/\s+/);
  }
}
class Rename extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "rename");
  }
  [_xfa_object.$finalize]() {
    this[_xfa_object.$content] = this[_xfa_object.$content].trim();
    if (this[_xfa_object.$content].toLowerCase().startsWith("xml") || new RegExp("[\\p{L}_][\\p{L}\\d._\\p{M}-]*", "u").test(this[_xfa_object.$content])) {
      (0, _util.warn)("XFA - Rename: invalid XFA name");
    }
  }
}
class RenderPolicy extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "renderPolicy", ["server", "client"]);
  }
}
class RunScripts extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "runScripts", ["both", "client", "none", "server"]);
  }
}
class Script extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "script", true);
    this.currentPage = null;
    this.exclude = null;
    this.runScripts = null;
  }
}
class ScriptModel extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "scriptModel", ["XFA", "none"]);
  }
}
class Severity extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "severity", ["ignore", "error", "information", "trace", "warning"]);
  }
}
class SilentPrint extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "silentPrint", true);
    this.addSilentPrint = null;
    this.printerName = null;
  }
}
class Staple extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "staple");
    this.mode = (0, _utils.getStringOption)(attributes.mode, ["usePrinterSetting", "on", "off"]);
  }
}
class StartNode extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "startNode");
  }
}
class StartPage extends _xfa_object.IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "startPage", 0, n => true);
  }
}
class SubmitFormat extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "submitFormat", ["html", "delegate", "fdf", "xml", "pdf"]);
  }
}
class SubmitUrl extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "submitUrl");
  }
}
class SubsetBelow extends _xfa_object.IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "subsetBelow", 100, n => n >= 0 && n <= 100);
  }
}
class SuppressBanner extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "suppressBanner");
  }
}
class Tagged extends _xfa_object.Option01 {
  constructor(attributes) {
    super(CONFIG_NS_ID, "tagged");
  }
}
class Template extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "template", true);
    this.base = null;
    this.relevant = null;
    this.startPage = null;
    this.uri = null;
    this.xsl = null;
  }
}
class Threshold extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "threshold", ["trace", "error", "information", "warning"]);
  }
}
class To extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "to", ["null", "memory", "stderr", "stdout", "system", "uri"]);
  }
}
class TemplateCache extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "templateCache");
    this.maxEntries = (0, _utils.getInteger)({
      data: attributes.maxEntries,
      defaultValue: 5,
      validate: n => n >= 0
    });
  }
}
class Trace extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "trace", true);
    this.area = new _xfa_object.XFAObjectArray();
  }
}
class Transform extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "transform", true);
    this.groupParent = null;
    this.ifEmpty = null;
    this.nameAttr = null;
    this.picture = null;
    this.presence = null;
    this.rename = null;
    this.whitespace = null;
  }
}
class Type extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "type", ["none", "ascii85", "asciiHex", "ccittfax", "flate", "lzw", "runLength", "native", "xdp", "mergedXDP"]);
  }
}
class Uri extends _xfa_object.StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "uri");
  }
}
class Validate extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "validate", ["preSubmit", "prePrint", "preExecute", "preSave"]);
  }
}
class ValidateApprovalSignatures extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "validateApprovalSignatures");
  }
  [_xfa_object.$finalize]() {
    this[_xfa_object.$content] = this[_xfa_object.$content].trim().split(/\s+/).filter(x => ["docReady", "postSign"].includes(x));
  }
}
class ValidationMessaging extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "validationMessaging", ["allMessagesIndividually", "allMessagesTogether", "firstMessageOnly", "noMessages"]);
  }
}
class Version extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "version", ["1.7", "1.6", "1.5", "1.4", "1.3", "1.2"]);
  }
}
class VersionControl extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "VersionControl");
    this.outputBelow = (0, _utils.getStringOption)(attributes.outputBelow, ["warn", "error", "update"]);
    this.sourceAbove = (0, _utils.getStringOption)(attributes.sourceAbove, ["warn", "error"]);
    this.sourceBelow = (0, _utils.getStringOption)(attributes.sourceBelow, ["update", "maintain"]);
  }
}
class ViewerPreferences extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "viewerPreferences", true);
    this.ADBE_JSConsole = null;
    this.ADBE_JSDebugger = null;
    this.addViewerPreferences = null;
    this.duplexOption = null;
    this.enforce = null;
    this.numberOfCopies = null;
    this.pageRange = null;
    this.pickTrayByPDFSize = null;
    this.printScaling = null;
  }
}
class WebClient extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "webClient", true);
    this.name = attributes.name ? attributes.name.trim() : "";
    this.fontInfo = null;
    this.xdc = null;
  }
}
class Whitespace extends _xfa_object.OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "whitespace", ["preserve", "ltrim", "normalize", "rtrim", "trim"]);
  }
}
class Window extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "window");
  }
  [_xfa_object.$finalize]() {
    const pair = this[_xfa_object.$content].trim().split(/\s*,\s*/, 2).map(x => parseInt(x, 10));
    if (pair.some(x => isNaN(x))) {
      this[_xfa_object.$content] = [0, 0];
      return;
    }
    if (pair.length === 1) {
      pair.push(pair[0]);
    }
    this[_xfa_object.$content] = pair;
  }
}
class Xdc extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "xdc", true);
    this.uri = new _xfa_object.XFAObjectArray();
    this.xsl = new _xfa_object.XFAObjectArray();
  }
}
class Xdp extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "xdp", true);
    this.packets = null;
  }
}
class Xsl extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "xsl", true);
    this.debug = null;
    this.uri = null;
  }
}
class Zpl extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "zpl", true);
    this.name = attributes.name ? attributes.name.trim() : "";
    this.batchOutput = null;
    this.flipLabel = null;
    this.fontInfo = null;
    this.xdc = null;
  }
}
class ConfigNamespace {
  static [_namespaces.$buildXFAObject](name, attributes) {
    if (ConfigNamespace.hasOwnProperty(name)) {
      return ConfigNamespace[name](attributes);
    }
    return undefined;
  }
  static acrobat(attrs) {
    return new Acrobat(attrs);
  }
  static acrobat7(attrs) {
    return new Acrobat7(attrs);
  }
  static ADBE_JSConsole(attrs) {
    return new ADBE_JSConsole(attrs);
  }
  static ADBE_JSDebugger(attrs) {
    return new ADBE_JSDebugger(attrs);
  }
  static addSilentPrint(attrs) {
    return new AddSilentPrint(attrs);
  }
  static addViewerPreferences(attrs) {
    return new AddViewerPreferences(attrs);
  }
  static adjustData(attrs) {
    return new AdjustData(attrs);
  }
  static adobeExtensionLevel(attrs) {
    return new AdobeExtensionLevel(attrs);
  }
  static agent(attrs) {
    return new Agent(attrs);
  }
  static alwaysEmbed(attrs) {
    return new AlwaysEmbed(attrs);
  }
  static amd(attrs) {
    return new Amd(attrs);
  }
  static area(attrs) {
    return new Area(attrs);
  }
  static attributes(attrs) {
    return new Attributes(attrs);
  }
  static autoSave(attrs) {
    return new AutoSave(attrs);
  }
  static base(attrs) {
    return new Base(attrs);
  }
  static batchOutput(attrs) {
    return new BatchOutput(attrs);
  }
  static behaviorOverride(attrs) {
    return new BehaviorOverride(attrs);
  }
  static cache(attrs) {
    return new Cache(attrs);
  }
  static change(attrs) {
    return new Change(attrs);
  }
  static common(attrs) {
    return new Common(attrs);
  }
  static compress(attrs) {
    return new Compress(attrs);
  }
  static compressLogicalStructure(attrs) {
    return new CompressLogicalStructure(attrs);
  }
  static compressObjectStream(attrs) {
    return new CompressObjectStream(attrs);
  }
  static compression(attrs) {
    return new Compression(attrs);
  }
  static config(attrs) {
    return new Config(attrs);
  }
  static conformance(attrs) {
    return new Conformance(attrs);
  }
  static contentCopy(attrs) {
    return new ContentCopy(attrs);
  }
  static copies(attrs) {
    return new Copies(attrs);
  }
  static creator(attrs) {
    return new Creator(attrs);
  }
  static currentPage(attrs) {
    return new CurrentPage(attrs);
  }
  static data(attrs) {
    return new Data(attrs);
  }
  static debug(attrs) {
    return new Debug(attrs);
  }
  static defaultTypeface(attrs) {
    return new DefaultTypeface(attrs);
  }
  static destination(attrs) {
    return new Destination(attrs);
  }
  static documentAssembly(attrs) {
    return new DocumentAssembly(attrs);
  }
  static driver(attrs) {
    return new Driver(attrs);
  }
  static duplexOption(attrs) {
    return new DuplexOption(attrs);
  }
  static dynamicRender(attrs) {
    return new DynamicRender(attrs);
  }
  static embed(attrs) {
    return new Embed(attrs);
  }
  static encrypt(attrs) {
    return new Encrypt(attrs);
  }
  static encryption(attrs) {
    return new Encryption(attrs);
  }
  static encryptionLevel(attrs) {
    return new EncryptionLevel(attrs);
  }
  static enforce(attrs) {
    return new Enforce(attrs);
  }
  static equate(attrs) {
    return new Equate(attrs);
  }
  static equateRange(attrs) {
    return new EquateRange(attrs);
  }
  static exclude(attrs) {
    return new Exclude(attrs);
  }
  static excludeNS(attrs) {
    return new ExcludeNS(attrs);
  }
  static flipLabel(attrs) {
    return new FlipLabel(attrs);
  }
  static fontInfo(attrs) {
    return new FontInfo(attrs);
  }
  static formFieldFilling(attrs) {
    return new FormFieldFilling(attrs);
  }
  static groupParent(attrs) {
    return new GroupParent(attrs);
  }
  static ifEmpty(attrs) {
    return new IfEmpty(attrs);
  }
  static includeXDPContent(attrs) {
    return new IncludeXDPContent(attrs);
  }
  static incrementalLoad(attrs) {
    return new IncrementalLoad(attrs);
  }
  static incrementalMerge(attrs) {
    return new IncrementalMerge(attrs);
  }
  static interactive(attrs) {
    return new Interactive(attrs);
  }
  static jog(attrs) {
    return new Jog(attrs);
  }
  static labelPrinter(attrs) {
    return new LabelPrinter(attrs);
  }
  static layout(attrs) {
    return new Layout(attrs);
  }
  static level(attrs) {
    return new Level(attrs);
  }
  static linearized(attrs) {
    return new Linearized(attrs);
  }
  static locale(attrs) {
    return new Locale(attrs);
  }
  static localeSet(attrs) {
    return new LocaleSet(attrs);
  }
  static log(attrs) {
    return new Log(attrs);
  }
  static map(attrs) {
    return new MapElement(attrs);
  }
  static mediumInfo(attrs) {
    return new MediumInfo(attrs);
  }
  static message(attrs) {
    return new Message(attrs);
  }
  static messaging(attrs) {
    return new Messaging(attrs);
  }
  static mode(attrs) {
    return new Mode(attrs);
  }
  static modifyAnnots(attrs) {
    return new ModifyAnnots(attrs);
  }
  static msgId(attrs) {
    return new MsgId(attrs);
  }
  static nameAttr(attrs) {
    return new NameAttr(attrs);
  }
  static neverEmbed(attrs) {
    return new NeverEmbed(attrs);
  }
  static numberOfCopies(attrs) {
    return new NumberOfCopies(attrs);
  }
  static openAction(attrs) {
    return new OpenAction(attrs);
  }
  static output(attrs) {
    return new Output(attrs);
  }
  static outputBin(attrs) {
    return new OutputBin(attrs);
  }
  static outputXSL(attrs) {
    return new OutputXSL(attrs);
  }
  static overprint(attrs) {
    return new Overprint(attrs);
  }
  static packets(attrs) {
    return new Packets(attrs);
  }
  static pageOffset(attrs) {
    return new PageOffset(attrs);
  }
  static pageRange(attrs) {
    return new PageRange(attrs);
  }
  static pagination(attrs) {
    return new Pagination(attrs);
  }
  static paginationOverride(attrs) {
    return new PaginationOverride(attrs);
  }
  static part(attrs) {
    return new Part(attrs);
  }
  static pcl(attrs) {
    return new Pcl(attrs);
  }
  static pdf(attrs) {
    return new Pdf(attrs);
  }
  static pdfa(attrs) {
    return new Pdfa(attrs);
  }
  static permissions(attrs) {
    return new Permissions(attrs);
  }
  static pickTrayByPDFSize(attrs) {
    return new PickTrayByPDFSize(attrs);
  }
  static picture(attrs) {
    return new Picture(attrs);
  }
  static plaintextMetadata(attrs) {
    return new PlaintextMetadata(attrs);
  }
  static presence(attrs) {
    return new Presence(attrs);
  }
  static present(attrs) {
    return new Present(attrs);
  }
  static print(attrs) {
    return new Print(attrs);
  }
  static printHighQuality(attrs) {
    return new PrintHighQuality(attrs);
  }
  static printScaling(attrs) {
    return new PrintScaling(attrs);
  }
  static printerName(attrs) {
    return new PrinterName(attrs);
  }
  static producer(attrs) {
    return new Producer(attrs);
  }
  static ps(attrs) {
    return new Ps(attrs);
  }
  static range(attrs) {
    return new Range(attrs);
  }
  static record(attrs) {
    return new Record(attrs);
  }
  static relevant(attrs) {
    return new Relevant(attrs);
  }
  static rename(attrs) {
    return new Rename(attrs);
  }
  static renderPolicy(attrs) {
    return new RenderPolicy(attrs);
  }
  static runScripts(attrs) {
    return new RunScripts(attrs);
  }
  static script(attrs) {
    return new Script(attrs);
  }
  static scriptModel(attrs) {
    return new ScriptModel(attrs);
  }
  static severity(attrs) {
    return new Severity(attrs);
  }
  static silentPrint(attrs) {
    return new SilentPrint(attrs);
  }
  static staple(attrs) {
    return new Staple(attrs);
  }
  static startNode(attrs) {
    return new StartNode(attrs);
  }
  static startPage(attrs) {
    return new StartPage(attrs);
  }
  static submitFormat(attrs) {
    return new SubmitFormat(attrs);
  }
  static submitUrl(attrs) {
    return new SubmitUrl(attrs);
  }
  static subsetBelow(attrs) {
    return new SubsetBelow(attrs);
  }
  static suppressBanner(attrs) {
    return new SuppressBanner(attrs);
  }
  static tagged(attrs) {
    return new Tagged(attrs);
  }
  static template(attrs) {
    return new Template(attrs);
  }
  static templateCache(attrs) {
    return new TemplateCache(attrs);
  }
  static threshold(attrs) {
    return new Threshold(attrs);
  }
  static to(attrs) {
    return new To(attrs);
  }
  static trace(attrs) {
    return new Trace(attrs);
  }
  static transform(attrs) {
    return new Transform(attrs);
  }
  static type(attrs) {
    return new Type(attrs);
  }
  static uri(attrs) {
    return new Uri(attrs);
  }
  static validate(attrs) {
    return new Validate(attrs);
  }
  static validateApprovalSignatures(attrs) {
    return new ValidateApprovalSignatures(attrs);
  }
  static validationMessaging(attrs) {
    return new ValidationMessaging(attrs);
  }
  static version(attrs) {
    return new Version(attrs);
  }
  static versionControl(attrs) {
    return new VersionControl(attrs);
  }
  static viewerPreferences(attrs) {
    return new ViewerPreferences(attrs);
  }
  static webClient(attrs) {
    return new WebClient(attrs);
  }
  static whitespace(attrs) {
    return new Whitespace(attrs);
  }
  static window(attrs) {
    return new Window(attrs);
  }
  static xdc(attrs) {
    return new Xdc(attrs);
  }
  static xdp(attrs) {
    return new Xdp(attrs);
  }
  static xsl(attrs) {
    return new Xsl(attrs);
  }
  static zpl(attrs) {
    return new Zpl(attrs);
  }
}
exports.ConfigNamespace = ConfigNamespace;