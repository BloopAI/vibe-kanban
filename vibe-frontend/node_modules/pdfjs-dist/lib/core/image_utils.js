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
exports.LocalTilingPatternCache = exports.LocalImageCache = exports.LocalGStateCache = exports.LocalFunctionCache = exports.LocalColorSpaceCache = exports.GlobalImageCache = void 0;
var _util = require("../shared/util.js");
var _primitives = require("./primitives.js");
class BaseLocalCache {
  constructor(options) {
    if (this.constructor === BaseLocalCache) {
      (0, _util.unreachable)("Cannot initialize BaseLocalCache.");
    }
    this._onlyRefs = (options && options.onlyRefs) === true;
    if (!this._onlyRefs) {
      this._nameRefMap = new Map();
      this._imageMap = new Map();
    }
    this._imageCache = new _primitives.RefSetCache();
  }
  getByName(name) {
    if (this._onlyRefs) {
      (0, _util.unreachable)("Should not call `getByName` method.");
    }
    const ref = this._nameRefMap.get(name);
    if (ref) {
      return this.getByRef(ref);
    }
    return this._imageMap.get(name) || null;
  }
  getByRef(ref) {
    return this._imageCache.get(ref) || null;
  }
  set(name, ref, data) {
    (0, _util.unreachable)("Abstract method `set` called.");
  }
}
class LocalImageCache extends BaseLocalCache {
  set(name, ref = null, data) {
    if (typeof name !== "string") {
      throw new Error('LocalImageCache.set - expected "name" argument.');
    }
    if (ref) {
      if (this._imageCache.has(ref)) {
        return;
      }
      this._nameRefMap.set(name, ref);
      this._imageCache.put(ref, data);
      return;
    }
    if (this._imageMap.has(name)) {
      return;
    }
    this._imageMap.set(name, data);
  }
}
exports.LocalImageCache = LocalImageCache;
class LocalColorSpaceCache extends BaseLocalCache {
  set(name = null, ref = null, data) {
    if (typeof name !== "string" && !ref) {
      throw new Error('LocalColorSpaceCache.set - expected "name" and/or "ref" argument.');
    }
    if (ref) {
      if (this._imageCache.has(ref)) {
        return;
      }
      if (name !== null) {
        this._nameRefMap.set(name, ref);
      }
      this._imageCache.put(ref, data);
      return;
    }
    if (this._imageMap.has(name)) {
      return;
    }
    this._imageMap.set(name, data);
  }
}
exports.LocalColorSpaceCache = LocalColorSpaceCache;
class LocalFunctionCache extends BaseLocalCache {
  constructor(options) {
    super({
      onlyRefs: true
    });
  }
  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('LocalFunctionCache.set - expected "ref" argument.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    this._imageCache.put(ref, data);
  }
}
exports.LocalFunctionCache = LocalFunctionCache;
class LocalGStateCache extends BaseLocalCache {
  set(name, ref = null, data) {
    if (typeof name !== "string") {
      throw new Error('LocalGStateCache.set - expected "name" argument.');
    }
    if (ref) {
      if (this._imageCache.has(ref)) {
        return;
      }
      this._nameRefMap.set(name, ref);
      this._imageCache.put(ref, data);
      return;
    }
    if (this._imageMap.has(name)) {
      return;
    }
    this._imageMap.set(name, data);
  }
}
exports.LocalGStateCache = LocalGStateCache;
class LocalTilingPatternCache extends BaseLocalCache {
  constructor(options) {
    super({
      onlyRefs: true
    });
  }
  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('LocalTilingPatternCache.set - expected "ref" argument.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    this._imageCache.put(ref, data);
  }
}
exports.LocalTilingPatternCache = LocalTilingPatternCache;
class GlobalImageCache {
  static get NUM_PAGES_THRESHOLD() {
    return (0, _util.shadow)(this, "NUM_PAGES_THRESHOLD", 2);
  }
  static get MIN_IMAGES_TO_CACHE() {
    return (0, _util.shadow)(this, "MIN_IMAGES_TO_CACHE", 10);
  }
  static get MAX_BYTE_SIZE() {
    return (0, _util.shadow)(this, "MAX_BYTE_SIZE", 40e6);
  }
  constructor() {
    this._refCache = new _primitives.RefSetCache();
    this._imageCache = new _primitives.RefSetCache();
  }
  get _byteSize() {
    let byteSize = 0;
    for (const imageData of this._imageCache) {
      byteSize += imageData.byteSize;
    }
    return byteSize;
  }
  get _cacheLimitReached() {
    if (this._imageCache.size < GlobalImageCache.MIN_IMAGES_TO_CACHE) {
      return false;
    }
    if (this._byteSize < GlobalImageCache.MAX_BYTE_SIZE) {
      return false;
    }
    return true;
  }
  shouldCache(ref, pageIndex) {
    const pageIndexSet = this._refCache.get(ref);
    const numPages = pageIndexSet ? pageIndexSet.size + (pageIndexSet.has(pageIndex) ? 0 : 1) : 1;
    if (numPages < GlobalImageCache.NUM_PAGES_THRESHOLD) {
      return false;
    }
    if (!this._imageCache.has(ref) && this._cacheLimitReached) {
      return false;
    }
    return true;
  }
  addPageIndex(ref, pageIndex) {
    let pageIndexSet = this._refCache.get(ref);
    if (!pageIndexSet) {
      pageIndexSet = new Set();
      this._refCache.put(ref, pageIndexSet);
    }
    pageIndexSet.add(pageIndex);
  }
  addByteSize(ref, byteSize) {
    const imageData = this._imageCache.get(ref);
    if (!imageData) {
      return;
    }
    if (imageData.byteSize) {
      return;
    }
    imageData.byteSize = byteSize;
  }
  getData(ref, pageIndex) {
    const pageIndexSet = this._refCache.get(ref);
    if (!pageIndexSet) {
      return null;
    }
    if (pageIndexSet.size < GlobalImageCache.NUM_PAGES_THRESHOLD) {
      return null;
    }
    const imageData = this._imageCache.get(ref);
    if (!imageData) {
      return null;
    }
    pageIndexSet.add(pageIndex);
    return imageData;
  }
  setData(ref, data) {
    if (!this._refCache.has(ref)) {
      throw new Error('GlobalImageCache.setData - expected "addPageIndex" to have been called.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    if (this._cacheLimitReached) {
      (0, _util.warn)("GlobalImageCache.setData - cache limit reached.");
      return;
    }
    this._imageCache.put(ref, data);
  }
  clear(onlyData = false) {
    if (!onlyData) {
      this._refCache.clear();
    }
    this._imageCache.clear();
  }
}
exports.GlobalImageCache = GlobalImageCache;