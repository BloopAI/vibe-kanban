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
Object.defineProperty(exports, "PDFViewerApplication", {
  enumerable: true,
  get: function () {
    return _app.PDFViewerApplication;
  }
});
exports.PDFViewerApplicationConstants = void 0;
Object.defineProperty(exports, "PDFViewerApplicationOptions", {
  enumerable: true,
  get: function () {
    return _app_options.AppOptions;
  }
});
require("web-com");
var _ui_utils = require("./ui_utils.js");
var _app_options = require("./app_options.js");
var _pdf_link_service = require("./pdf_link_service.js");
var _app = require("./app.js");
const pdfjsVersion = '3.4.120';
const pdfjsBuild = 'af6414988';
const AppConstants = {
  LinkTarget: _pdf_link_service.LinkTarget,
  RenderingStates: _ui_utils.RenderingStates,
  ScrollMode: _ui_utils.ScrollMode,
  SpreadMode: _ui_utils.SpreadMode
};
exports.PDFViewerApplicationConstants = AppConstants;
window.PDFViewerApplication = _app.PDFViewerApplication;
window.PDFViewerApplicationConstants = AppConstants;
window.PDFViewerApplicationOptions = _app_options.AppOptions;
function getViewerConfiguration() {
  return {
    appContainer: document.body,
    mainContainer: document.getElementById("viewerContainer"),
    viewerContainer: document.getElementById("viewer"),
    passwordOverlay: {
      dialog: document.getElementById("passwordDialog"),
      label: document.getElementById("passwordText"),
      input: document.getElementById("password"),
      submitButton: document.getElementById("passwordSubmit"),
      cancelButton: document.getElementById("passwordCancel")
    },
    openFileInput: document.getElementById("fileInput")
  };
}
function webViewerLoad() {
  const config = getViewerConfiguration();
  _app.PDFViewerApplication.run(config);
}
document.blockUnblockOnload?.(true);
if (document.readyState === "interactive" || document.readyState === "complete") {
  webViewerLoad();
} else {
  document.addEventListener("DOMContentLoaded", webViewerLoad, true);
}