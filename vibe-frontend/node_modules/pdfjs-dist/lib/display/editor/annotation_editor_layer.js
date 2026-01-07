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
exports.AnnotationEditorLayer = void 0;
var _util = require("../../shared/util.js");
var _tools = require("./tools.js");
var _freetext = require("./freetext.js");
var _ink = require("./ink.js");
var _display_utils = require("../display_utils.js");
class AnnotationEditorLayer {
  #accessibilityManager;
  #allowClick = false;
  #boundPointerup = this.pointerup.bind(this);
  #boundPointerdown = this.pointerdown.bind(this);
  #editors = new Map();
  #hadPointerDown = false;
  #isCleaningUp = false;
  #uiManager;
  static _initialized = false;
  constructor(options) {
    if (!AnnotationEditorLayer._initialized) {
      AnnotationEditorLayer._initialized = true;
      _freetext.FreeTextEditor.initialize(options.l10n);
      _ink.InkEditor.initialize(options.l10n);
    }
    options.uiManager.registerEditorTypes([_freetext.FreeTextEditor, _ink.InkEditor]);
    this.#uiManager = options.uiManager;
    this.pageIndex = options.pageIndex;
    this.div = options.div;
    this.#accessibilityManager = options.accessibilityManager;
    this.#uiManager.addLayer(this);
  }
  get isEmpty() {
    return this.#editors.size === 0;
  }
  updateToolbar(mode) {
    this.#uiManager.updateToolbar(mode);
  }
  updateMode(mode = this.#uiManager.getMode()) {
    this.#cleanup();
    if (mode === _util.AnnotationEditorType.INK) {
      this.addInkEditorIfNeeded(false);
      this.disableClick();
    } else {
      this.enableClick();
    }
    this.#uiManager.unselectAll();
    if (mode !== _util.AnnotationEditorType.NONE) {
      this.div.classList.toggle("freeTextEditing", mode === _util.AnnotationEditorType.FREETEXT);
      this.div.classList.toggle("inkEditing", mode === _util.AnnotationEditorType.INK);
      this.div.hidden = false;
    }
  }
  addInkEditorIfNeeded(isCommitting) {
    if (!isCommitting && this.#uiManager.getMode() !== _util.AnnotationEditorType.INK) {
      return;
    }
    if (!isCommitting) {
      for (const editor of this.#editors.values()) {
        if (editor.isEmpty()) {
          editor.setInBackground();
          return;
        }
      }
    }
    const editor = this.#createAndAddNewEditor({
      offsetX: 0,
      offsetY: 0
    });
    editor.setInBackground();
  }
  setEditingState(isEditing) {
    this.#uiManager.setEditingState(isEditing);
  }
  addCommands(params) {
    this.#uiManager.addCommands(params);
  }
  enable() {
    this.div.style.pointerEvents = "auto";
    for (const editor of this.#editors.values()) {
      editor.enableEditing();
    }
  }
  disable() {
    this.div.style.pointerEvents = "none";
    for (const editor of this.#editors.values()) {
      editor.disableEditing();
    }
    this.#cleanup();
    if (this.isEmpty) {
      this.div.hidden = true;
    }
  }
  setActiveEditor(editor) {
    const currentActive = this.#uiManager.getActive();
    if (currentActive === editor) {
      return;
    }
    this.#uiManager.setActiveEditor(editor);
  }
  enableClick() {
    this.div.addEventListener("pointerdown", this.#boundPointerdown);
    this.div.addEventListener("pointerup", this.#boundPointerup);
  }
  disableClick() {
    this.div.removeEventListener("pointerdown", this.#boundPointerdown);
    this.div.removeEventListener("pointerup", this.#boundPointerup);
  }
  attach(editor) {
    this.#editors.set(editor.id, editor);
  }
  detach(editor) {
    this.#editors.delete(editor.id);
    this.#accessibilityManager?.removePointerInTextLayer(editor.contentDiv);
  }
  remove(editor) {
    this.#uiManager.removeEditor(editor);
    this.detach(editor);
    editor.div.style.display = "none";
    setTimeout(() => {
      editor.div.style.display = "";
      editor.div.remove();
      editor.isAttachedToDOM = false;
      if (document.activeElement === document.body) {
        this.#uiManager.focusMainContainer();
      }
    }, 0);
    if (!this.#isCleaningUp) {
      this.addInkEditorIfNeeded(false);
    }
  }
  #changeParent(editor) {
    if (editor.parent === this) {
      return;
    }
    this.attach(editor);
    editor.parent?.detach(editor);
    editor.setParent(this);
    if (editor.div && editor.isAttachedToDOM) {
      editor.div.remove();
      this.div.append(editor.div);
    }
  }
  add(editor) {
    this.#changeParent(editor);
    this.#uiManager.addEditor(editor);
    this.attach(editor);
    if (!editor.isAttachedToDOM) {
      const div = editor.render();
      this.div.append(div);
      editor.isAttachedToDOM = true;
    }
    this.moveEditorInDOM(editor);
    editor.onceAdded();
    this.#uiManager.addToAnnotationStorage(editor);
  }
  moveEditorInDOM(editor) {
    this.#accessibilityManager?.moveElementInDOM(this.div, editor.div, editor.contentDiv, true);
  }
  addOrRebuild(editor) {
    if (editor.needsToBeRebuilt()) {
      editor.rebuild();
    } else {
      this.add(editor);
    }
  }
  addANewEditor(editor) {
    const cmd = () => {
      this.addOrRebuild(editor);
    };
    const undo = () => {
      editor.remove();
    };
    this.addCommands({
      cmd,
      undo,
      mustExec: true
    });
  }
  addUndoableEditor(editor) {
    const cmd = () => {
      this.addOrRebuild(editor);
    };
    const undo = () => {
      editor.remove();
    };
    this.addCommands({
      cmd,
      undo,
      mustExec: false
    });
  }
  getNextId() {
    return this.#uiManager.getId();
  }
  #createNewEditor(params) {
    switch (this.#uiManager.getMode()) {
      case _util.AnnotationEditorType.FREETEXT:
        return new _freetext.FreeTextEditor(params);
      case _util.AnnotationEditorType.INK:
        return new _ink.InkEditor(params);
    }
    return null;
  }
  deserialize(data) {
    switch (data.annotationType) {
      case _util.AnnotationEditorType.FREETEXT:
        return _freetext.FreeTextEditor.deserialize(data, this, this.#uiManager);
      case _util.AnnotationEditorType.INK:
        return _ink.InkEditor.deserialize(data, this, this.#uiManager);
    }
    return null;
  }
  #createAndAddNewEditor(event) {
    const id = this.getNextId();
    const editor = this.#createNewEditor({
      parent: this,
      id,
      x: event.offsetX,
      y: event.offsetY,
      uiManager: this.#uiManager
    });
    if (editor) {
      this.add(editor);
    }
    return editor;
  }
  setSelected(editor) {
    this.#uiManager.setSelected(editor);
  }
  toggleSelected(editor) {
    this.#uiManager.toggleSelected(editor);
  }
  isSelected(editor) {
    return this.#uiManager.isSelected(editor);
  }
  unselect(editor) {
    this.#uiManager.unselect(editor);
  }
  pointerup(event) {
    const {
      isMac
    } = _util.FeatureTest.platform;
    if (event.button !== 0 || event.ctrlKey && isMac) {
      return;
    }
    if (event.target !== this.div) {
      return;
    }
    if (!this.#hadPointerDown) {
      return;
    }
    this.#hadPointerDown = false;
    if (!this.#allowClick) {
      this.#allowClick = true;
      return;
    }
    this.#createAndAddNewEditor(event);
  }
  pointerdown(event) {
    const {
      isMac
    } = _util.FeatureTest.platform;
    if (event.button !== 0 || event.ctrlKey && isMac) {
      return;
    }
    if (event.target !== this.div) {
      return;
    }
    this.#hadPointerDown = true;
    const editor = this.#uiManager.getActive();
    this.#allowClick = !editor || editor.isEmpty();
  }
  drop(event) {
    const id = event.dataTransfer.getData("text/plain");
    const editor = this.#uiManager.getEditor(id);
    if (!editor) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    this.#changeParent(editor);
    const rect = this.div.getBoundingClientRect();
    const endX = event.clientX - rect.x;
    const endY = event.clientY - rect.y;
    editor.translate(endX - editor.startX, endY - editor.startY);
    this.moveEditorInDOM(editor);
    editor.div.focus();
  }
  dragover(event) {
    event.preventDefault();
  }
  destroy() {
    if (this.#uiManager.getActive()?.parent === this) {
      this.#uiManager.setActiveEditor(null);
    }
    for (const editor of this.#editors.values()) {
      this.#accessibilityManager?.removePointerInTextLayer(editor.contentDiv);
      editor.setParent(null);
      editor.isAttachedToDOM = false;
      editor.div.remove();
    }
    this.div = null;
    this.#editors.clear();
    this.#uiManager.removeLayer(this);
  }
  #cleanup() {
    this.#isCleaningUp = true;
    for (const editor of this.#editors.values()) {
      if (editor.isEmpty()) {
        editor.remove();
      }
    }
    this.#isCleaningUp = false;
  }
  render({
    viewport
  }) {
    this.viewport = viewport;
    (0, _display_utils.setLayerDimensions)(this.div, viewport);
    (0, _tools.bindEvents)(this, this.div, ["dragover", "drop"]);
    for (const editor of this.#uiManager.getEditors(this.pageIndex)) {
      this.add(editor);
    }
    this.updateMode();
  }
  update({
    viewport
  }) {
    this.#uiManager.commitOrRemove();
    this.viewport = viewport;
    (0, _display_utils.setLayerDimensions)(this.div, {
      rotation: viewport.rotation
    });
    this.updateMode();
  }
  get pageDimensions() {
    const {
      pageWidth,
      pageHeight
    } = this.viewport.rawDims;
    return [pageWidth, pageHeight];
  }
}
exports.AnnotationEditorLayer = AnnotationEditorLayer;