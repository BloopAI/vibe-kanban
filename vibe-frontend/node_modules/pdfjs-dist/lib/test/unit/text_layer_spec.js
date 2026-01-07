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

var _text_layer = require("../../display/text_layer.js");
var _test_utils = require("./test_utils.js");
var _api = require("../../display/api.js");
var _is_node = require("../../shared/is_node.js");
describe("textLayer", function () {
  it("creates textLayer from ReadableStream", async function () {
    if (_is_node.isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    const loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);
    const textContentItemsStr = [];
    const textLayerRenderTask = (0, _text_layer.renderTextLayer)({
      textContentSource: page.streamTextContent(),
      container: document.createElement("div"),
      viewport: page.getViewport(),
      textContentItemsStr
    });
    expect(textLayerRenderTask instanceof _text_layer.TextLayerRenderTask).toEqual(true);
    await textLayerRenderTask.promise;
    expect(textContentItemsStr).toEqual(["Table Of Content", "", "Chapter 1", " ", "..........................................................", " ", "2", "", "Paragraph 1.1", " ", "......................................................", " ", "3", "", "page 1 / 3"]);
  });
});