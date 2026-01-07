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
exports.PDFAttachmentViewer = void 0;
var _pdf = require("../pdf");
var _base_tree_viewer = require("./base_tree_viewer.js");
var _event_utils = require("./event_utils.js");
class PDFAttachmentViewer extends _base_tree_viewer.BaseTreeViewer {
  constructor(options) {
    super(options);
    this.downloadManager = options.downloadManager;
    this.eventBus._on("fileattachmentannotation", this.#appendAttachment.bind(this));
  }
  reset(keepRenderedCapability = false) {
    super.reset();
    this._attachments = null;
    if (!keepRenderedCapability) {
      this._renderedCapability = (0, _pdf.createPromiseCapability)();
    }
    this._pendingDispatchEvent = false;
  }
  async _dispatchEvent(attachmentsCount) {
    this._renderedCapability.resolve();
    if (attachmentsCount === 0 && !this._pendingDispatchEvent) {
      this._pendingDispatchEvent = true;
      await (0, _event_utils.waitOnEventOrTimeout)({
        target: this.eventBus,
        name: "annotationlayerrendered",
        delay: 1000
      });
      if (!this._pendingDispatchEvent) {
        return;
      }
    }
    this._pendingDispatchEvent = false;
    this.eventBus.dispatch("attachmentsloaded", {
      source: this,
      attachmentsCount
    });
  }
  _bindLink(element, {
    content,
    filename
  }) {
    element.onclick = () => {
      this.downloadManager.openOrDownloadData(element, content, filename);
      return false;
    };
  }
  render({
    attachments,
    keepRenderedCapability = false
  }) {
    if (this._attachments) {
      this.reset(keepRenderedCapability);
    }
    this._attachments = attachments || null;
    if (!attachments) {
      this._dispatchEvent(0);
      return;
    }
    const names = Object.keys(attachments).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    const fragment = document.createDocumentFragment();
    let attachmentsCount = 0;
    for (const name of names) {
      const item = attachments[name];
      const content = item.content,
        filename = (0, _pdf.getFilenameFromUrl)(item.filename, true);
      const div = document.createElement("div");
      div.className = "treeItem";
      const element = document.createElement("a");
      this._bindLink(element, {
        content,
        filename
      });
      element.textContent = this._normalizeTextContent(filename);
      div.append(element);
      fragment.append(div);
      attachmentsCount++;
    }
    this._finishRendering(fragment, attachmentsCount);
  }
  #appendAttachment({
    filename,
    content
  }) {
    const renderedPromise = this._renderedCapability.promise;
    renderedPromise.then(() => {
      if (renderedPromise !== this._renderedCapability.promise) {
        return;
      }
      const attachments = this._attachments || Object.create(null);
      for (const name in attachments) {
        if (filename === name) {
          return;
        }
      }
      attachments[filename] = {
        filename,
        content
      };
      this.render({
        attachments,
        keepRenderedCapability: true
      });
    });
  }
}
exports.PDFAttachmentViewer = PDFAttachmentViewer;