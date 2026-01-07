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
exports.getXfaFontDict = getXfaFontDict;
exports.getXfaFontName = getXfaFontName;
var _calibri_factors = require("./calibri_factors.js");
var _primitives = require("./primitives.js");
var _helvetica_factors = require("./helvetica_factors.js");
var _liberationsans_widths = require("./liberationsans_widths.js");
var _myriadpro_factors = require("./myriadpro_factors.js");
var _segoeui_factors = require("./segoeui_factors.js");
var _core_utils = require("./core_utils.js");
var _fonts_utils = require("./fonts_utils.js");
const getXFAFontMap = (0, _core_utils.getLookupTableFactory)(function (t) {
  t["MyriadPro-Regular"] = t["PdfJS-Fallback-Regular"] = {
    name: "LiberationSans-Regular",
    factors: _myriadpro_factors.MyriadProRegularFactors,
    baseWidths: _liberationsans_widths.LiberationSansRegularWidths,
    baseMapping: _liberationsans_widths.LiberationSansRegularMapping,
    metrics: _myriadpro_factors.MyriadProRegularMetrics
  };
  t["MyriadPro-Bold"] = t["PdfJS-Fallback-Bold"] = {
    name: "LiberationSans-Bold",
    factors: _myriadpro_factors.MyriadProBoldFactors,
    baseWidths: _liberationsans_widths.LiberationSansBoldWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldMapping,
    metrics: _myriadpro_factors.MyriadProBoldMetrics
  };
  t["MyriadPro-It"] = t["MyriadPro-Italic"] = t["PdfJS-Fallback-Italic"] = {
    name: "LiberationSans-Italic",
    factors: _myriadpro_factors.MyriadProItalicFactors,
    baseWidths: _liberationsans_widths.LiberationSansItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansItalicMapping,
    metrics: _myriadpro_factors.MyriadProItalicMetrics
  };
  t["MyriadPro-BoldIt"] = t["MyriadPro-BoldItalic"] = t["PdfJS-Fallback-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: _myriadpro_factors.MyriadProBoldItalicFactors,
    baseWidths: _liberationsans_widths.LiberationSansBoldItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldItalicMapping,
    metrics: _myriadpro_factors.MyriadProBoldItalicMetrics
  };
  t.ArialMT = t.Arial = t["Arial-Regular"] = {
    name: "LiberationSans-Regular",
    baseWidths: _liberationsans_widths.LiberationSansRegularWidths,
    baseMapping: _liberationsans_widths.LiberationSansRegularMapping
  };
  t["Arial-BoldMT"] = t["Arial-Bold"] = {
    name: "LiberationSans-Bold",
    baseWidths: _liberationsans_widths.LiberationSansBoldWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldMapping
  };
  t["Arial-ItalicMT"] = t["Arial-Italic"] = {
    name: "LiberationSans-Italic",
    baseWidths: _liberationsans_widths.LiberationSansItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansItalicMapping
  };
  t["Arial-BoldItalicMT"] = t["Arial-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    baseWidths: _liberationsans_widths.LiberationSansBoldItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldItalicMapping
  };
  t["Calibri-Regular"] = {
    name: "LiberationSans-Regular",
    factors: _calibri_factors.CalibriRegularFactors,
    baseWidths: _liberationsans_widths.LiberationSansRegularWidths,
    baseMapping: _liberationsans_widths.LiberationSansRegularMapping,
    metrics: _calibri_factors.CalibriRegularMetrics
  };
  t["Calibri-Bold"] = {
    name: "LiberationSans-Bold",
    factors: _calibri_factors.CalibriBoldFactors,
    baseWidths: _liberationsans_widths.LiberationSansBoldWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldMapping,
    metrics: _calibri_factors.CalibriBoldMetrics
  };
  t["Calibri-Italic"] = {
    name: "LiberationSans-Italic",
    factors: _calibri_factors.CalibriItalicFactors,
    baseWidths: _liberationsans_widths.LiberationSansItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansItalicMapping,
    metrics: _calibri_factors.CalibriItalicMetrics
  };
  t["Calibri-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: _calibri_factors.CalibriBoldItalicFactors,
    baseWidths: _liberationsans_widths.LiberationSansBoldItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldItalicMapping,
    metrics: _calibri_factors.CalibriBoldItalicMetrics
  };
  t["Segoeui-Regular"] = {
    name: "LiberationSans-Regular",
    factors: _segoeui_factors.SegoeuiRegularFactors,
    baseWidths: _liberationsans_widths.LiberationSansRegularWidths,
    baseMapping: _liberationsans_widths.LiberationSansRegularMapping,
    metrics: _segoeui_factors.SegoeuiRegularMetrics
  };
  t["Segoeui-Bold"] = {
    name: "LiberationSans-Bold",
    factors: _segoeui_factors.SegoeuiBoldFactors,
    baseWidths: _liberationsans_widths.LiberationSansBoldWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldMapping,
    metrics: _segoeui_factors.SegoeuiBoldMetrics
  };
  t["Segoeui-Italic"] = {
    name: "LiberationSans-Italic",
    factors: _segoeui_factors.SegoeuiItalicFactors,
    baseWidths: _liberationsans_widths.LiberationSansItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansItalicMapping,
    metrics: _segoeui_factors.SegoeuiItalicMetrics
  };
  t["Segoeui-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: _segoeui_factors.SegoeuiBoldItalicFactors,
    baseWidths: _liberationsans_widths.LiberationSansBoldItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldItalicMapping,
    metrics: _segoeui_factors.SegoeuiBoldItalicMetrics
  };
  t["Helvetica-Regular"] = t.Helvetica = {
    name: "LiberationSans-Regular",
    factors: _helvetica_factors.HelveticaRegularFactors,
    baseWidths: _liberationsans_widths.LiberationSansRegularWidths,
    baseMapping: _liberationsans_widths.LiberationSansRegularMapping,
    metrics: _helvetica_factors.HelveticaRegularMetrics
  };
  t["Helvetica-Bold"] = {
    name: "LiberationSans-Bold",
    factors: _helvetica_factors.HelveticaBoldFactors,
    baseWidths: _liberationsans_widths.LiberationSansBoldWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldMapping,
    metrics: _helvetica_factors.HelveticaBoldMetrics
  };
  t["Helvetica-Italic"] = {
    name: "LiberationSans-Italic",
    factors: _helvetica_factors.HelveticaItalicFactors,
    baseWidths: _liberationsans_widths.LiberationSansItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansItalicMapping,
    metrics: _helvetica_factors.HelveticaItalicMetrics
  };
  t["Helvetica-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: _helvetica_factors.HelveticaBoldItalicFactors,
    baseWidths: _liberationsans_widths.LiberationSansBoldItalicWidths,
    baseMapping: _liberationsans_widths.LiberationSansBoldItalicMapping,
    metrics: _helvetica_factors.HelveticaBoldItalicMetrics
  };
});
function getXfaFontName(name) {
  const fontName = (0, _fonts_utils.normalizeFontName)(name);
  const fontMap = getXFAFontMap();
  return fontMap[fontName];
}
function getXfaFontWidths(name) {
  const info = getXfaFontName(name);
  if (!info) {
    return null;
  }
  const {
    baseWidths,
    baseMapping,
    factors
  } = info;
  let rescaledBaseWidths;
  if (!factors) {
    rescaledBaseWidths = baseWidths;
  } else {
    rescaledBaseWidths = baseWidths.map((w, i) => w * factors[i]);
  }
  let currentCode = -2;
  let currentArray;
  const newWidths = [];
  for (const [unicode, glyphIndex] of baseMapping.map((charUnicode, index) => [charUnicode, index]).sort(([unicode1], [unicode2]) => unicode1 - unicode2)) {
    if (unicode === -1) {
      continue;
    }
    if (unicode === currentCode + 1) {
      currentArray.push(rescaledBaseWidths[glyphIndex]);
      currentCode += 1;
    } else {
      currentCode = unicode;
      currentArray = [rescaledBaseWidths[glyphIndex]];
      newWidths.push(unicode, currentArray);
    }
  }
  return newWidths;
}
function getXfaFontDict(name) {
  const widths = getXfaFontWidths(name);
  const dict = new _primitives.Dict(null);
  dict.set("BaseFont", _primitives.Name.get(name));
  dict.set("Type", _primitives.Name.get("Font"));
  dict.set("Subtype", _primitives.Name.get("CIDFontType2"));
  dict.set("Encoding", _primitives.Name.get("Identity-H"));
  dict.set("CIDToGIDMap", _primitives.Name.get("Identity"));
  dict.set("W", widths);
  dict.set("FirstChar", widths[0]);
  dict.set("LastChar", widths.at(-2) + widths.at(-1).length - 1);
  const descriptor = new _primitives.Dict(null);
  dict.set("FontDescriptor", descriptor);
  const systemInfo = new _primitives.Dict(null);
  systemInfo.set("Ordering", "Identity");
  systemInfo.set("Registry", "Adobe");
  systemInfo.set("Supplement", 0);
  dict.set("CIDSystemInfo", systemInfo);
  return dict;
}