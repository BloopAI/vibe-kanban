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
exports.BasePreferences = void 0;
var _app_options = require("./app_options.js");
class BasePreferences {
  #defaults = Object.freeze({
    "annotationEditorMode": 0,
    "annotationMode": 2,
    "cursorToolOnLoad": 0,
    "defaultZoomDelay": 400,
    "defaultZoomValue": "",
    "disablePageLabels": false,
    "enablePermissions": false,
    "enablePrintAutoRotate": true,
    "enableScripting": true,
    "externalLinkTarget": 0,
    "historyUpdateUrl": false,
    "ignoreDestinationZoom": false,
    "forcePageColors": false,
    "pageColorsBackground": "Canvas",
    "pageColorsForeground": "CanvasText",
    "pdfBugEnabled": false,
    "sidebarViewOnLoad": -1,
    "scrollModeOnLoad": -1,
    "spreadModeOnLoad": -1,
    "textLayerMode": 1,
    "useOnlyCssZoom": false,
    "viewerCssTheme": 0,
    "viewOnLoad": 0,
    "disableAutoFetch": false,
    "disableFontFace": false,
    "disableRange": false,
    "disableStream": false,
    "enableXfa": true,
    "renderer": "canvas"
  });
  #prefs = Object.create(null);
  #initializedPromise = null;
  constructor() {
    if (this.constructor === BasePreferences) {
      throw new Error("Cannot initialize BasePreferences.");
    }
    this.#initializedPromise = this._readFromStorage(this.#defaults).then(prefs => {
      for (const name in this.#defaults) {
        const prefValue = prefs?.[name];
        if (typeof prefValue === typeof this.#defaults[name]) {
          this.#prefs[name] = prefValue;
        }
      }
    });
  }
  async _writeToStorage(prefObj) {
    throw new Error("Not implemented: _writeToStorage");
  }
  async _readFromStorage(prefObj) {
    throw new Error("Not implemented: _readFromStorage");
  }
  async reset() {
    await this.#initializedPromise;
    const prefs = this.#prefs;
    this.#prefs = Object.create(null);
    return this._writeToStorage(this.#defaults).catch(reason => {
      this.#prefs = prefs;
      throw reason;
    });
  }
  async set(name, value) {
    await this.#initializedPromise;
    const defaultValue = this.#defaults[name],
      prefs = this.#prefs;
    if (defaultValue === undefined) {
      throw new Error(`Set preference: "${name}" is undefined.`);
    } else if (value === undefined) {
      throw new Error("Set preference: no value is specified.");
    }
    const valueType = typeof value,
      defaultType = typeof defaultValue;
    if (valueType !== defaultType) {
      if (valueType === "number" && defaultType === "string") {
        value = value.toString();
      } else {
        throw new Error(`Set preference: "${value}" is a ${valueType}, expected a ${defaultType}.`);
      }
    } else {
      if (valueType === "number" && !Number.isInteger(value)) {
        throw new Error(`Set preference: "${value}" must be an integer.`);
      }
    }
    this.#prefs[name] = value;
    return this._writeToStorage(this.#prefs).catch(reason => {
      this.#prefs = prefs;
      throw reason;
    });
  }
  async get(name) {
    await this.#initializedPromise;
    const defaultValue = this.#defaults[name];
    if (defaultValue === undefined) {
      throw new Error(`Get preference: "${name}" is undefined.`);
    }
    return this.#prefs[name] ?? defaultValue;
  }
  async getAll() {
    await this.#initializedPromise;
    const obj = Object.create(null);
    for (const name in this.#defaults) {
      obj[name] = this.#prefs[name] ?? this.#defaults[name];
    }
    return obj;
  }
}
exports.BasePreferences = BasePreferences;