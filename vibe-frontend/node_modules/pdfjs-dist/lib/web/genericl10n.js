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
exports.GenericL10n = void 0;
require("../external/webL10n/l10n.js");
var _l10n_utils = require("./l10n_utils.js");
const webL10n = document.webL10n;
class GenericL10n {
  constructor(lang) {
    this._lang = lang;
    this._ready = new Promise((resolve, reject) => {
      webL10n.setLanguage((0, _l10n_utils.fixupLangCode)(lang), () => {
        resolve(webL10n);
      });
    });
  }
  async getLanguage() {
    const l10n = await this._ready;
    return l10n.getLanguage();
  }
  async getDirection() {
    const l10n = await this._ready;
    return l10n.getDirection();
  }
  async get(key, args = null, fallback = (0, _l10n_utils.getL10nFallback)(key, args)) {
    const l10n = await this._ready;
    return l10n.get(key, args, fallback);
  }
  async translate(element) {
    const l10n = await this._ready;
    return l10n.translate(element);
  }
}
exports.GenericL10n = GenericL10n;