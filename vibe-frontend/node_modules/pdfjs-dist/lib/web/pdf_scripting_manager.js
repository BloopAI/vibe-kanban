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
exports.PDFScriptingManager = void 0;
var _ui_utils = require("./ui_utils.js");
var _pdf = require("../pdf");
class PDFScriptingManager {
  constructor({
    eventBus,
    sandboxBundleSrc = null,
    scriptingFactory = null,
    docPropertiesLookup = null
  }) {
    this._pdfDocument = null;
    this._pdfViewer = null;
    this._closeCapability = null;
    this._destroyCapability = null;
    this._scripting = null;
    this._ready = false;
    this._eventBus = eventBus;
    this._sandboxBundleSrc = sandboxBundleSrc;
    this._scriptingFactory = scriptingFactory;
    this._docPropertiesLookup = docPropertiesLookup;
  }
  setViewer(pdfViewer) {
    this._pdfViewer = pdfViewer;
  }
  async setDocument(pdfDocument) {
    if (this._pdfDocument) {
      await this._destroyScripting();
    }
    this._pdfDocument = pdfDocument;
    if (!pdfDocument) {
      return;
    }
    const [objects, calculationOrder, docActions] = await Promise.all([pdfDocument.getFieldObjects(), pdfDocument.getCalculationOrderIds(), pdfDocument.getJSActions()]);
    if (!objects && !docActions) {
      await this._destroyScripting();
      return;
    }
    if (pdfDocument !== this._pdfDocument) {
      return;
    }
    try {
      this._scripting = this._createScripting();
    } catch (error) {
      console.error(`PDFScriptingManager.setDocument: "${error?.message}".`);
      await this._destroyScripting();
      return;
    }
    this._internalEvents.set("updatefromsandbox", event => {
      if (event?.source !== window) {
        return;
      }
      this._updateFromSandbox(event.detail);
    });
    this._internalEvents.set("dispatcheventinsandbox", event => {
      this._scripting?.dispatchEventInSandbox(event.detail);
    });
    this._internalEvents.set("pagechanging", ({
      pageNumber,
      previous
    }) => {
      if (pageNumber === previous) {
        return;
      }
      this._dispatchPageClose(previous);
      this._dispatchPageOpen(pageNumber);
    });
    this._internalEvents.set("pagerendered", ({
      pageNumber
    }) => {
      if (!this._pageOpenPending.has(pageNumber)) {
        return;
      }
      if (pageNumber !== this._pdfViewer.currentPageNumber) {
        return;
      }
      this._dispatchPageOpen(pageNumber);
    });
    this._internalEvents.set("pagesdestroy", async event => {
      await this._dispatchPageClose(this._pdfViewer.currentPageNumber);
      await this._scripting?.dispatchEventInSandbox({
        id: "doc",
        name: "WillClose"
      });
      this._closeCapability?.resolve();
    });
    for (const [name, listener] of this._internalEvents) {
      this._eventBus._on(name, listener);
    }
    try {
      const docProperties = await this._getDocProperties();
      if (pdfDocument !== this._pdfDocument) {
        return;
      }
      await this._scripting.createSandbox({
        objects,
        calculationOrder,
        appInfo: {
          platform: navigator.platform,
          language: navigator.language
        },
        docInfo: {
          ...docProperties,
          actions: docActions
        }
      });
      this._eventBus.dispatch("sandboxcreated", {
        source: this
      });
    } catch (error) {
      console.error(`PDFScriptingManager.setDocument: "${error?.message}".`);
      await this._destroyScripting();
      return;
    }
    await this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "Open"
    });
    await this._dispatchPageOpen(this._pdfViewer.currentPageNumber, true);
    Promise.resolve().then(() => {
      if (pdfDocument === this._pdfDocument) {
        this._ready = true;
      }
    });
  }
  async dispatchWillSave(detail) {
    return this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "WillSave"
    });
  }
  async dispatchDidSave(detail) {
    return this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "DidSave"
    });
  }
  async dispatchWillPrint(detail) {
    return this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "WillPrint"
    });
  }
  async dispatchDidPrint(detail) {
    return this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "DidPrint"
    });
  }
  get destroyPromise() {
    return this._destroyCapability?.promise || null;
  }
  get ready() {
    return this._ready;
  }
  get _internalEvents() {
    return (0, _pdf.shadow)(this, "_internalEvents", new Map());
  }
  get _pageOpenPending() {
    return (0, _pdf.shadow)(this, "_pageOpenPending", new Set());
  }
  get _visitedPages() {
    return (0, _pdf.shadow)(this, "_visitedPages", new Map());
  }
  async _updateFromSandbox(detail) {
    const isInPresentationMode = this._pdfViewer.isInPresentationMode || this._pdfViewer.isChangingPresentationMode;
    const {
      id,
      siblings,
      command,
      value
    } = detail;
    if (!id) {
      switch (command) {
        case "clear":
          console.clear();
          break;
        case "error":
          console.error(value);
          break;
        case "layout":
          {
            if (isInPresentationMode) {
              return;
            }
            const modes = (0, _ui_utils.apiPageLayoutToViewerModes)(value);
            this._pdfViewer.spreadMode = modes.spreadMode;
            break;
          }
        case "page-num":
          this._pdfViewer.currentPageNumber = value + 1;
          break;
        case "print":
          await this._pdfViewer.pagesPromise;
          this._eventBus.dispatch("print", {
            source: this
          });
          break;
        case "println":
          console.log(value);
          break;
        case "zoom":
          if (isInPresentationMode) {
            return;
          }
          this._pdfViewer.currentScaleValue = value;
          break;
        case "SaveAs":
          this._eventBus.dispatch("download", {
            source: this
          });
          break;
        case "FirstPage":
          this._pdfViewer.currentPageNumber = 1;
          break;
        case "LastPage":
          this._pdfViewer.currentPageNumber = this._pdfViewer.pagesCount;
          break;
        case "NextPage":
          this._pdfViewer.nextPage();
          break;
        case "PrevPage":
          this._pdfViewer.previousPage();
          break;
        case "ZoomViewIn":
          if (isInPresentationMode) {
            return;
          }
          this._pdfViewer.increaseScale();
          break;
        case "ZoomViewOut":
          if (isInPresentationMode) {
            return;
          }
          this._pdfViewer.decreaseScale();
          break;
      }
      return;
    }
    if (isInPresentationMode) {
      if (detail.focus) {
        return;
      }
    }
    delete detail.id;
    delete detail.siblings;
    const ids = siblings ? [id, ...siblings] : [id];
    for (const elementId of ids) {
      const element = document.querySelector(`[data-element-id="${elementId}"]`);
      if (element) {
        element.dispatchEvent(new CustomEvent("updatefromsandbox", {
          detail
        }));
      } else {
        this._pdfDocument?.annotationStorage.setValue(elementId, detail);
      }
    }
  }
  async _dispatchPageOpen(pageNumber, initialize = false) {
    const pdfDocument = this._pdfDocument,
      visitedPages = this._visitedPages;
    if (initialize) {
      this._closeCapability = (0, _pdf.createPromiseCapability)();
    }
    if (!this._closeCapability) {
      return;
    }
    const pageView = this._pdfViewer.getPageView(pageNumber - 1);
    if (pageView?.renderingState !== _ui_utils.RenderingStates.FINISHED) {
      this._pageOpenPending.add(pageNumber);
      return;
    }
    this._pageOpenPending.delete(pageNumber);
    const actionsPromise = (async () => {
      const actions = await (!visitedPages.has(pageNumber) ? pageView.pdfPage?.getJSActions() : null);
      if (pdfDocument !== this._pdfDocument) {
        return;
      }
      await this._scripting?.dispatchEventInSandbox({
        id: "page",
        name: "PageOpen",
        pageNumber,
        actions
      });
    })();
    visitedPages.set(pageNumber, actionsPromise);
  }
  async _dispatchPageClose(pageNumber) {
    const pdfDocument = this._pdfDocument,
      visitedPages = this._visitedPages;
    if (!this._closeCapability) {
      return;
    }
    if (this._pageOpenPending.has(pageNumber)) {
      return;
    }
    const actionsPromise = visitedPages.get(pageNumber);
    if (!actionsPromise) {
      return;
    }
    visitedPages.set(pageNumber, null);
    await actionsPromise;
    if (pdfDocument !== this._pdfDocument) {
      return;
    }
    await this._scripting?.dispatchEventInSandbox({
      id: "page",
      name: "PageClose",
      pageNumber
    });
  }
  async _getDocProperties() {
    if (this._docPropertiesLookup) {
      return this._docPropertiesLookup(this._pdfDocument);
    }
    throw new Error("_getDocProperties: Unable to lookup properties.");
  }
  _createScripting() {
    this._destroyCapability = (0, _pdf.createPromiseCapability)();
    if (this._scripting) {
      throw new Error("_createScripting: Scripting already exists.");
    }
    if (this._scriptingFactory) {
      return this._scriptingFactory.createScripting({
        sandboxBundleSrc: this._sandboxBundleSrc
      });
    }
    throw new Error("_createScripting: Cannot create scripting.");
  }
  async _destroyScripting() {
    if (!this._scripting) {
      this._pdfDocument = null;
      this._destroyCapability?.resolve();
      return;
    }
    if (this._closeCapability) {
      await Promise.race([this._closeCapability.promise, new Promise(resolve => {
        setTimeout(resolve, 1000);
      })]).catch(reason => {});
      this._closeCapability = null;
    }
    this._pdfDocument = null;
    try {
      await this._scripting.destroySandbox();
    } catch (ex) {}
    for (const [name, listener] of this._internalEvents) {
      this._eventBus._off(name, listener);
    }
    this._internalEvents.clear();
    this._pageOpenPending.clear();
    this._visitedPages.clear();
    this._scripting = null;
    this._ready = false;
    this._destroyCapability?.resolve();
  }
}
exports.PDFScriptingManager = PDFScriptingManager;