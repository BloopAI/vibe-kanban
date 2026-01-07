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
exports.XRefMock = exports.TEST_PDFS_PATH = exports.STANDARD_FONT_DATA_URL = exports.DefaultFileReaderFactory = exports.CMAP_URL = void 0;
exports.buildGetDocumentParams = buildGetDocumentParams;
exports.createIdFactory = createIdFactory;
var _stream = require("../../core/stream.js");
var _document = require("../../core/document.js");
var _is_node = require("../../shared/is_node.js");
var _primitives = require("../../core/primitives.js");
const TEST_PDFS_PATH = _is_node.isNodeJS ? "./test/pdfs/" : "../pdfs/";
exports.TEST_PDFS_PATH = TEST_PDFS_PATH;
const CMAP_URL = _is_node.isNodeJS ? "./external/bcmaps/" : "../../external/bcmaps/";
exports.CMAP_URL = CMAP_URL;
const STANDARD_FONT_DATA_URL = _is_node.isNodeJS ? "./external/standard_fonts/" : "../../external/standard_fonts/";
exports.STANDARD_FONT_DATA_URL = STANDARD_FONT_DATA_URL;
class DOMFileReaderFactory {
  static async fetch(params) {
    const response = await fetch(params.path);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
class NodeFileReaderFactory {
  static async fetch(params) {
    const fs = require("fs");
    return new Promise((resolve, reject) => {
      fs.readFile(params.path, (error, data) => {
        if (error || !data) {
          reject(error || new Error(`Empty file for: ${params.path}`));
          return;
        }
        resolve(new Uint8Array(data));
      });
    });
  }
}
const DefaultFileReaderFactory = _is_node.isNodeJS ? NodeFileReaderFactory : DOMFileReaderFactory;
exports.DefaultFileReaderFactory = DefaultFileReaderFactory;
function buildGetDocumentParams(filename, options) {
  const params = Object.create(null);
  params.url = _is_node.isNodeJS ? TEST_PDFS_PATH + filename : new URL(TEST_PDFS_PATH + filename, window.location).href;
  params.standardFontDataUrl = STANDARD_FONT_DATA_URL;
  for (const option in options) {
    params[option] = options[option];
  }
  return params;
}
class XRefMock {
  constructor(array) {
    this._map = Object.create(null);
    this._newTemporaryRefNum = null;
    this._newPersistentRefNum = null;
    this.stream = new _stream.NullStream();
    for (const key in array) {
      const obj = array[key];
      this._map[obj.ref.toString()] = obj.data;
    }
  }
  getNewPersistentRef(obj) {
    if (this._newPersistentRefNum === null) {
      this._newPersistentRefNum = Object.keys(this._map).length || 1;
    }
    const ref = _primitives.Ref.get(this._newPersistentRefNum++, 0);
    this._map[ref.toString()] = obj;
    return ref;
  }
  getNewTemporaryRef() {
    if (this._newTemporaryRefNum === null) {
      this._newTemporaryRefNum = Object.keys(this._map).length || 1;
    }
    return _primitives.Ref.get(this._newTemporaryRefNum++, 0);
  }
  resetNewTemporaryRef() {
    this._newTemporaryRefNum = null;
  }
  fetch(ref) {
    return this._map[ref.toString()];
  }
  async fetchAsync(ref) {
    return this.fetch(ref);
  }
  fetchIfRef(obj) {
    if (obj instanceof _primitives.Ref) {
      return this.fetch(obj);
    }
    return obj;
  }
  async fetchIfRefAsync(obj) {
    return this.fetchIfRef(obj);
  }
}
exports.XRefMock = XRefMock;
function createIdFactory(pageIndex) {
  const pdfManager = {
    get docId() {
      return "d0";
    }
  };
  const stream = new _stream.StringStream("Dummy_PDF_data");
  const pdfDocument = new _document.PDFDocument(pdfManager, stream);
  const page = new _document.Page({
    pdfManager: pdfDocument.pdfManager,
    xref: pdfDocument.xref,
    pageIndex,
    globalIdFactory: pdfDocument._globalIdFactory
  });
  return page._localIdFactory;
}