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
exports.SecondaryToolbar = void 0;
var _ui_utils = require("./ui_utils.js");
var _pdf_viewer = require("./pdf_viewer.js");
class SecondaryToolbar {
  constructor(options, eventBus, externalServices) {
    this.toolbar = options.toolbar;
    this.toggleButton = options.toggleButton;
    this.buttons = [{
      element: options.presentationModeButton,
      eventName: "presentationmode",
      close: true
    }, {
      element: options.printButton,
      eventName: "print",
      close: true
    }, {
      element: options.downloadButton,
      eventName: "download",
      close: true
    }, {
      element: options.viewBookmarkButton,
      eventName: null,
      close: true
    }, {
      element: options.firstPageButton,
      eventName: "firstpage",
      close: true
    }, {
      element: options.lastPageButton,
      eventName: "lastpage",
      close: true
    }, {
      element: options.pageRotateCwButton,
      eventName: "rotatecw",
      close: false
    }, {
      element: options.pageRotateCcwButton,
      eventName: "rotateccw",
      close: false
    }, {
      element: options.cursorSelectToolButton,
      eventName: "switchcursortool",
      eventDetails: {
        tool: _ui_utils.CursorTool.SELECT
      },
      close: true
    }, {
      element: options.cursorHandToolButton,
      eventName: "switchcursortool",
      eventDetails: {
        tool: _ui_utils.CursorTool.HAND
      },
      close: true
    }, {
      element: options.scrollPageButton,
      eventName: "switchscrollmode",
      eventDetails: {
        mode: _ui_utils.ScrollMode.PAGE
      },
      close: true
    }, {
      element: options.scrollVerticalButton,
      eventName: "switchscrollmode",
      eventDetails: {
        mode: _ui_utils.ScrollMode.VERTICAL
      },
      close: true
    }, {
      element: options.scrollHorizontalButton,
      eventName: "switchscrollmode",
      eventDetails: {
        mode: _ui_utils.ScrollMode.HORIZONTAL
      },
      close: true
    }, {
      element: options.scrollWrappedButton,
      eventName: "switchscrollmode",
      eventDetails: {
        mode: _ui_utils.ScrollMode.WRAPPED
      },
      close: true
    }, {
      element: options.spreadNoneButton,
      eventName: "switchspreadmode",
      eventDetails: {
        mode: _ui_utils.SpreadMode.NONE
      },
      close: true
    }, {
      element: options.spreadOddButton,
      eventName: "switchspreadmode",
      eventDetails: {
        mode: _ui_utils.SpreadMode.ODD
      },
      close: true
    }, {
      element: options.spreadEvenButton,
      eventName: "switchspreadmode",
      eventDetails: {
        mode: _ui_utils.SpreadMode.EVEN
      },
      close: true
    }, {
      element: options.documentPropertiesButton,
      eventName: "documentproperties",
      close: true
    }];
    this.buttons.push({
      element: options.openFileButton,
      eventName: "openfile",
      close: true
    });
    this.items = {
      firstPage: options.firstPageButton,
      lastPage: options.lastPageButton,
      pageRotateCw: options.pageRotateCwButton,
      pageRotateCcw: options.pageRotateCcwButton
    };
    this.eventBus = eventBus;
    this.externalServices = externalServices;
    this.opened = false;
    this.#bindClickListeners();
    this.#bindCursorToolsListener(options);
    this.#bindScrollModeListener(options);
    this.#bindSpreadModeListener(options);
    this.reset();
  }
  get isOpen() {
    return this.opened;
  }
  setPageNumber(pageNumber) {
    this.pageNumber = pageNumber;
    this.#updateUIState();
  }
  setPagesCount(pagesCount) {
    this.pagesCount = pagesCount;
    this.#updateUIState();
  }
  reset() {
    this.pageNumber = 0;
    this.pagesCount = 0;
    this.#updateUIState();
    this.eventBus.dispatch("secondarytoolbarreset", {
      source: this
    });
  }
  #updateUIState() {
    this.items.firstPage.disabled = this.pageNumber <= 1;
    this.items.lastPage.disabled = this.pageNumber >= this.pagesCount;
    this.items.pageRotateCw.disabled = this.pagesCount === 0;
    this.items.pageRotateCcw.disabled = this.pagesCount === 0;
  }
  #bindClickListeners() {
    this.toggleButton.addEventListener("click", this.toggle.bind(this));
    for (const {
      element,
      eventName,
      close,
      eventDetails
    } of this.buttons) {
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          const details = {
            source: this
          };
          for (const property in eventDetails) {
            details[property] = eventDetails[property];
          }
          this.eventBus.dispatch(eventName, details);
        }
        if (close) {
          this.close();
        }
        this.externalServices.reportTelemetry({
          type: "buttons",
          data: {
            id: element.id
          }
        });
      });
    }
  }
  #bindCursorToolsListener({
    cursorSelectToolButton,
    cursorHandToolButton
  }) {
    this.eventBus._on("cursortoolchanged", function ({
      tool
    }) {
      const isSelect = tool === _ui_utils.CursorTool.SELECT,
        isHand = tool === _ui_utils.CursorTool.HAND;
      cursorSelectToolButton.classList.toggle("toggled", isSelect);
      cursorHandToolButton.classList.toggle("toggled", isHand);
      cursorSelectToolButton.setAttribute("aria-checked", isSelect);
      cursorHandToolButton.setAttribute("aria-checked", isHand);
    });
  }
  #bindScrollModeListener({
    scrollPageButton,
    scrollVerticalButton,
    scrollHorizontalButton,
    scrollWrappedButton,
    spreadNoneButton,
    spreadOddButton,
    spreadEvenButton
  }) {
    const scrollModeChanged = ({
      mode
    }) => {
      const isPage = mode === _ui_utils.ScrollMode.PAGE,
        isVertical = mode === _ui_utils.ScrollMode.VERTICAL,
        isHorizontal = mode === _ui_utils.ScrollMode.HORIZONTAL,
        isWrapped = mode === _ui_utils.ScrollMode.WRAPPED;
      scrollPageButton.classList.toggle("toggled", isPage);
      scrollVerticalButton.classList.toggle("toggled", isVertical);
      scrollHorizontalButton.classList.toggle("toggled", isHorizontal);
      scrollWrappedButton.classList.toggle("toggled", isWrapped);
      scrollPageButton.setAttribute("aria-checked", isPage);
      scrollVerticalButton.setAttribute("aria-checked", isVertical);
      scrollHorizontalButton.setAttribute("aria-checked", isHorizontal);
      scrollWrappedButton.setAttribute("aria-checked", isWrapped);
      const forceScrollModePage = this.pagesCount > _pdf_viewer.PagesCountLimit.FORCE_SCROLL_MODE_PAGE;
      scrollPageButton.disabled = forceScrollModePage;
      scrollVerticalButton.disabled = forceScrollModePage;
      scrollHorizontalButton.disabled = forceScrollModePage;
      scrollWrappedButton.disabled = forceScrollModePage;
      spreadNoneButton.disabled = isHorizontal;
      spreadOddButton.disabled = isHorizontal;
      spreadEvenButton.disabled = isHorizontal;
    };
    this.eventBus._on("scrollmodechanged", scrollModeChanged);
    this.eventBus._on("secondarytoolbarreset", evt => {
      if (evt.source === this) {
        scrollModeChanged({
          mode: _ui_utils.ScrollMode.VERTICAL
        });
      }
    });
  }
  #bindSpreadModeListener({
    spreadNoneButton,
    spreadOddButton,
    spreadEvenButton
  }) {
    function spreadModeChanged({
      mode
    }) {
      const isNone = mode === _ui_utils.SpreadMode.NONE,
        isOdd = mode === _ui_utils.SpreadMode.ODD,
        isEven = mode === _ui_utils.SpreadMode.EVEN;
      spreadNoneButton.classList.toggle("toggled", isNone);
      spreadOddButton.classList.toggle("toggled", isOdd);
      spreadEvenButton.classList.toggle("toggled", isEven);
      spreadNoneButton.setAttribute("aria-checked", isNone);
      spreadOddButton.setAttribute("aria-checked", isOdd);
      spreadEvenButton.setAttribute("aria-checked", isEven);
    }
    this.eventBus._on("spreadmodechanged", spreadModeChanged);
    this.eventBus._on("secondarytoolbarreset", evt => {
      if (evt.source === this) {
        spreadModeChanged({
          mode: _ui_utils.SpreadMode.NONE
        });
      }
    });
  }
  open() {
    if (this.opened) {
      return;
    }
    this.opened = true;
    this.toggleButton.classList.add("toggled");
    this.toggleButton.setAttribute("aria-expanded", "true");
    this.toolbar.classList.remove("hidden");
  }
  close() {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.toolbar.classList.add("hidden");
    this.toggleButton.classList.remove("toggled");
    this.toggleButton.setAttribute("aria-expanded", "false");
  }
  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }
}
exports.SecondaryToolbar = SecondaryToolbar;