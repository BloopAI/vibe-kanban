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
exports.AnnotationLayerBuilder = void 0;
var _pdf = require("../pdf");
var _l10n_utils = require("./l10n_utils.js");
var _ui_utils = require("./ui_utils.js");
class AnnotationLayerBuilder {
  #numAnnotations = 0;
  #onPresentationModeChanged = null;
  constructor({
    pageDiv,
    pdfPage,
    linkService,
    downloadManager,
    annotationStorage = null,
    imageResourcesPath = "",
    renderForms = true,
    l10n = _l10n_utils.NullL10n,
    enableScripting = false,
    hasJSActionsPromise = null,
    fieldObjectsPromise = null,
    annotationCanvasMap = null,
    accessibilityManager = null
  }) {
    this.pageDiv = pageDiv;
    this.pdfPage = pdfPage;
    this.linkService = linkService;
    this.downloadManager = downloadManager;
    this.imageResourcesPath = imageResourcesPath;
    this.renderForms = renderForms;
    this.l10n = l10n;
    this.annotationStorage = annotationStorage;
    this.enableScripting = enableScripting;
    this._hasJSActionsPromise = hasJSActionsPromise || Promise.resolve(false);
    this._fieldObjectsPromise = fieldObjectsPromise || Promise.resolve(null);
    this._annotationCanvasMap = annotationCanvasMap;
    this._accessibilityManager = accessibilityManager;
    this.div = null;
    this._cancelled = false;
    this._eventBus = linkService.eventBus;
  }
  async render(viewport, intent = "display") {
    if (this.div) {
      if (this._cancelled || this.#numAnnotations === 0) {
        return;
      }
      _pdf.AnnotationLayer.update({
        viewport: viewport.clone({
          dontFlip: true
        }),
        div: this.div,
        annotationCanvasMap: this._annotationCanvasMap
      });
      return;
    }
    const [annotations, hasJSActions, fieldObjects] = await Promise.all([this.pdfPage.getAnnotations({
      intent
    }), this._hasJSActionsPromise, this._fieldObjectsPromise]);
    if (this._cancelled) {
      return;
    }
    this.#numAnnotations = annotations.length;
    this.div = document.createElement("div");
    this.div.className = "annotationLayer";
    this.pageDiv.append(this.div);
    if (this.#numAnnotations === 0) {
      this.hide();
      return;
    }
    _pdf.AnnotationLayer.render({
      viewport: viewport.clone({
        dontFlip: true
      }),
      div: this.div,
      annotations,
      page: this.pdfPage,
      imageResourcesPath: this.imageResourcesPath,
      renderForms: this.renderForms,
      linkService: this.linkService,
      downloadManager: this.downloadManager,
      annotationStorage: this.annotationStorage,
      enableScripting: this.enableScripting,
      hasJSActions,
      fieldObjects,
      annotationCanvasMap: this._annotationCanvasMap,
      accessibilityManager: this._accessibilityManager
    });
    this.l10n.translate(this.div);
    if (this.linkService.isInPresentationMode) {
      this.#updatePresentationModeState(_ui_utils.PresentationModeState.FULLSCREEN);
    }
    if (!this.#onPresentationModeChanged) {
      this.#onPresentationModeChanged = evt => {
        this.#updatePresentationModeState(evt.state);
      };
      this._eventBus?._on("presentationmodechanged", this.#onPresentationModeChanged);
    }
  }
  cancel() {
    this._cancelled = true;
    if (this.#onPresentationModeChanged) {
      this._eventBus?._off("presentationmodechanged", this.#onPresentationModeChanged);
      this.#onPresentationModeChanged = null;
    }
  }
  hide() {
    if (!this.div) {
      return;
    }
    this.div.hidden = true;
  }
  #updatePresentationModeState(state) {
    if (!this.div) {
      return;
    }
    let disableFormElements = false;
    switch (state) {
      case _ui_utils.PresentationModeState.FULLSCREEN:
        disableFormElements = true;
        break;
      case _ui_utils.PresentationModeState.NORMAL:
        break;
      default:
        return;
    }
    for (const section of this.div.childNodes) {
      if (section.hasAttribute("data-internal-link")) {
        continue;
      }
      section.inert = disableFormElements;
    }
  }
}
exports.AnnotationLayerBuilder = AnnotationLayerBuilder;