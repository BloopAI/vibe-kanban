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
exports.createDataNode = createDataNode;
exports.searchNode = searchNode;
var _xfa_object = require("./xfa_object.js");
var _namespaces = require("./namespaces.js");
var _util = require("../../shared/util.js");
const namePattern = /^[^.[]+/;
const indexPattern = /^[^\]]+/;
const operators = {
  dot: 0,
  dotDot: 1,
  dotHash: 2,
  dotBracket: 3,
  dotParen: 4
};
const shortcuts = new Map([["$data", (root, current) => root.datasets ? root.datasets.data : root], ["$record", (root, current) => (root.datasets ? root.datasets.data : root)[_xfa_object.$getChildren]()[0]], ["$template", (root, current) => root.template], ["$connectionSet", (root, current) => root.connectionSet], ["$form", (root, current) => root.form], ["$layout", (root, current) => root.layout], ["$host", (root, current) => root.host], ["$dataWindow", (root, current) => root.dataWindow], ["$event", (root, current) => root.event], ["!", (root, current) => root.datasets], ["$xfa", (root, current) => root], ["xfa", (root, current) => root], ["$", (root, current) => current]]);
const somCache = new WeakMap();
const NS_DATASETS = _namespaces.NamespaceIds.datasets.id;
function parseIndex(index) {
  index = index.trim();
  if (index === "*") {
    return Infinity;
  }
  return parseInt(index, 10) || 0;
}
function parseExpression(expr, dotDotAllowed, noExpr = true) {
  let match = expr.match(namePattern);
  if (!match) {
    return null;
  }
  let [name] = match;
  const parsed = [{
    name,
    cacheName: "." + name,
    index: 0,
    js: null,
    formCalc: null,
    operator: operators.dot
  }];
  let pos = name.length;
  while (pos < expr.length) {
    const spos = pos;
    const char = expr.charAt(pos++);
    if (char === "[") {
      match = expr.slice(pos).match(indexPattern);
      if (!match) {
        (0, _util.warn)("XFA - Invalid index in SOM expression");
        return null;
      }
      parsed.at(-1).index = parseIndex(match[0]);
      pos += match[0].length + 1;
      continue;
    }
    let operator;
    switch (expr.charAt(pos)) {
      case ".":
        if (!dotDotAllowed) {
          return null;
        }
        pos++;
        operator = operators.dotDot;
        break;
      case "#":
        pos++;
        operator = operators.dotHash;
        break;
      case "[":
        if (noExpr) {
          (0, _util.warn)("XFA - SOM expression contains a FormCalc subexpression which is not supported for now.");
          return null;
        }
        operator = operators.dotBracket;
        break;
      case "(":
        if (noExpr) {
          (0, _util.warn)("XFA - SOM expression contains a JavaScript subexpression which is not supported for now.");
          return null;
        }
        operator = operators.dotParen;
        break;
      default:
        operator = operators.dot;
        break;
    }
    match = expr.slice(pos).match(namePattern);
    if (!match) {
      break;
    }
    [name] = match;
    pos += name.length;
    parsed.push({
      name,
      cacheName: expr.slice(spos, pos),
      operator,
      index: 0,
      js: null,
      formCalc: null
    });
  }
  return parsed;
}
function searchNode(root, container, expr, dotDotAllowed = true, useCache = true) {
  const parsed = parseExpression(expr, dotDotAllowed);
  if (!parsed) {
    return null;
  }
  const fn = shortcuts.get(parsed[0].name);
  let i = 0;
  let isQualified;
  if (fn) {
    isQualified = true;
    root = [fn(root, container)];
    i = 1;
  } else {
    isQualified = container === null;
    root = [container || root];
  }
  for (let ii = parsed.length; i < ii; i++) {
    const {
      name,
      cacheName,
      operator,
      index
    } = parsed[i];
    const nodes = [];
    for (const node of root) {
      if (!(node instanceof _xfa_object.XFAObject)) {
        continue;
      }
      let children, cached;
      if (useCache) {
        cached = somCache.get(node);
        if (!cached) {
          cached = new Map();
          somCache.set(node, cached);
        }
        children = cached.get(cacheName);
      }
      if (!children) {
        switch (operator) {
          case operators.dot:
            children = node[_xfa_object.$getChildrenByName](name, false);
            break;
          case operators.dotDot:
            children = node[_xfa_object.$getChildrenByName](name, true);
            break;
          case operators.dotHash:
            children = node[_xfa_object.$getChildrenByClass](name);
            if (children instanceof _xfa_object.XFAObjectArray) {
              children = children.children;
            } else {
              children = [children];
            }
            break;
          default:
            break;
        }
        if (useCache) {
          cached.set(cacheName, children);
        }
      }
      if (children.length > 0) {
        nodes.push(children);
      }
    }
    if (nodes.length === 0 && !isQualified && i === 0) {
      const parent = container[_xfa_object.$getParent]();
      container = parent;
      if (!container) {
        return null;
      }
      i = -1;
      root = [container];
      continue;
    }
    if (isFinite(index)) {
      root = nodes.filter(node => index < node.length).map(node => node[index]);
    } else {
      root = nodes.flat();
    }
  }
  if (root.length === 0) {
    return null;
  }
  return root;
}
function createNodes(root, path) {
  let node = null;
  for (const {
    name,
    index
  } of path) {
    for (let i = 0, ii = !isFinite(index) ? 0 : index; i <= ii; i++) {
      const nsId = root[_xfa_object.$namespaceId] === NS_DATASETS ? -1 : root[_xfa_object.$namespaceId];
      node = new _xfa_object.XmlObject(nsId, name);
      root[_xfa_object.$appendChild](node);
    }
    root = node;
  }
  return node;
}
function createDataNode(root, container, expr) {
  const parsed = parseExpression(expr);
  if (!parsed) {
    return null;
  }
  if (parsed.some(x => x.operator === operators.dotDot)) {
    return null;
  }
  const fn = shortcuts.get(parsed[0].name);
  let i = 0;
  if (fn) {
    root = fn(root, container);
    i = 1;
  } else {
    root = container || root;
  }
  for (let ii = parsed.length; i < ii; i++) {
    const {
      name,
      operator,
      index
    } = parsed[i];
    if (!isFinite(index)) {
      parsed[i].index = 0;
      return createNodes(root, parsed.slice(i));
    }
    let children;
    switch (operator) {
      case operators.dot:
        children = root[_xfa_object.$getChildrenByName](name, false);
        break;
      case operators.dotDot:
        children = root[_xfa_object.$getChildrenByName](name, true);
        break;
      case operators.dotHash:
        children = root[_xfa_object.$getChildrenByClass](name);
        if (children instanceof _xfa_object.XFAObjectArray) {
          children = children.children;
        } else {
          children = [children];
        }
        break;
      default:
        break;
    }
    if (children.length === 0) {
      return createNodes(root, parsed.slice(i));
    }
    if (index < children.length) {
      const child = children[index];
      if (!(child instanceof _xfa_object.XFAObject)) {
        (0, _util.warn)(`XFA - Cannot create a node.`);
        return null;
      }
      root = child;
    } else {
      parsed[i].index = index - children.length;
      return createNodes(root, parsed.slice(i));
    }
  }
  return null;
}