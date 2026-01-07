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

var _worker_options = require("pdfjs/display/worker_options.js");
var _is_node = require("pdfjs/shared/is_node.js");
var _testreporter = require("./testreporter.js");
async function initializePDFJS(callback) {
  await Promise.all(["pdfjs-test/unit/annotation_spec.js", "pdfjs-test/unit/annotation_storage_spec.js", "pdfjs-test/unit/api_spec.js", "pdfjs-test/unit/bidi_spec.js", "pdfjs-test/unit/cff_parser_spec.js", "pdfjs-test/unit/cmap_spec.js", "pdfjs-test/unit/colorspace_spec.js", "pdfjs-test/unit/core_utils_spec.js", "pdfjs-test/unit/crypto_spec.js", "pdfjs-test/unit/custom_spec.js", "pdfjs-test/unit/default_appearance_spec.js", "pdfjs-test/unit/display_svg_spec.js", "pdfjs-test/unit/display_utils_spec.js", "pdfjs-test/unit/document_spec.js", "pdfjs-test/unit/editor_spec.js", "pdfjs-test/unit/encodings_spec.js", "pdfjs-test/unit/evaluator_spec.js", "pdfjs-test/unit/event_utils_spec.js", "pdfjs-test/unit/function_spec.js", "pdfjs-test/unit/fetch_stream_spec.js", "pdfjs-test/unit/message_handler_spec.js", "pdfjs-test/unit/metadata_spec.js", "pdfjs-test/unit/murmurhash3_spec.js", "pdfjs-test/unit/network_spec.js", "pdfjs-test/unit/network_utils_spec.js", "pdfjs-test/unit/parser_spec.js", "pdfjs-test/unit/pdf_find_controller_spec.js", "pdfjs-test/unit/pdf_find_utils_spec.js", "pdfjs-test/unit/pdf_history_spec.js", "pdfjs-test/unit/pdf_viewer_spec.js", "pdfjs-test/unit/primitives_spec.js", "pdfjs-test/unit/scripting_spec.js", "pdfjs-test/unit/stream_spec.js", "pdfjs-test/unit/struct_tree_spec.js", "pdfjs-test/unit/text_layer_spec.js", "pdfjs-test/unit/type1_parser_spec.js", "pdfjs-test/unit/ui_utils_spec.js", "pdfjs-test/unit/unicode_spec.js", "pdfjs-test/unit/util_spec.js", "pdfjs-test/unit/writer_spec.js", "pdfjs-test/unit/xfa_formcalc_spec.js", "pdfjs-test/unit/xfa_parser_spec.js", "pdfjs-test/unit/xfa_serialize_data_spec.js", "pdfjs-test/unit/xfa_tohtml_spec.js", "pdfjs-test/unit/xml_spec.js"].map(function (moduleName) {
    return import(moduleName);
  }));
  if (_is_node.isNodeJS) {
    throw new Error("The `gulp unittest` command cannot be used in Node.js environments.");
  }
  _worker_options.GlobalWorkerOptions.workerSrc = "../../build/generic/build/pdf.worker.js";
  callback();
}
(function () {
  window.jasmine = jasmineRequire.core(jasmineRequire);
  jasmineRequire.html(jasmine);
  const env = jasmine.getEnv();
  const jasmineInterface = jasmineRequire.interface(jasmine, env);
  extend(window, jasmineInterface);
  const queryString = new jasmine.QueryString({
    getWindowLocation() {
      return window.location;
    }
  });
  const config = {
    failFast: queryString.getParam("failFast"),
    oneFailurePerSpec: queryString.getParam("oneFailurePerSpec"),
    hideDisabled: queryString.getParam("hideDisabled")
  };
  const random = queryString.getParam("random");
  if (random !== undefined && random !== "") {
    config.random = random;
  }
  const seed = queryString.getParam("seed");
  if (seed) {
    config.seed = seed;
  }
  const htmlReporter = new jasmine.HtmlReporter({
    env,
    navigateWithNewParam(key, value) {
      return queryString.navigateWithNewParam(key, value);
    },
    addToExistingQueryString(key, value) {
      return queryString.fullStringWithNewParam(key, value);
    },
    getContainer() {
      return document.body;
    },
    createElement() {
      return document.createElement(...arguments);
    },
    createTextNode() {
      return document.createTextNode(...arguments);
    },
    timer: new jasmine.Timer()
  });
  env.addReporter(htmlReporter);
  if (queryString.getParam("browser")) {
    const testReporter = new _testreporter.TestReporter(queryString.getParam("browser"));
    env.addReporter(testReporter);
  }
  const specFilter = new jasmine.HtmlSpecFilter({
    filterString() {
      return queryString.getParam("spec");
    }
  });
  config.specFilter = function (spec) {
    return specFilter.matches(spec.getFullName());
  };
  env.configure(config);
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;
  function extend(destination, source) {
    for (const property in source) {
      destination[property] = source[property];
    }
    return destination;
  }
  function unitTestInit() {
    initializePDFJS(function () {
      htmlReporter.initialize();
      env.execute();
    });
  }
  if (document.readyState === "interactive" || document.readyState === "complete") {
    unitTestInit();
  } else {
    document.addEventListener("DOMContentLoaded", unitTestInit, true);
  }
})();