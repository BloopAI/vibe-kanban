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
exports.IRenderableView = exports.IPDFLinkService = exports.IL10n = exports.IDownloadManager = void 0;
class IPDFLinkService {
  get pagesCount() {}
  get page() {}
  set page(value) {}
  get rotation() {}
  set rotation(value) {}
  get isInPresentationMode() {}
  get externalLinkEnabled() {}
  set externalLinkEnabled(value) {}
  async goToDestination(dest) {}
  goToPage(val) {}
  addLinkAttributes(link, url, newWindow = false) {}
  getDestinationHash(dest) {}
  getAnchorUrl(hash) {}
  setHash(hash) {}
  executeNamedAction(action) {}
  executeSetOCGState(action) {}
  cachePageRef(pageNum, pageRef) {}
  isPageVisible(pageNumber) {}
  isPageCached(pageNumber) {}
}
exports.IPDFLinkService = IPDFLinkService;
class IRenderableView {
  constructor() {
    this.resume = null;
  }
  get renderingId() {}
  get renderingState() {}
  draw() {}
}
exports.IRenderableView = IRenderableView;
class IDownloadManager {
  downloadUrl(url, filename) {}
  downloadData(data, filename, contentType) {}
  openOrDownloadData(element, data, filename) {}
  download(blob, url, filename) {}
}
exports.IDownloadManager = IDownloadManager;
class IL10n {
  async getLanguage() {}
  async getDirection() {}
  async get(key, args = null, fallback) {}
  async translate(element) {}
}
exports.IL10n = IL10n;