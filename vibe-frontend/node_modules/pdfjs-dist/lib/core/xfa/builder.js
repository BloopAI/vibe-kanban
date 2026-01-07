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
exports.Builder = void 0;
var _namespaces = require("./namespaces.js");
var _xfa_object = require("./xfa_object.js");
var _setup = require("./setup.js");
var _template = require("./template.js");
var _unknown = require("./unknown.js");
var _util = require("../../shared/util.js");
class Root extends _xfa_object.XFAObject {
  constructor(ids) {
    super(-1, "root", Object.create(null));
    this.element = null;
    this[_xfa_object.$ids] = ids;
  }
  [_xfa_object.$onChild](child) {
    this.element = child;
    return true;
  }
  [_xfa_object.$finalize]() {
    super[_xfa_object.$finalize]();
    if (this.element.template instanceof _template.Template) {
      this[_xfa_object.$ids].set(_xfa_object.$root, this.element);
      this.element.template[_xfa_object.$resolvePrototypes](this[_xfa_object.$ids]);
      this.element.template[_xfa_object.$ids] = this[_xfa_object.$ids];
    }
  }
}
class Empty extends _xfa_object.XFAObject {
  constructor() {
    super(-1, "", Object.create(null));
  }
  [_xfa_object.$onChild](_) {
    return false;
  }
}
class Builder {
  constructor(rootNameSpace = null) {
    this._namespaceStack = [];
    this._nsAgnosticLevel = 0;
    this._namespacePrefixes = new Map();
    this._namespaces = new Map();
    this._nextNsId = Math.max(...Object.values(_namespaces.NamespaceIds).map(({
      id
    }) => id));
    this._currentNamespace = rootNameSpace || new _unknown.UnknownNamespace(++this._nextNsId);
  }
  buildRoot(ids) {
    return new Root(ids);
  }
  build({
    nsPrefix,
    name,
    attributes,
    namespace,
    prefixes
  }) {
    const hasNamespaceDef = namespace !== null;
    if (hasNamespaceDef) {
      this._namespaceStack.push(this._currentNamespace);
      this._currentNamespace = this._searchNamespace(namespace);
    }
    if (prefixes) {
      this._addNamespacePrefix(prefixes);
    }
    if (attributes.hasOwnProperty(_xfa_object.$nsAttributes)) {
      const dataTemplate = _setup.NamespaceSetUp.datasets;
      const nsAttrs = attributes[_xfa_object.$nsAttributes];
      let xfaAttrs = null;
      for (const [ns, attrs] of Object.entries(nsAttrs)) {
        const nsToUse = this._getNamespaceToUse(ns);
        if (nsToUse === dataTemplate) {
          xfaAttrs = {
            xfa: attrs
          };
          break;
        }
      }
      if (xfaAttrs) {
        attributes[_xfa_object.$nsAttributes] = xfaAttrs;
      } else {
        delete attributes[_xfa_object.$nsAttributes];
      }
    }
    const namespaceToUse = this._getNamespaceToUse(nsPrefix);
    const node = namespaceToUse && namespaceToUse[_namespaces.$buildXFAObject](name, attributes) || new Empty();
    if (node[_xfa_object.$isNsAgnostic]()) {
      this._nsAgnosticLevel++;
    }
    if (hasNamespaceDef || prefixes || node[_xfa_object.$isNsAgnostic]()) {
      node[_xfa_object.$cleanup] = {
        hasNamespace: hasNamespaceDef,
        prefixes,
        nsAgnostic: node[_xfa_object.$isNsAgnostic]()
      };
    }
    return node;
  }
  isNsAgnostic() {
    return this._nsAgnosticLevel > 0;
  }
  _searchNamespace(nsName) {
    let ns = this._namespaces.get(nsName);
    if (ns) {
      return ns;
    }
    for (const [name, {
      check
    }] of Object.entries(_namespaces.NamespaceIds)) {
      if (check(nsName)) {
        ns = _setup.NamespaceSetUp[name];
        if (ns) {
          this._namespaces.set(nsName, ns);
          return ns;
        }
        break;
      }
    }
    ns = new _unknown.UnknownNamespace(++this._nextNsId);
    this._namespaces.set(nsName, ns);
    return ns;
  }
  _addNamespacePrefix(prefixes) {
    for (const {
      prefix,
      value
    } of prefixes) {
      const namespace = this._searchNamespace(value);
      let prefixStack = this._namespacePrefixes.get(prefix);
      if (!prefixStack) {
        prefixStack = [];
        this._namespacePrefixes.set(prefix, prefixStack);
      }
      prefixStack.push(namespace);
    }
  }
  _getNamespaceToUse(prefix) {
    if (!prefix) {
      return this._currentNamespace;
    }
    const prefixStack = this._namespacePrefixes.get(prefix);
    if (prefixStack && prefixStack.length > 0) {
      return prefixStack.at(-1);
    }
    (0, _util.warn)(`Unknown namespace prefix: ${prefix}.`);
    return null;
  }
  clean(data) {
    const {
      hasNamespace,
      prefixes,
      nsAgnostic
    } = data;
    if (hasNamespace) {
      this._currentNamespace = this._namespaceStack.pop();
    }
    if (prefixes) {
      prefixes.forEach(({
        prefix
      }) => {
        this._namespacePrefixes.get(prefix).pop();
      });
    }
    if (nsAgnostic) {
      this._nsAgnosticLevel--;
    }
  }
}
exports.Builder = Builder;