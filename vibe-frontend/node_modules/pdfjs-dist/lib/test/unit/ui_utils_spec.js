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

var _ui_utils = require("../../web/ui_utils.js");
describe("ui_utils", function () {
  describe("binary search", function () {
    function isTrue(boolean) {
      return boolean;
    }
    function isGreater3(number) {
      return number > 3;
    }
    it("empty array", function () {
      expect((0, _ui_utils.binarySearchFirstItem)([], isTrue)).toEqual(0);
    });
    it("single boolean entry", function () {
      expect((0, _ui_utils.binarySearchFirstItem)([false], isTrue)).toEqual(1);
      expect((0, _ui_utils.binarySearchFirstItem)([true], isTrue)).toEqual(0);
    });
    it("three boolean entries", function () {
      expect((0, _ui_utils.binarySearchFirstItem)([true, true, true], isTrue)).toEqual(0);
      expect((0, _ui_utils.binarySearchFirstItem)([false, true, true], isTrue)).toEqual(1);
      expect((0, _ui_utils.binarySearchFirstItem)([false, false, true], isTrue)).toEqual(2);
      expect((0, _ui_utils.binarySearchFirstItem)([false, false, false], isTrue)).toEqual(3);
    });
    it("three numeric entries", function () {
      expect((0, _ui_utils.binarySearchFirstItem)([0, 1, 2], isGreater3)).toEqual(3);
      expect((0, _ui_utils.binarySearchFirstItem)([2, 3, 4], isGreater3)).toEqual(2);
      expect((0, _ui_utils.binarySearchFirstItem)([4, 5, 6], isGreater3)).toEqual(0);
    });
    it("three numeric entries and a start index", function () {
      expect((0, _ui_utils.binarySearchFirstItem)([0, 1, 2, 3, 4], isGreater3, 2)).toEqual(4);
      expect((0, _ui_utils.binarySearchFirstItem)([2, 3, 4], isGreater3, 2)).toEqual(2);
      expect((0, _ui_utils.binarySearchFirstItem)([4, 5, 6], isGreater3, 1)).toEqual(1);
    });
  });
  describe("isValidRotation", function () {
    it("should reject non-integer angles", function () {
      expect((0, _ui_utils.isValidRotation)()).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(null)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(NaN)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)([90])).toEqual(false);
      expect((0, _ui_utils.isValidRotation)("90")).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(90.5)).toEqual(false);
    });
    it("should reject non-multiple of 90 degree angles", function () {
      expect((0, _ui_utils.isValidRotation)(45)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(-123)).toEqual(false);
    });
    it("should accept valid angles", function () {
      expect((0, _ui_utils.isValidRotation)(0)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(90)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(-270)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(540)).toEqual(true);
    });
  });
  describe("isPortraitOrientation", function () {
    it("should be portrait orientation", function () {
      expect((0, _ui_utils.isPortraitOrientation)({
        width: 200,
        height: 400
      })).toEqual(true);
      expect((0, _ui_utils.isPortraitOrientation)({
        width: 500,
        height: 500
      })).toEqual(true);
    });
    it("should be landscape orientation", function () {
      expect((0, _ui_utils.isPortraitOrientation)({
        width: 600,
        height: 300
      })).toEqual(false);
    });
  });
  describe("parseQueryString", function () {
    it("should parse one key/value pair", function () {
      const parameters = (0, _ui_utils.parseQueryString)("key1=value1");
      expect(parameters.size).toEqual(1);
      expect(parameters.get("key1")).toEqual("value1");
    });
    it("should parse multiple key/value pairs", function () {
      const parameters = (0, _ui_utils.parseQueryString)("key1=value1&key2=value2&key3=value3");
      expect(parameters.size).toEqual(3);
      expect(parameters.get("key1")).toEqual("value1");
      expect(parameters.get("key2")).toEqual("value2");
      expect(parameters.get("key3")).toEqual("value3");
    });
    it("should parse keys without values", function () {
      const parameters = (0, _ui_utils.parseQueryString)("key1");
      expect(parameters.size).toEqual(1);
      expect(parameters.get("key1")).toEqual("");
    });
    it("should decode encoded key/value pairs", function () {
      const parameters = (0, _ui_utils.parseQueryString)("k%C3%ABy1=valu%C3%AB1");
      expect(parameters.size).toEqual(1);
      expect(parameters.get("këy1")).toEqual("valuë1");
    });
    it("should convert keys to lowercase", function () {
      const parameters = (0, _ui_utils.parseQueryString)("Key1=Value1&KEY2=Value2");
      expect(parameters.size).toEqual(2);
      expect(parameters.get("key1")).toEqual("Value1");
      expect(parameters.get("key2")).toEqual("Value2");
    });
  });
  describe("removeNullCharacters", function () {
    it("should not modify string without null characters", function () {
      const str = "string without null chars";
      expect((0, _ui_utils.removeNullCharacters)(str)).toEqual("string without null chars");
    });
    it("should modify string with null characters", function () {
      const str = "string\x00With\x00Null\x00Chars";
      expect((0, _ui_utils.removeNullCharacters)(str)).toEqual("stringWithNullChars");
    });
    it("should modify string with non-displayable characters", function () {
      const str = Array.from(Array(32).keys()).map(x => String.fromCharCode(x) + "a").join("");
      const expected = "a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a";
      expect((0, _ui_utils.removeNullCharacters)(str, true)).toEqual(expected);
    });
  });
  describe("getPageSizeInches", function () {
    it("gets page size (in inches)", function () {
      const page = {
        view: [0, 0, 595.28, 841.89],
        userUnit: 1.0,
        rotate: 0
      };
      const {
        width,
        height
      } = (0, _ui_utils.getPageSizeInches)(page);
      expect(+width.toPrecision(3)).toEqual(8.27);
      expect(+height.toPrecision(4)).toEqual(11.69);
    });
    it("gets page size (in inches), for non-default /Rotate entry", function () {
      const pdfPage1 = {
        view: [0, 0, 612, 792],
        userUnit: 1,
        rotate: 0
      };
      const {
        width: width1,
        height: height1
      } = (0, _ui_utils.getPageSizeInches)(pdfPage1);
      expect(width1).toEqual(8.5);
      expect(height1).toEqual(11);
      const pdfPage2 = {
        view: [0, 0, 612, 792],
        userUnit: 1,
        rotate: 90
      };
      const {
        width: width2,
        height: height2
      } = (0, _ui_utils.getPageSizeInches)(pdfPage2);
      expect(width2).toEqual(11);
      expect(height2).toEqual(8.5);
    });
  });
  describe("getVisibleElements", function () {
    const BORDER_WIDTH = 9;
    const SPACING = 2 * BORDER_WIDTH - 7;
    function makePages(lines) {
      const result = [];
      let lineTop = 0,
        id = 0;
      for (const line of lines) {
        const lineHeight = line.reduce(function (maxHeight, pair) {
          return Math.max(maxHeight, pair[1]);
        }, 0);
        let offsetLeft = -BORDER_WIDTH;
        for (const [clientWidth, clientHeight] of line) {
          const offsetTop = lineTop + (lineHeight - clientHeight) / 2 - BORDER_WIDTH;
          const div = {
            offsetLeft,
            offsetTop,
            clientWidth,
            clientHeight,
            clientLeft: BORDER_WIDTH,
            clientTop: BORDER_WIDTH
          };
          result.push({
            id,
            div
          });
          ++id;
          offsetLeft += clientWidth + SPACING;
        }
        lineTop += lineHeight + SPACING;
      }
      return result;
    }
    function slowGetVisibleElements(scroll, pages) {
      const views = [],
        ids = new Set();
      const {
        scrollLeft,
        scrollTop
      } = scroll;
      const scrollRight = scrollLeft + scroll.clientWidth;
      const scrollBottom = scrollTop + scroll.clientHeight;
      for (const view of pages) {
        const {
          div
        } = view;
        const viewLeft = div.offsetLeft + div.clientLeft;
        const viewRight = viewLeft + div.clientWidth;
        const viewTop = div.offsetTop + div.clientTop;
        const viewBottom = viewTop + div.clientHeight;
        if (viewLeft < scrollRight && viewRight > scrollLeft && viewTop < scrollBottom && viewBottom > scrollTop) {
          const hiddenHeight = Math.max(0, scrollTop - viewTop) + Math.max(0, viewBottom - scrollBottom);
          const hiddenWidth = Math.max(0, scrollLeft - viewLeft) + Math.max(0, viewRight - scrollRight);
          const fractionHeight = (div.clientHeight - hiddenHeight) / div.clientHeight;
          const fractionWidth = (div.clientWidth - hiddenWidth) / div.clientWidth;
          const percent = fractionHeight * fractionWidth * 100 | 0;
          views.push({
            id: view.id,
            x: viewLeft,
            y: viewTop,
            view,
            percent,
            widthPercent: fractionWidth * 100 | 0
          });
          ids.add(view.id);
        }
      }
      return {
        first: views[0],
        last: views.at(-1),
        views,
        ids
      };
    }
    function scrollOverDocument(pages, horizontal = false, rtl = false) {
      const size = pages.reduce(function (max, {
        div
      }) {
        return Math.max(max, horizontal ? Math.abs(div.offsetLeft + div.clientLeft + div.clientWidth) : div.offsetTop + div.clientTop + div.clientHeight);
      }, 0);
      for (let i = -size; i < size; i += 7) {
        for (let j = i + 5; j < size; j += j - i) {
          const scrollEl = horizontal ? {
            scrollTop: 0,
            scrollLeft: i,
            clientHeight: 10000,
            clientWidth: j - i
          } : {
            scrollTop: i,
            scrollLeft: 0,
            clientHeight: j - i,
            clientWidth: 10000
          };
          expect((0, _ui_utils.getVisibleElements)({
            scrollEl,
            views: pages,
            sortByVisibility: false,
            horizontal,
            rtl
          })).toEqual(slowGetVisibleElements(scrollEl, pages));
        }
      }
    }
    it("with pages of varying height", function () {
      const pages = makePages([[[50, 20], [20, 50]], [[30, 12], [12, 30]], [[20, 50], [50, 20]], [[50, 20], [20, 50]]]);
      scrollOverDocument(pages);
    });
    it("widescreen challenge", function () {
      const pages = makePages([[[10, 50], [10, 60], [10, 70], [10, 80], [10, 90]], [[10, 90], [10, 80], [10, 70], [10, 60], [10, 50]], [[10, 50], [10, 60], [10, 70], [10, 80], [10, 90]]]);
      scrollOverDocument(pages);
    });
    it("works with horizontal scrolling", function () {
      const pages = makePages([[[10, 50], [20, 20], [30, 10]]]);
      scrollOverDocument(pages, true);
    });
    it("works with horizontal scrolling with RTL-documents", function () {
      const pages = makePages([[[-10, 50], [-20, 20], [-30, 10]]]);
      scrollOverDocument(pages, true, true);
    });
    it("handles `sortByVisibility` correctly", function () {
      const scrollEl = {
        scrollTop: 75,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500
      };
      const views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);
      const visible = (0, _ui_utils.getVisibleElements)({
        scrollEl,
        views
      });
      const visibleSorted = (0, _ui_utils.getVisibleElements)({
        scrollEl,
        views,
        sortByVisibility: true
      });
      const viewsOrder = [],
        viewsSortedOrder = [];
      for (const view of visible.views) {
        viewsOrder.push(view.id);
      }
      for (const view of visibleSorted.views) {
        viewsSortedOrder.push(view.id);
      }
      expect(viewsOrder).toEqual([0, 1, 2]);
      expect(viewsSortedOrder).toEqual([1, 2, 0]);
    });
    it("handles views being empty", function () {
      const scrollEl = {
        scrollTop: 10,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500
      };
      const views = [];
      expect((0, _ui_utils.getVisibleElements)({
        scrollEl,
        views
      })).toEqual({
        first: undefined,
        last: undefined,
        views: [],
        ids: new Set()
      });
    });
    it("handles all views being hidden (without errors)", function () {
      const scrollEl = {
        scrollTop: 100000,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500
      };
      const views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);
      expect((0, _ui_utils.getVisibleElements)({
        scrollEl,
        views
      })).toEqual({
        first: undefined,
        last: undefined,
        views: [],
        ids: new Set()
      });
    });
    describe("backtrackBeforeAllVisibleElements", function () {
      const tallPage = [10, 50];
      const shortPage = [10, 10];
      const top1 = 20 + SPACING + 40;
      const top2 = 20 + SPACING + 10;
      it("handles case 1", function () {
        const pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, shortPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]], [[10, 20]]]);
        const bsResult = 4;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top1)).toEqual(4);
      });
      it("handles case 2", function () {
        const pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, tallPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]]]);
        const bsResult = 6;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top1)).toEqual(4);
      });
      it("handles case 3", function () {
        const pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, shortPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]]]);
        const bsResult = 8;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top1)).toEqual(4);
      });
      it("handles case 4", function () {
        const pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, shortPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]]]);
        const bsResult = 4;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top2)).toEqual(4);
      });
    });
  });
});