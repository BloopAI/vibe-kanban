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
exports.Toolbar = void 0;
var _ui_utils = require("./ui_utils.js");
var _pdf = require("../pdf");
const PAGE_NUMBER_LOADING_INDICATOR = "visiblePageIsLoading";
class Toolbar {
  #wasLocalized = false;
  constructor(options, eventBus, l10n) {
    this.toolbar = options.container;
    this.eventBus = eventBus;
    this.l10n = l10n;
    this.buttons = [{
      element: options.previous,
      eventName: "previouspage"
    }, {
      element: options.next,
      eventName: "nextpage"
    }, {
      element: options.zoomIn,
      eventName: "zoomin"
    }, {
      element: options.zoomOut,
      eventName: "zoomout"
    }, {
      element: options.print,
      eventName: "print"
    }, {
      element: options.download,
      eventName: "download"
    }, {
      element: options.editorFreeTextButton,
      eventName: "switchannotationeditormode",
      eventDetails: {
        get mode() {
          const {
            classList
          } = options.editorFreeTextButton;
          return classList.contains("toggled") ? _pdf.AnnotationEditorType.NONE : _pdf.AnnotationEditorType.FREETEXT;
        }
      }
    }, {
      element: options.editorInkButton,
      eventName: "switchannotationeditormode",
      eventDetails: {
        get mode() {
          const {
            classList
          } = options.editorInkButton;
          return classList.contains("toggled") ? _pdf.AnnotationEditorType.NONE : _pdf.AnnotationEditorType.INK;
        }
      }
    }];
    this.buttons.push({
      element: options.openFile,
      eventName: "openfile"
    });
    this.items = {
      numPages: options.numPages,
      pageNumber: options.pageNumber,
      scaleSelect: options.scaleSelect,
      customScaleOption: options.customScaleOption,
      previous: options.previous,
      next: options.next,
      zoomIn: options.zoomIn,
      zoomOut: options.zoomOut
    };
    this.#bindListeners(options);
    this.reset();
  }
  setPageNumber(pageNumber, pageLabel) {
    this.pageNumber = pageNumber;
    this.pageLabel = pageLabel;
    this.#updateUIState(false);
  }
  setPagesCount(pagesCount, hasPageLabels) {
    this.pagesCount = pagesCount;
    this.hasPageLabels = hasPageLabels;
    this.#updateUIState(true);
  }
  setPageScale(pageScaleValue, pageScale) {
    this.pageScaleValue = (pageScaleValue || pageScale).toString();
    this.pageScale = pageScale;
    this.#updateUIState(false);
  }
  reset() {
    this.pageNumber = 0;
    this.pageLabel = null;
    this.hasPageLabels = false;
    this.pagesCount = 0;
    this.pageScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
    this.pageScale = _ui_utils.DEFAULT_SCALE;
    this.#updateUIState(true);
    this.updateLoadingIndicatorState();
    this.eventBus.dispatch("toolbarreset", {
      source: this
    });
  }
  #bindListeners(options) {
    const {
      pageNumber,
      scaleSelect
    } = this.items;
    const self = this;
    for (const {
      element,
      eventName,
      eventDetails
    } of this.buttons) {
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          const details = {
            source: this
          };
          if (eventDetails) {
            for (const property in eventDetails) {
              details[property] = eventDetails[property];
            }
          }
          this.eventBus.dispatch(eventName, details);
        }
      });
    }
    pageNumber.addEventListener("click", function () {
      this.select();
    });
    pageNumber.addEventListener("change", function () {
      self.eventBus.dispatch("pagenumberchanged", {
        source: self,
        value: this.value
      });
    });
    scaleSelect.addEventListener("change", function () {
      if (this.value === "custom") {
        return;
      }
      self.eventBus.dispatch("scalechanged", {
        source: self,
        value: this.value
      });
    });
    scaleSelect.addEventListener("click", function (evt) {
      const target = evt.target;
      if (this.value === self.pageScaleValue && target.tagName.toUpperCase() === "OPTION") {
        this.blur();
      }
    });
    scaleSelect.oncontextmenu = _ui_utils.noContextMenuHandler;
    this.eventBus._on("localized", () => {
      this.#wasLocalized = true;
      this.#adjustScaleWidth();
      this.#updateUIState(true);
    });
    this.#bindEditorToolsListener(options);
  }
  #bindEditorToolsListener({
    editorFreeTextButton,
    editorFreeTextParamsToolbar,
    editorInkButton,
    editorInkParamsToolbar
  }) {
    const editorModeChanged = (evt, disableButtons = false) => {
      const editorButtons = [{
        mode: _pdf.AnnotationEditorType.FREETEXT,
        button: editorFreeTextButton,
        toolbar: editorFreeTextParamsToolbar
      }, {
        mode: _pdf.AnnotationEditorType.INK,
        button: editorInkButton,
        toolbar: editorInkParamsToolbar
      }];
      for (const {
        mode,
        button,
        toolbar
      } of editorButtons) {
        const checked = mode === evt.mode;
        button.classList.toggle("toggled", checked);
        button.setAttribute("aria-checked", checked);
        button.disabled = disableButtons;
        toolbar?.classList.toggle("hidden", !checked);
      }
    };
    this.eventBus._on("annotationeditormodechanged", editorModeChanged);
    this.eventBus._on("toolbarreset", evt => {
      if (evt.source === this) {
        editorModeChanged({
          mode: _pdf.AnnotationEditorType.NONE
        }, true);
      }
    });
  }
  #updateUIState(resetNumPages = false) {
    if (!this.#wasLocalized) {
      return;
    }
    const {
      pageNumber,
      pagesCount,
      pageScaleValue,
      pageScale,
      items
    } = this;
    if (resetNumPages) {
      if (this.hasPageLabels) {
        items.pageNumber.type = "text";
      } else {
        items.pageNumber.type = "number";
        this.l10n.get("of_pages", {
          pagesCount
        }).then(msg => {
          items.numPages.textContent = msg;
        });
      }
      items.pageNumber.max = pagesCount;
    }
    if (this.hasPageLabels) {
      items.pageNumber.value = this.pageLabel;
      this.l10n.get("page_of_pages", {
        pageNumber,
        pagesCount
      }).then(msg => {
        items.numPages.textContent = msg;
      });
    } else {
      items.pageNumber.value = pageNumber;
    }
    items.previous.disabled = pageNumber <= 1;
    items.next.disabled = pageNumber >= pagesCount;
    items.zoomOut.disabled = pageScale <= _ui_utils.MIN_SCALE;
    items.zoomIn.disabled = pageScale >= _ui_utils.MAX_SCALE;
    this.l10n.get("page_scale_percent", {
      scale: Math.round(pageScale * 10000) / 100
    }).then(msg => {
      let predefinedValueFound = false;
      for (const option of items.scaleSelect.options) {
        if (option.value !== pageScaleValue) {
          option.selected = false;
          continue;
        }
        option.selected = true;
        predefinedValueFound = true;
      }
      if (!predefinedValueFound) {
        items.customScaleOption.textContent = msg;
        items.customScaleOption.selected = true;
      }
    });
  }
  updateLoadingIndicatorState(loading = false) {
    const {
      pageNumber
    } = this.items;
    pageNumber.classList.toggle(PAGE_NUMBER_LOADING_INDICATOR, loading);
  }
  async #adjustScaleWidth() {
    const {
      items,
      l10n
    } = this;
    const predefinedValuesPromise = Promise.all([l10n.get("page_scale_auto"), l10n.get("page_scale_actual"), l10n.get("page_scale_fit"), l10n.get("page_scale_width")]);
    await _ui_utils.animationStarted;
    const style = getComputedStyle(items.scaleSelect);
    const scaleSelectWidth = parseFloat(style.getPropertyValue("--scale-select-width"));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", {
      alpha: false
    });
    ctx.font = `${style.fontSize} ${style.fontFamily}`;
    let maxWidth = 0;
    for (const predefinedValue of await predefinedValuesPromise) {
      const {
        width
      } = ctx.measureText(predefinedValue);
      if (width > maxWidth) {
        maxWidth = width;
      }
    }
    maxWidth += 0.3 * scaleSelectWidth;
    if (maxWidth > scaleSelectWidth) {
      const container = items.scaleSelect.parentNode;
      container.style.setProperty("--scale-select-width", `${maxWidth}px`);
    }
    canvas.width = 0;
    canvas.height = 0;
  }
}
exports.Toolbar = Toolbar;