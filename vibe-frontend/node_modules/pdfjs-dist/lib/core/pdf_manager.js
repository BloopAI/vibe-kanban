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
exports.NetworkPdfManager = exports.LocalPdfManager = void 0;
var _util = require("../shared/util.js");
var _chunked_stream = require("./chunked_stream.js");
var _core_utils = require("./core_utils.js");
var _document = require("./document.js");
var _stream = require("./stream.js");
function parseDocBaseUrl(url) {
  if (url) {
    const absoluteUrl = (0, _util.createValidAbsoluteUrl)(url);
    if (absoluteUrl) {
      return absoluteUrl.href;
    }
    (0, _util.warn)(`Invalid absolute docBaseUrl: "${url}".`);
  }
  return null;
}
class BasePdfManager {
  constructor(args) {
    if (this.constructor === BasePdfManager) {
      (0, _util.unreachable)("Cannot initialize BasePdfManager.");
    }
    this._docBaseUrl = parseDocBaseUrl(args.docBaseUrl);
    this._docId = args.docId;
    this._password = args.password;
    this.enableXfa = args.enableXfa;
    this.evaluatorOptions = args.evaluatorOptions;
  }
  get docId() {
    return this._docId;
  }
  get password() {
    return this._password;
  }
  get docBaseUrl() {
    const catalog = this.pdfDocument.catalog;
    return (0, _util.shadow)(this, "docBaseUrl", catalog.baseUrl || this._docBaseUrl);
  }
  ensureDoc(prop, args) {
    return this.ensure(this.pdfDocument, prop, args);
  }
  ensureXRef(prop, args) {
    return this.ensure(this.pdfDocument.xref, prop, args);
  }
  ensureCatalog(prop, args) {
    return this.ensure(this.pdfDocument.catalog, prop, args);
  }
  getPage(pageIndex) {
    return this.pdfDocument.getPage(pageIndex);
  }
  fontFallback(id, handler) {
    return this.pdfDocument.fontFallback(id, handler);
  }
  loadXfaFonts(handler, task) {
    return this.pdfDocument.loadXfaFonts(handler, task);
  }
  loadXfaImages() {
    return this.pdfDocument.loadXfaImages();
  }
  serializeXfaData(annotationStorage) {
    return this.pdfDocument.serializeXfaData(annotationStorage);
  }
  cleanup(manuallyTriggered = false) {
    return this.pdfDocument.cleanup(manuallyTriggered);
  }
  async ensure(obj, prop, args) {
    (0, _util.unreachable)("Abstract method `ensure` called");
  }
  requestRange(begin, end) {
    (0, _util.unreachable)("Abstract method `requestRange` called");
  }
  requestLoadedStream(noFetch = false) {
    (0, _util.unreachable)("Abstract method `requestLoadedStream` called");
  }
  sendProgressiveData(chunk) {
    (0, _util.unreachable)("Abstract method `sendProgressiveData` called");
  }
  updatePassword(password) {
    this._password = password;
  }
  terminate(reason) {
    (0, _util.unreachable)("Abstract method `terminate` called");
  }
}
class LocalPdfManager extends BasePdfManager {
  constructor(args) {
    super(args);
    const stream = new _stream.Stream(args.source);
    this.pdfDocument = new _document.PDFDocument(this, stream);
    this._loadedStreamPromise = Promise.resolve(stream);
  }
  async ensure(obj, prop, args) {
    const value = obj[prop];
    if (typeof value === "function") {
      return value.apply(obj, args);
    }
    return value;
  }
  requestRange(begin, end) {
    return Promise.resolve();
  }
  requestLoadedStream(noFetch = false) {
    return this._loadedStreamPromise;
  }
  terminate(reason) {}
}
exports.LocalPdfManager = LocalPdfManager;
class NetworkPdfManager extends BasePdfManager {
  constructor(args) {
    super(args);
    this.streamManager = new _chunked_stream.ChunkedStreamManager(args.source, {
      msgHandler: args.handler,
      length: args.length,
      disableAutoFetch: args.disableAutoFetch,
      rangeChunkSize: args.rangeChunkSize
    });
    this.pdfDocument = new _document.PDFDocument(this, this.streamManager.getStream());
  }
  async ensure(obj, prop, args) {
    try {
      const value = obj[prop];
      if (typeof value === "function") {
        return value.apply(obj, args);
      }
      return value;
    } catch (ex) {
      if (!(ex instanceof _core_utils.MissingDataException)) {
        throw ex;
      }
      await this.requestRange(ex.begin, ex.end);
      return this.ensure(obj, prop, args);
    }
  }
  requestRange(begin, end) {
    return this.streamManager.requestRange(begin, end);
  }
  requestLoadedStream(noFetch = false) {
    return this.streamManager.requestAllChunks(noFetch);
  }
  sendProgressiveData(chunk) {
    this.streamManager.onReceiveData({
      chunk
    });
  }
  terminate(reason) {
    this.streamManager.abort(reason);
  }
}
exports.NetworkPdfManager = NetworkPdfManager;