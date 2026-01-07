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
exports.PDFSinglePageViewer = void 0;
var _ui_utils = require("./ui_utils.js");
var _pdf_viewer = require("./pdf_viewer.js");
class PDFSinglePageViewer extends _pdf_viewer.PDFViewer {
  _resetView() {
    super._resetView();
    this._scrollMode = _ui_utils.ScrollMode.PAGE;
    this._spreadMode = _ui_utils.SpreadMode.NONE;
  }
  set scrollMode(mode) {}
  _updateScrollMode() {}
  set spreadMode(mode) {}
  _updateSpreadMode() {}
}
exports.PDFSinglePageViewer = PDFSinglePageViewer;