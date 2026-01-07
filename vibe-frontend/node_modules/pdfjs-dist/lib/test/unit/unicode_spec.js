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

var _unicode = require("../../core/unicode.js");
var _glyphlist = require("../../core/glyphlist.js");
describe("unicode", function () {
  describe("mapSpecialUnicodeValues", function () {
    it("should not re-map normal Unicode values", function () {
      expect((0, _unicode.mapSpecialUnicodeValues)(0x0041)).toEqual(0x0041);
      expect((0, _unicode.mapSpecialUnicodeValues)(0xfb01)).toEqual(0xfb01);
    });
    it("should re-map special Unicode values", function () {
      expect((0, _unicode.mapSpecialUnicodeValues)(0xf8e9)).toEqual(0x00a9);
      expect((0, _unicode.mapSpecialUnicodeValues)(0xffff)).toEqual(0);
    });
  });
  describe("getCharUnicodeCategory", function () {
    it("should correctly determine the character category", function () {
      const tests = {
        " ": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: true
        },
        "\t": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: true
        },
        "\u2001": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: true
        },
        "\uFEFF": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: true
        },
        "\u0302": {
          isZeroWidthDiacritic: true,
          isInvisibleFormatMark: false,
          isWhitespace: false
        },
        "\u0344": {
          isZeroWidthDiacritic: true,
          isInvisibleFormatMark: false,
          isWhitespace: false
        },
        "\u0361": {
          isZeroWidthDiacritic: true,
          isInvisibleFormatMark: false,
          isWhitespace: false
        },
        "\u200B": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: true,
          isWhitespace: false
        },
        "\u200D": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: true,
          isWhitespace: false
        },
        a: {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: false
        },
        1: {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: false
        }
      };
      for (const [character, expectation] of Object.entries(tests)) {
        expect((0, _unicode.getCharUnicodeCategory)(character)).toEqual(expectation);
      }
    });
  });
  describe("getUnicodeForGlyph", function () {
    let standardMap, dingbatsMap;
    beforeAll(function () {
      standardMap = (0, _glyphlist.getGlyphsUnicode)();
      dingbatsMap = (0, _glyphlist.getDingbatsGlyphsUnicode)();
    });
    afterAll(function () {
      standardMap = dingbatsMap = null;
    });
    it("should get Unicode values for valid glyph names", function () {
      expect((0, _unicode.getUnicodeForGlyph)("A", standardMap)).toEqual(0x0041);
      expect((0, _unicode.getUnicodeForGlyph)("a1", dingbatsMap)).toEqual(0x2701);
    });
    it("should recover Unicode values from uniXXXX/uXXXX{XX} glyph names", function () {
      expect((0, _unicode.getUnicodeForGlyph)("uni0041", standardMap)).toEqual(0x0041);
      expect((0, _unicode.getUnicodeForGlyph)("u0041", standardMap)).toEqual(0x0041);
      expect((0, _unicode.getUnicodeForGlyph)("uni2701", dingbatsMap)).toEqual(0x2701);
      expect((0, _unicode.getUnicodeForGlyph)("u2701", dingbatsMap)).toEqual(0x2701);
    });
    it("should not get Unicode values for invalid glyph names", function () {
      expect((0, _unicode.getUnicodeForGlyph)("Qwerty", standardMap)).toEqual(-1);
      expect((0, _unicode.getUnicodeForGlyph)("Qwerty", dingbatsMap)).toEqual(-1);
    });
  });
  describe("getUnicodeRangeFor", function () {
    it("should get correct Unicode range", function () {
      expect((0, _unicode.getUnicodeRangeFor)(0x0041)).toEqual(0);
      expect((0, _unicode.getUnicodeRangeFor)(0xfb01)).toEqual(62);
    });
    it("should not get a Unicode range", function () {
      expect((0, _unicode.getUnicodeRangeFor)(0x05ff)).toEqual(-1);
    });
  });
  describe("getNormalizedUnicodes", function () {
    let NormalizedUnicodes;
    beforeAll(function () {
      NormalizedUnicodes = (0, _unicode.getNormalizedUnicodes)();
    });
    afterAll(function () {
      NormalizedUnicodes = null;
    });
    it("should get normalized Unicode values for ligatures", function () {
      expect(NormalizedUnicodes["\uFB01"]).toEqual("fi");
      expect(NormalizedUnicodes["\u0675"]).toEqual("\u0627\u0674");
    });
    it("should not normalize standard characters", function () {
      expect(NormalizedUnicodes.A).toEqual(undefined);
    });
  });
  describe("reverseIfRtl", function () {
    let NormalizedUnicodes;
    function getGlyphUnicode(char) {
      if (NormalizedUnicodes[char] !== undefined) {
        return NormalizedUnicodes[char];
      }
      return char;
    }
    beforeAll(function () {
      NormalizedUnicodes = (0, _unicode.getNormalizedUnicodes)();
    });
    afterAll(function () {
      NormalizedUnicodes = null;
    });
    it("should not reverse LTR characters", function () {
      const A = getGlyphUnicode("A");
      expect((0, _unicode.reverseIfRtl)(A)).toEqual("A");
      const fi = getGlyphUnicode("\uFB01");
      expect((0, _unicode.reverseIfRtl)(fi)).toEqual("fi");
    });
    it("should reverse RTL characters", function () {
      const heAlef = getGlyphUnicode("\u05D0");
      expect((0, _unicode.reverseIfRtl)(heAlef)).toEqual("\u05D0");
      const arAlef = getGlyphUnicode("\u0675");
      expect((0, _unicode.reverseIfRtl)(arAlef)).toEqual("\u0674\u0627");
    });
  });
});