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

var _pdf_viewer = require("../../web/pdf_viewer.js");
describe("PDFViewer", function () {
  describe("PDFPageViewBuffer", function () {
    function createViewsMap(startId, endId) {
      const map = new Map();
      for (let id = startId; id <= endId; id++) {
        map.set(id, {
          id,
          destroy: () => {}
        });
      }
      return map;
    }
    it("handles `push` correctly", function () {
      const buffer = new _pdf_viewer.PDFPageViewBuffer(3);
      const viewsMap = createViewsMap(1, 5),
        iterator = viewsMap.values();
      for (let i = 0; i < 3; i++) {
        const view = iterator.next().value;
        buffer.push(view);
      }
      expect([...buffer]).toEqual([viewsMap.get(1), viewsMap.get(2), viewsMap.get(3)]);
      for (let i = 3; i < 5; i++) {
        const view = iterator.next().value;
        buffer.push(view);
      }
      expect([...buffer]).toEqual([viewsMap.get(3), viewsMap.get(4), viewsMap.get(5)]);
    });
    it("handles `resize` correctly", function () {
      const buffer = new _pdf_viewer.PDFPageViewBuffer(5);
      const viewsMap = createViewsMap(1, 5),
        iterator = viewsMap.values();
      for (let i = 0; i < 5; i++) {
        const view = iterator.next().value;
        buffer.push(view);
      }
      buffer.resize(5);
      expect([...buffer]).toEqual([viewsMap.get(1), viewsMap.get(2), viewsMap.get(3), viewsMap.get(4), viewsMap.get(5)]);
      buffer.resize(10);
      expect([...buffer]).toEqual([viewsMap.get(1), viewsMap.get(2), viewsMap.get(3), viewsMap.get(4), viewsMap.get(5)]);
      buffer.resize(3);
      expect([...buffer]).toEqual([viewsMap.get(3), viewsMap.get(4), viewsMap.get(5)]);
    });
    it("handles `resize` correctly, with `idsToKeep` provided", function () {
      const buffer = new _pdf_viewer.PDFPageViewBuffer(5);
      const viewsMap = createViewsMap(1, 5),
        iterator = viewsMap.values();
      for (let i = 0; i < 5; i++) {
        const view = iterator.next().value;
        buffer.push(view);
      }
      buffer.resize(5, new Set([1, 2]));
      expect([...buffer]).toEqual([viewsMap.get(3), viewsMap.get(4), viewsMap.get(5), viewsMap.get(1), viewsMap.get(2)]);
      buffer.resize(10, new Set([3, 4, 5]));
      expect([...buffer]).toEqual([viewsMap.get(1), viewsMap.get(2), viewsMap.get(3), viewsMap.get(4), viewsMap.get(5)]);
      buffer.resize(3, new Set([1, 2, 5]));
      expect([...buffer]).toEqual([viewsMap.get(1), viewsMap.get(2), viewsMap.get(5)]);
    });
    it("handles `has` correctly", function () {
      const buffer = new _pdf_viewer.PDFPageViewBuffer(3);
      const viewsMap = createViewsMap(1, 2),
        iterator = viewsMap.values();
      for (let i = 0; i < 1; i++) {
        const view = iterator.next().value;
        buffer.push(view);
      }
      expect(buffer.has(viewsMap.get(1))).toEqual(true);
      expect(buffer.has(viewsMap.get(2))).toEqual(false);
    });
  });
});