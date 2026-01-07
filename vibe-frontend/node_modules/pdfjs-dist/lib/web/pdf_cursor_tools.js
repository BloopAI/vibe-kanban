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
exports.PDFCursorTools = void 0;
var _ui_utils = require("./ui_utils.js");
var _pdf = require("../pdf");
var _grab_to_pan = require("./grab_to_pan.js");
class PDFCursorTools {
  constructor({
    container,
    eventBus,
    cursorToolOnLoad = _ui_utils.CursorTool.SELECT
  }) {
    this.container = container;
    this.eventBus = eventBus;
    this.active = _ui_utils.CursorTool.SELECT;
    this.previouslyActive = null;
    this.handTool = new _grab_to_pan.GrabToPan({
      element: this.container
    });
    this.#addEventListeners();
    Promise.resolve().then(() => {
      this.switchTool(cursorToolOnLoad);
    });
  }
  get activeTool() {
    return this.active;
  }
  switchTool(tool) {
    if (this.previouslyActive !== null) {
      return;
    }
    if (tool === this.active) {
      return;
    }
    const disableActiveTool = () => {
      switch (this.active) {
        case _ui_utils.CursorTool.SELECT:
          break;
        case _ui_utils.CursorTool.HAND:
          this.handTool.deactivate();
          break;
        case _ui_utils.CursorTool.ZOOM:
      }
    };
    switch (tool) {
      case _ui_utils.CursorTool.SELECT:
        disableActiveTool();
        break;
      case _ui_utils.CursorTool.HAND:
        disableActiveTool();
        this.handTool.activate();
        break;
      case _ui_utils.CursorTool.ZOOM:
      default:
        console.error(`switchTool: "${tool}" is an unsupported value.`);
        return;
    }
    this.active = tool;
    this.#dispatchEvent();
  }
  #dispatchEvent() {
    this.eventBus.dispatch("cursortoolchanged", {
      source: this,
      tool: this.active
    });
  }
  #addEventListeners() {
    this.eventBus._on("switchcursortool", evt => {
      this.switchTool(evt.tool);
    });
    let annotationEditorMode = _pdf.AnnotationEditorType.NONE,
      presentationModeState = _ui_utils.PresentationModeState.NORMAL;
    const disableActive = () => {
      const previouslyActive = this.active;
      this.switchTool(_ui_utils.CursorTool.SELECT);
      this.previouslyActive ??= previouslyActive;
    };
    const enableActive = () => {
      const previouslyActive = this.previouslyActive;
      if (previouslyActive !== null && annotationEditorMode === _pdf.AnnotationEditorType.NONE && presentationModeState === _ui_utils.PresentationModeState.NORMAL) {
        this.previouslyActive = null;
        this.switchTool(previouslyActive);
      }
    };
    this.eventBus._on("secondarytoolbarreset", evt => {
      if (this.previouslyActive !== null) {
        annotationEditorMode = _pdf.AnnotationEditorType.NONE;
        presentationModeState = _ui_utils.PresentationModeState.NORMAL;
        enableActive();
      }
    });
    this.eventBus._on("annotationeditormodechanged", ({
      mode
    }) => {
      annotationEditorMode = mode;
      if (mode === _pdf.AnnotationEditorType.NONE) {
        enableActive();
      } else {
        disableActive();
      }
    });
    this.eventBus._on("presentationmodechanged", ({
      state
    }) => {
      presentationModeState = state;
      if (state === _ui_utils.PresentationModeState.NORMAL) {
        enableActive();
      } else if (state === _ui_utils.PresentationModeState.FULLSCREEN) {
        disableActive();
      }
    });
  }
}
exports.PDFCursorTools = PDFCursorTools;