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
exports.FirefoxCom = exports.DownloadManager = void 0;
require("../extensions/firefox/tools/l10n.js");
var _app = require("./app.js");
var _pdf = require("../pdf");
var _preferences = require("./preferences.js");
var _ui_utils = require("./ui_utils.js");
var _l10n_utils = require("./l10n_utils.js");
{
  throw new Error('Module "./firefoxcom.js" shall not be used outside MOZCENTRAL builds.');
}
class FirefoxCom {
  static requestSync(action, data) {
    const request = document.createTextNode("");
    document.documentElement.append(request);
    const sender = document.createEvent("CustomEvent");
    sender.initCustomEvent("pdf.js.message", true, false, {
      action,
      data,
      sync: true
    });
    request.dispatchEvent(sender);
    const response = sender.detail.response;
    request.remove();
    return response;
  }
  static requestAsync(action, data) {
    return new Promise(resolve => {
      this.request(action, data, resolve);
    });
  }
  static request(action, data, callback = null) {
    const request = document.createTextNode("");
    if (callback) {
      request.addEventListener("pdf.js.response", event => {
        const response = event.detail.response;
        event.target.remove();
        callback(response);
      }, {
        once: true
      });
    }
    document.documentElement.append(request);
    const sender = document.createEvent("CustomEvent");
    sender.initCustomEvent("pdf.js.message", true, false, {
      action,
      data,
      sync: false,
      responseExpected: !!callback
    });
    request.dispatchEvent(sender);
  }
}
exports.FirefoxCom = FirefoxCom;
class DownloadManager {
  #openBlobUrls = new WeakMap();
  downloadUrl(url, filename) {
    FirefoxCom.request("download", {
      originalUrl: url,
      filename
    });
  }
  downloadData(data, filename, contentType) {
    const blobUrl = URL.createObjectURL(new Blob([data], {
      type: contentType
    }));
    FirefoxCom.request("download", {
      blobUrl,
      originalUrl: blobUrl,
      filename,
      isAttachment: true
    });
  }
  openOrDownloadData(element, data, filename) {
    const isPdfData = (0, _pdf.isPdfFile)(filename);
    const contentType = isPdfData ? "application/pdf" : "";
    if (isPdfData) {
      let blobUrl = this.#openBlobUrls.get(element);
      if (!blobUrl) {
        blobUrl = URL.createObjectURL(new Blob([data], {
          type: contentType
        }));
        this.#openBlobUrls.set(element, blobUrl);
      }
      const viewerUrl = blobUrl + "#filename=" + encodeURIComponent(filename);
      try {
        window.open(viewerUrl);
        return true;
      } catch (ex) {
        console.error(`openOrDownloadData: ${ex}`);
        URL.revokeObjectURL(blobUrl);
        this.#openBlobUrls.delete(element);
      }
    }
    this.downloadData(data, filename, contentType);
    return false;
  }
  download(blob, url, filename) {
    const blobUrl = URL.createObjectURL(blob);
    FirefoxCom.request("download", {
      blobUrl,
      originalUrl: url,
      filename
    });
  }
}
exports.DownloadManager = DownloadManager;
class FirefoxPreferences extends _preferences.BasePreferences {
  async _writeToStorage(prefObj) {
    return FirefoxCom.requestAsync("setPreferences", prefObj);
  }
  async _readFromStorage(prefObj) {
    const prefStr = await FirefoxCom.requestAsync("getPreferences", prefObj);
    return JSON.parse(prefStr);
  }
}
class MozL10n {
  constructor(mozL10n) {
    this.mozL10n = mozL10n;
  }
  async getLanguage() {
    return this.mozL10n.getLanguage();
  }
  async getDirection() {
    return this.mozL10n.getDirection();
  }
  async get(key, args = null, fallback = (0, _l10n_utils.getL10nFallback)(key, args)) {
    return this.mozL10n.get(key, args, fallback);
  }
  async translate(element) {
    this.mozL10n.translate(element);
  }
}
(function listenFindEvents() {
  const events = ["find", "findagain", "findhighlightallchange", "findcasesensitivitychange", "findentirewordchange", "findbarclose", "finddiacriticmatchingchange"];
  const findLen = "find".length;
  const handleEvent = function ({
    type,
    detail
  }) {
    if (!_app.PDFViewerApplication.initialized) {
      return;
    }
    if (type === "findbarclose") {
      _app.PDFViewerApplication.eventBus.dispatch(type, {
        source: window
      });
      return;
    }
    _app.PDFViewerApplication.eventBus.dispatch("find", {
      source: window,
      type: type.substring(findLen),
      query: detail.query,
      phraseSearch: true,
      caseSensitive: !!detail.caseSensitive,
      entireWord: !!detail.entireWord,
      highlightAll: !!detail.highlightAll,
      findPrevious: !!detail.findPrevious,
      matchDiacritics: !!detail.matchDiacritics
    });
  };
  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();
(function listenZoomEvents() {
  const events = ["zoomin", "zoomout", "zoomreset"];
  const handleEvent = function ({
    type,
    detail
  }) {
    if (!_app.PDFViewerApplication.initialized) {
      return;
    }
    if (type === "zoomreset" && _app.PDFViewerApplication.pdfViewer.currentScaleValue === _ui_utils.DEFAULT_SCALE_VALUE) {
      return;
    }
    _app.PDFViewerApplication.eventBus.dispatch(type, {
      source: window
    });
  };
  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();
(function listenSaveEvent() {
  const handleEvent = function ({
    type,
    detail
  }) {
    if (!_app.PDFViewerApplication.initialized) {
      return;
    }
    _app.PDFViewerApplication.eventBus.dispatch("download", {
      source: window
    });
  };
  window.addEventListener("save", handleEvent);
})();
(function listenEditingEvent() {
  const handleEvent = function ({
    detail
  }) {
    if (!_app.PDFViewerApplication.initialized) {
      return;
    }
    _app.PDFViewerApplication.eventBus.dispatch("editingaction", {
      source: window,
      name: detail.name
    });
  };
  window.addEventListener("editingaction", handleEvent);
})();
class FirefoxComDataRangeTransport extends _pdf.PDFDataRangeTransport {
  requestDataRange(begin, end) {
    FirefoxCom.request("requestDataRange", {
      begin,
      end
    });
  }
  abort() {
    FirefoxCom.requestSync("abortLoading", null);
  }
}
class FirefoxScripting {
  static async createSandbox(data) {
    const success = await FirefoxCom.requestAsync("createSandbox", data);
    if (!success) {
      throw new Error("Cannot create sandbox.");
    }
  }
  static async dispatchEventInSandbox(event) {
    FirefoxCom.request("dispatchEventInSandbox", event);
  }
  static async destroySandbox() {
    FirefoxCom.request("destroySandbox", null);
  }
}
class FirefoxExternalServices extends _app.DefaultExternalServices {
  static updateFindControlState(data) {
    FirefoxCom.request("updateFindControlState", data);
  }
  static updateFindMatchesCount(data) {
    FirefoxCom.request("updateFindMatchesCount", data);
  }
  static initPassiveLoading(callbacks) {
    let pdfDataRangeTransport;
    window.addEventListener("message", function windowMessage(e) {
      if (e.source !== null) {
        console.warn("Rejected untrusted message from " + e.origin);
        return;
      }
      const args = e.data;
      if (typeof args !== "object" || !("pdfjsLoadAction" in args)) {
        return;
      }
      switch (args.pdfjsLoadAction) {
        case "supportsRangedLoading":
          if (args.done && !args.data) {
            callbacks.onError();
            break;
          }
          pdfDataRangeTransport = new FirefoxComDataRangeTransport(args.length, args.data, args.done, args.filename);
          callbacks.onOpenWithTransport(pdfDataRangeTransport);
          break;
        case "range":
          pdfDataRangeTransport.onDataRange(args.begin, args.chunk);
          break;
        case "rangeProgress":
          pdfDataRangeTransport.onDataProgress(args.loaded);
          break;
        case "progressiveRead":
          pdfDataRangeTransport.onDataProgressiveRead(args.chunk);
          pdfDataRangeTransport.onDataProgress(args.loaded, args.total);
          break;
        case "progressiveDone":
          pdfDataRangeTransport?.onDataProgressiveDone();
          break;
        case "progress":
          callbacks.onProgress(args.loaded, args.total);
          break;
        case "complete":
          if (!args.data) {
            callbacks.onError(args.errorCode);
            break;
          }
          callbacks.onOpenWithData(args.data, args.filename);
          break;
      }
    });
    FirefoxCom.requestSync("initPassiveLoading", null);
  }
  static reportTelemetry(data) {
    FirefoxCom.request("reportTelemetry", JSON.stringify(data));
  }
  static createDownloadManager() {
    return new DownloadManager();
  }
  static createPreferences() {
    return new FirefoxPreferences();
  }
  static updateEditorStates(data) {
    FirefoxCom.request("updateEditorStates", data);
  }
  static createL10n(options) {
    const mozL10n = document.mozL10n;
    return new MozL10n(mozL10n);
  }
  static createScripting(options) {
    return FirefoxScripting;
  }
  static get supportsPinchToZoom() {
    const support = FirefoxCom.requestSync("supportsPinchToZoom");
    return (0, _pdf.shadow)(this, "supportsPinchToZoom", support);
  }
  static get supportsIntegratedFind() {
    const support = FirefoxCom.requestSync("supportsIntegratedFind");
    return (0, _pdf.shadow)(this, "supportsIntegratedFind", support);
  }
  static get supportsDocumentFonts() {
    const support = FirefoxCom.requestSync("supportsDocumentFonts");
    return (0, _pdf.shadow)(this, "supportsDocumentFonts", support);
  }
  static get supportedMouseWheelZoomModifierKeys() {
    const support = FirefoxCom.requestSync("supportedMouseWheelZoomModifierKeys");
    return (0, _pdf.shadow)(this, "supportedMouseWheelZoomModifierKeys", support);
  }
  static get isInAutomation() {
    const isInAutomation = FirefoxCom.requestSync("isInAutomation");
    return (0, _pdf.shadow)(this, "isInAutomation", isInAutomation);
  }
}
_app.PDFViewerApplication.externalServices = FirefoxExternalServices;
document.mozL10n.setExternalLocalizerServices({
  getLocale() {
    return FirefoxCom.requestSync("getLocale", null);
  },
  getStrings(key) {
    return FirefoxCom.requestSync("getStrings", null);
  }
});