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
exports.FirefoxPrintService = FirefoxPrintService;
var _pdf = require("../pdf");
var _print_utils = require("./print_utils.js");
var _app = require("./app.js");
function composePage(pdfDocument, pageNumber, size, printContainer, printResolution, optionalContentConfigPromise, printAnnotationStoragePromise) {
  const canvas = document.createElement("canvas");
  const PRINT_UNITS = printResolution / _pdf.PixelsPerInch.PDF;
  canvas.width = Math.floor(size.width * PRINT_UNITS);
  canvas.height = Math.floor(size.height * PRINT_UNITS);
  const canvasWrapper = document.createElement("div");
  canvasWrapper.className = "printedPage";
  canvasWrapper.append(canvas);
  printContainer.append(canvasWrapper);
  let currentRenderTask = null;
  canvas.mozPrintCallback = function (obj) {
    const ctx = obj.context;
    ctx.save();
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    let thisRenderTask = null;
    Promise.all([pdfDocument.getPage(pageNumber), printAnnotationStoragePromise]).then(function ([pdfPage, printAnnotationStorage]) {
      if (currentRenderTask) {
        currentRenderTask.cancel();
        currentRenderTask = null;
      }
      const renderContext = {
        canvasContext: ctx,
        transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
        viewport: pdfPage.getViewport({
          scale: 1,
          rotation: size.rotation
        }),
        intent: "print",
        annotationMode: _pdf.AnnotationMode.ENABLE_STORAGE,
        optionalContentConfigPromise,
        printAnnotationStorage
      };
      currentRenderTask = thisRenderTask = pdfPage.render(renderContext);
      return thisRenderTask.promise;
    }).then(function () {
      if (currentRenderTask === thisRenderTask) {
        currentRenderTask = null;
      }
      obj.done();
    }, function (reason) {
      if (!(reason instanceof _pdf.RenderingCancelledException)) {
        console.error(reason);
      }
      if (currentRenderTask === thisRenderTask) {
        currentRenderTask.cancel();
        currentRenderTask = null;
      }
      if ("abort" in obj) {
        obj.abort();
      } else {
        obj.done();
      }
    });
  };
}
function FirefoxPrintService(pdfDocument, pagesOverview, printContainer, printResolution, optionalContentConfigPromise = null, printAnnotationStoragePromise = null) {
  this.pdfDocument = pdfDocument;
  this.pagesOverview = pagesOverview;
  this.printContainer = printContainer;
  this._printResolution = printResolution || 150;
  this._optionalContentConfigPromise = optionalContentConfigPromise || pdfDocument.getOptionalContentConfig();
  this._printAnnotationStoragePromise = printAnnotationStoragePromise || Promise.resolve();
}
FirefoxPrintService.prototype = {
  layout() {
    const {
      pdfDocument,
      pagesOverview,
      printContainer,
      _printResolution,
      _optionalContentConfigPromise,
      _printAnnotationStoragePromise
    } = this;
    const body = document.querySelector("body");
    body.setAttribute("data-pdfjsprinting", true);
    if (pdfDocument.isPureXfa) {
      (0, _print_utils.getXfaHtmlForPrinting)(printContainer, pdfDocument);
      return;
    }
    for (let i = 0, ii = pagesOverview.length; i < ii; ++i) {
      composePage(pdfDocument, i + 1, pagesOverview[i], printContainer, _printResolution, _optionalContentConfigPromise, _printAnnotationStoragePromise);
    }
  },
  destroy() {
    this.printContainer.textContent = "";
    const body = document.querySelector("body");
    body.removeAttribute("data-pdfjsprinting");
  }
};
_app.PDFPrintServiceFactory.instance = {
  get supportsPrinting() {
    const canvas = document.createElement("canvas");
    const value = ("mozPrintCallback" in canvas);
    return (0, _pdf.shadow)(this, "supportsPrinting", value);
  },
  createPrintService(pdfDocument, pagesOverview, printContainer, printResolution, optionalContentConfigPromise, printAnnotationStoragePromise) {
    return new FirefoxPrintService(pdfDocument, pagesOverview, printContainer, printResolution, optionalContentConfigPromise, printAnnotationStoragePromise);
  }
};