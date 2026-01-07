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
Object.defineProperty(exports, "AnnotationLayerBuilder", {
  enumerable: true,
  get: function () {
    return _annotation_layer_builder.AnnotationLayerBuilder;
  }
});
exports.DefaultXfaLayerFactory = exports.DefaultTextLayerFactory = exports.DefaultStructTreeLayerFactory = exports.DefaultAnnotationLayerFactory = void 0;
Object.defineProperty(exports, "DownloadManager", {
  enumerable: true,
  get: function () {
    return _download_manager.DownloadManager;
  }
});
Object.defineProperty(exports, "EventBus", {
  enumerable: true,
  get: function () {
    return _event_utils.EventBus;
  }
});
Object.defineProperty(exports, "GenericL10n", {
  enumerable: true,
  get: function () {
    return _genericl10n.GenericL10n;
  }
});
Object.defineProperty(exports, "LinkTarget", {
  enumerable: true,
  get: function () {
    return _pdf_link_service.LinkTarget;
  }
});
Object.defineProperty(exports, "NullL10n", {
  enumerable: true,
  get: function () {
    return _l10n_utils.NullL10n;
  }
});
Object.defineProperty(exports, "PDFFindController", {
  enumerable: true,
  get: function () {
    return _pdf_find_controller.PDFFindController;
  }
});
Object.defineProperty(exports, "PDFHistory", {
  enumerable: true,
  get: function () {
    return _pdf_history.PDFHistory;
  }
});
Object.defineProperty(exports, "PDFLinkService", {
  enumerable: true,
  get: function () {
    return _pdf_link_service.PDFLinkService;
  }
});
Object.defineProperty(exports, "PDFPageView", {
  enumerable: true,
  get: function () {
    return _pdf_page_view.PDFPageView;
  }
});
Object.defineProperty(exports, "PDFScriptingManager", {
  enumerable: true,
  get: function () {
    return _pdf_scripting_manager.PDFScriptingManager;
  }
});
Object.defineProperty(exports, "PDFSinglePageViewer", {
  enumerable: true,
  get: function () {
    return _pdf_single_page_viewer.PDFSinglePageViewer;
  }
});
Object.defineProperty(exports, "PDFViewer", {
  enumerable: true,
  get: function () {
    return _pdf_viewer.PDFViewer;
  }
});
Object.defineProperty(exports, "ProgressBar", {
  enumerable: true,
  get: function () {
    return _ui_utils.ProgressBar;
  }
});
Object.defineProperty(exports, "RenderingStates", {
  enumerable: true,
  get: function () {
    return _ui_utils.RenderingStates;
  }
});
Object.defineProperty(exports, "ScrollMode", {
  enumerable: true,
  get: function () {
    return _ui_utils.ScrollMode;
  }
});
Object.defineProperty(exports, "SimpleLinkService", {
  enumerable: true,
  get: function () {
    return _pdf_link_service.SimpleLinkService;
  }
});
Object.defineProperty(exports, "SpreadMode", {
  enumerable: true,
  get: function () {
    return _ui_utils.SpreadMode;
  }
});
Object.defineProperty(exports, "StructTreeLayerBuilder", {
  enumerable: true,
  get: function () {
    return _struct_tree_layer_builder.StructTreeLayerBuilder;
  }
});
Object.defineProperty(exports, "TextLayerBuilder", {
  enumerable: true,
  get: function () {
    return _text_layer_builder.TextLayerBuilder;
  }
});
Object.defineProperty(exports, "XfaLayerBuilder", {
  enumerable: true,
  get: function () {
    return _xfa_layer_builder.XfaLayerBuilder;
  }
});
Object.defineProperty(exports, "parseQueryString", {
  enumerable: true,
  get: function () {
    return _ui_utils.parseQueryString;
  }
});
var _pdf_link_service = require("./pdf_link_service.js");
var _ui_utils = require("./ui_utils.js");
var _annotation_layer_builder = require("./annotation_layer_builder.js");
var _download_manager = require("./download_manager.js");
var _event_utils = require("./event_utils.js");
var _genericl10n = require("./genericl10n.js");
var _l10n_utils = require("./l10n_utils.js");
var _pdf_find_controller = require("./pdf_find_controller.js");
var _pdf_history = require("./pdf_history.js");
var _pdf_page_view = require("./pdf_page_view.js");
var _pdf_scripting_manager = require("./pdf_scripting_manager.js");
var _pdf_single_page_viewer = require("./pdf_single_page_viewer.js");
var _pdf_viewer = require("./pdf_viewer.js");
var _struct_tree_layer_builder = require("./struct_tree_layer_builder.js");
var _text_layer_builder = require("./text_layer_builder.js");
var _xfa_layer_builder = require("./xfa_layer_builder.js");
const pdfjsVersion = '3.4.120';
const pdfjsBuild = 'af6414988';
class DefaultAnnotationLayerFactory {
  constructor() {
    throw new Error("The `DefaultAnnotationLayerFactory` has been removed, " + "please use the `annotationMode` option when initializing " + "the `PDFPageView`-instance to control AnnotationLayer rendering.");
  }
}
exports.DefaultAnnotationLayerFactory = DefaultAnnotationLayerFactory;
class DefaultStructTreeLayerFactory {
  constructor() {
    throw new Error("The `DefaultStructTreeLayerFactory` has been removed, " + "this functionality is automatically enabled when the TextLayer is used.");
  }
}
exports.DefaultStructTreeLayerFactory = DefaultStructTreeLayerFactory;
class DefaultTextLayerFactory {
  constructor() {
    throw new Error("The `DefaultTextLayerFactory` has been removed, " + "please use the `textLayerMode` option when initializing " + "the `PDFPageView`-instance to control TextLayer rendering.");
  }
}
exports.DefaultTextLayerFactory = DefaultTextLayerFactory;
class DefaultXfaLayerFactory {
  constructor() {
    throw new Error("The `DefaultXfaLayerFactory` has been removed, " + "please use the `enableXfa` option when calling " + "the `getDocument`-function to control XfaLayer rendering.");
  }
}
exports.DefaultXfaLayerFactory = DefaultXfaLayerFactory;