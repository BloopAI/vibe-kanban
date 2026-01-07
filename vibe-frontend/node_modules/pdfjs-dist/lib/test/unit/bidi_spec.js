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

var _bidi = require("../../core/bidi.js");
describe("bidi", function () {
  it("should mark text as LTR if there's only LTR-characters, " + "when the string is very short", function () {
    const str = "foo";
    const bidiText = (0, _bidi.bidi)(str, -1, false);
    expect(bidiText.str).toEqual("foo");
    expect(bidiText.dir).toEqual("ltr");
  });
  it("should mark text as LTR if there's only LTR-characters", function () {
    const str = "Lorem ipsum dolor sit amet, consectetur adipisicing elit.";
    const bidiText = (0, _bidi.bidi)(str, -1, false);
    expect(bidiText.str).toEqual("Lorem ipsum dolor sit amet, consectetur adipisicing elit.");
    expect(bidiText.dir).toEqual("ltr");
  });
  it("should mark text as RTL if more than 30% of text is RTL", function () {
    const test = "\u0645\u0635\u0631 Egypt";
    const result = "Egypt \u0631\u0635\u0645";
    const bidiText = (0, _bidi.bidi)(test, -1, false);
    expect(bidiText.str).toEqual(result);
    expect(bidiText.dir).toEqual("rtl");
  });
  it("should mark text as LTR if less than 30% of text is RTL", function () {
    const test = "Egypt is known as \u0645\u0635\u0631 in Arabic.";
    const result = "Egypt is known as \u0631\u0635\u0645 in Arabic.";
    const bidiText = (0, _bidi.bidi)(test, -1, false);
    expect(bidiText.str).toEqual(result);
    expect(bidiText.dir).toEqual("ltr");
  });
  it("should mark text as RTL if less than 30% of text is RTL, " + "when the string is very short (issue 11656)", function () {
    const str = "()\u05d1(";
    const bidiText = (0, _bidi.bidi)(str, -1, false);
    expect(bidiText.str).toEqual("(\u05d1)(");
    expect(bidiText.dir).toEqual("rtl");
  });
});