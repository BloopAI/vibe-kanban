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
exports.LocaleSetNamespace = void 0;
var _namespaces = require("./namespaces.js");
var _xfa_object = require("./xfa_object.js");
var _utils = require("./utils.js");
const LOCALE_SET_NS_ID = _namespaces.NamespaceIds.localeSet.id;
class CalendarSymbols extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "calendarSymbols", true);
    this.name = "gregorian";
    this.dayNames = new _xfa_object.XFAObjectArray(2);
    this.eraNames = null;
    this.meridiemNames = null;
    this.monthNames = new _xfa_object.XFAObjectArray(2);
  }
}
class CurrencySymbol extends _xfa_object.StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "currencySymbol");
    this.name = (0, _utils.getStringOption)(attributes.name, ["symbol", "isoname", "decimal"]);
  }
}
class CurrencySymbols extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "currencySymbols", true);
    this.currencySymbol = new _xfa_object.XFAObjectArray(3);
  }
}
class DatePattern extends _xfa_object.StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "datePattern");
    this.name = (0, _utils.getStringOption)(attributes.name, ["full", "long", "med", "short"]);
  }
}
class DatePatterns extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "datePatterns", true);
    this.datePattern = new _xfa_object.XFAObjectArray(4);
  }
}
class DateTimeSymbols extends _xfa_object.ContentObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "dateTimeSymbols");
  }
}
class Day extends _xfa_object.StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "day");
  }
}
class DayNames extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "dayNames", true);
    this.abbr = (0, _utils.getInteger)({
      data: attributes.abbr,
      defaultValue: 0,
      validate: x => x === 1
    });
    this.day = new _xfa_object.XFAObjectArray(7);
  }
}
class Era extends _xfa_object.StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "era");
  }
}
class EraNames extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "eraNames", true);
    this.era = new _xfa_object.XFAObjectArray(2);
  }
}
class Locale extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "locale", true);
    this.desc = attributes.desc || "";
    this.name = "isoname";
    this.calendarSymbols = null;
    this.currencySymbols = null;
    this.datePatterns = null;
    this.dateTimeSymbols = null;
    this.numberPatterns = null;
    this.numberSymbols = null;
    this.timePatterns = null;
    this.typeFaces = null;
  }
}
class LocaleSet extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "localeSet", true);
    this.locale = new _xfa_object.XFAObjectArray();
  }
}
class Meridiem extends _xfa_object.StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "meridiem");
  }
}
class MeridiemNames extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "meridiemNames", true);
    this.meridiem = new _xfa_object.XFAObjectArray(2);
  }
}
class Month extends _xfa_object.StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "month");
  }
}
class MonthNames extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "monthNames", true);
    this.abbr = (0, _utils.getInteger)({
      data: attributes.abbr,
      defaultValue: 0,
      validate: x => x === 1
    });
    this.month = new _xfa_object.XFAObjectArray(12);
  }
}
class NumberPattern extends _xfa_object.StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "numberPattern");
    this.name = (0, _utils.getStringOption)(attributes.name, ["full", "long", "med", "short"]);
  }
}
class NumberPatterns extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "numberPatterns", true);
    this.numberPattern = new _xfa_object.XFAObjectArray(4);
  }
}
class NumberSymbol extends _xfa_object.StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "numberSymbol");
    this.name = (0, _utils.getStringOption)(attributes.name, ["decimal", "grouping", "percent", "minus", "zero"]);
  }
}
class NumberSymbols extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "numberSymbols", true);
    this.numberSymbol = new _xfa_object.XFAObjectArray(5);
  }
}
class TimePattern extends _xfa_object.StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "timePattern");
    this.name = (0, _utils.getStringOption)(attributes.name, ["full", "long", "med", "short"]);
  }
}
class TimePatterns extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "timePatterns", true);
    this.timePattern = new _xfa_object.XFAObjectArray(4);
  }
}
class TypeFace extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "typeFace", true);
    this.name = attributes.name | "";
  }
}
class TypeFaces extends _xfa_object.XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "typeFaces", true);
    this.typeFace = new _xfa_object.XFAObjectArray();
  }
}
class LocaleSetNamespace {
  static [_namespaces.$buildXFAObject](name, attributes) {
    if (LocaleSetNamespace.hasOwnProperty(name)) {
      return LocaleSetNamespace[name](attributes);
    }
    return undefined;
  }
  static calendarSymbols(attrs) {
    return new CalendarSymbols(attrs);
  }
  static currencySymbol(attrs) {
    return new CurrencySymbol(attrs);
  }
  static currencySymbols(attrs) {
    return new CurrencySymbols(attrs);
  }
  static datePattern(attrs) {
    return new DatePattern(attrs);
  }
  static datePatterns(attrs) {
    return new DatePatterns(attrs);
  }
  static dateTimeSymbols(attrs) {
    return new DateTimeSymbols(attrs);
  }
  static day(attrs) {
    return new Day(attrs);
  }
  static dayNames(attrs) {
    return new DayNames(attrs);
  }
  static era(attrs) {
    return new Era(attrs);
  }
  static eraNames(attrs) {
    return new EraNames(attrs);
  }
  static locale(attrs) {
    return new Locale(attrs);
  }
  static localeSet(attrs) {
    return new LocaleSet(attrs);
  }
  static meridiem(attrs) {
    return new Meridiem(attrs);
  }
  static meridiemNames(attrs) {
    return new MeridiemNames(attrs);
  }
  static month(attrs) {
    return new Month(attrs);
  }
  static monthNames(attrs) {
    return new MonthNames(attrs);
  }
  static numberPattern(attrs) {
    return new NumberPattern(attrs);
  }
  static numberPatterns(attrs) {
    return new NumberPatterns(attrs);
  }
  static numberSymbol(attrs) {
    return new NumberSymbol(attrs);
  }
  static numberSymbols(attrs) {
    return new NumberSymbols(attrs);
  }
  static timePattern(attrs) {
    return new TimePattern(attrs);
  }
  static timePatterns(attrs) {
    return new TimePatterns(attrs);
  }
  static typeFace(attrs) {
    return new TypeFace(attrs);
  }
  static typeFaces(attrs) {
    return new TypeFaces(attrs);
  }
}
exports.LocaleSetNamespace = LocaleSetNamespace;