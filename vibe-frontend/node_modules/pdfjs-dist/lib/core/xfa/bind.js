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
exports.Binder = void 0;
var _xfa_object = require("./xfa_object.js");
var _template = require("./template.js");
var _som = require("./som.js");
var _namespaces = require("./namespaces.js");
var _util = require("../../shared/util.js");
const NS_DATASETS = _namespaces.NamespaceIds.datasets.id;
function createText(content) {
  const node = new _template.Text({});
  node[_xfa_object.$content] = content;
  return node;
}
class Binder {
  constructor(root) {
    this.root = root;
    this.datasets = root.datasets;
    if (root.datasets && root.datasets.data) {
      this.data = root.datasets.data;
    } else {
      this.data = new _xfa_object.XmlObject(_namespaces.NamespaceIds.datasets.id, "data");
    }
    this.emptyMerge = this.data[_xfa_object.$getChildren]().length === 0;
    this.root.form = this.form = root.template[_xfa_object.$clone]();
  }
  _isConsumeData() {
    return !this.emptyMerge && this._mergeMode;
  }
  _isMatchTemplate() {
    return !this._isConsumeData();
  }
  bind() {
    this._bindElement(this.form, this.data);
    return this.form;
  }
  getData() {
    return this.data;
  }
  _bindValue(formNode, data, picture) {
    formNode[_xfa_object.$data] = data;
    if (formNode[_xfa_object.$hasSettableValue]()) {
      if (data[_xfa_object.$isDataValue]()) {
        const value = data[_xfa_object.$getDataValue]();
        formNode[_xfa_object.$setValue](createText(value));
      } else if (formNode instanceof _template.Field && formNode.ui && formNode.ui.choiceList && formNode.ui.choiceList.open === "multiSelect") {
        const value = data[_xfa_object.$getChildren]().map(child => child[_xfa_object.$content].trim()).join("\n");
        formNode[_xfa_object.$setValue](createText(value));
      } else if (this._isConsumeData()) {
        (0, _util.warn)(`XFA - Nodes haven't the same type.`);
      }
    } else if (!data[_xfa_object.$isDataValue]() || this._isMatchTemplate()) {
      this._bindElement(formNode, data);
    } else {
      (0, _util.warn)(`XFA - Nodes haven't the same type.`);
    }
  }
  _findDataByNameToConsume(name, isValue, dataNode, global) {
    if (!name) {
      return null;
    }
    let generator, match;
    for (let i = 0; i < 3; i++) {
      generator = dataNode[_xfa_object.$getRealChildrenByNameIt](name, false, true);
      while (true) {
        match = generator.next().value;
        if (!match) {
          break;
        }
        if (isValue === match[_xfa_object.$isDataValue]()) {
          return match;
        }
      }
      if (dataNode[_xfa_object.$namespaceId] === _namespaces.NamespaceIds.datasets.id && dataNode[_xfa_object.$nodeName] === "data") {
        break;
      }
      dataNode = dataNode[_xfa_object.$getParent]();
    }
    if (!global) {
      return null;
    }
    generator = this.data[_xfa_object.$getRealChildrenByNameIt](name, true, false);
    match = generator.next().value;
    if (match) {
      return match;
    }
    generator = this.data[_xfa_object.$getAttributeIt](name, true);
    match = generator.next().value;
    if (match && match[_xfa_object.$isDataValue]()) {
      return match;
    }
    return null;
  }
  _setProperties(formNode, dataNode) {
    if (!formNode.hasOwnProperty("setProperty")) {
      return;
    }
    for (const {
      ref,
      target,
      connection
    } of formNode.setProperty.children) {
      if (connection) {
        continue;
      }
      if (!ref) {
        continue;
      }
      const nodes = (0, _som.searchNode)(this.root, dataNode, ref, false, false);
      if (!nodes) {
        (0, _util.warn)(`XFA - Invalid reference: ${ref}.`);
        continue;
      }
      const [node] = nodes;
      if (!node[_xfa_object.$isDescendent](this.data)) {
        (0, _util.warn)(`XFA - Invalid node: must be a data node.`);
        continue;
      }
      const targetNodes = (0, _som.searchNode)(this.root, formNode, target, false, false);
      if (!targetNodes) {
        (0, _util.warn)(`XFA - Invalid target: ${target}.`);
        continue;
      }
      const [targetNode] = targetNodes;
      if (!targetNode[_xfa_object.$isDescendent](formNode)) {
        (0, _util.warn)(`XFA - Invalid target: must be a property or subproperty.`);
        continue;
      }
      const targetParent = targetNode[_xfa_object.$getParent]();
      if (targetNode instanceof _template.SetProperty || targetParent instanceof _template.SetProperty) {
        (0, _util.warn)(`XFA - Invalid target: cannot be a setProperty or one of its properties.`);
        continue;
      }
      if (targetNode instanceof _template.BindItems || targetParent instanceof _template.BindItems) {
        (0, _util.warn)(`XFA - Invalid target: cannot be a bindItems or one of its properties.`);
        continue;
      }
      const content = node[_xfa_object.$text]();
      const name = targetNode[_xfa_object.$nodeName];
      if (targetNode instanceof _xfa_object.XFAAttribute) {
        const attrs = Object.create(null);
        attrs[name] = content;
        const obj = Reflect.construct(Object.getPrototypeOf(targetParent).constructor, [attrs]);
        targetParent[name] = obj[name];
        continue;
      }
      if (!targetNode.hasOwnProperty(_xfa_object.$content)) {
        (0, _util.warn)(`XFA - Invalid node to use in setProperty`);
        continue;
      }
      targetNode[_xfa_object.$data] = node;
      targetNode[_xfa_object.$content] = content;
      targetNode[_xfa_object.$finalize]();
    }
  }
  _bindItems(formNode, dataNode) {
    if (!formNode.hasOwnProperty("items") || !formNode.hasOwnProperty("bindItems") || formNode.bindItems.isEmpty()) {
      return;
    }
    for (const item of formNode.items.children) {
      formNode[_xfa_object.$removeChild](item);
    }
    formNode.items.clear();
    const labels = new _template.Items({});
    const values = new _template.Items({});
    formNode[_xfa_object.$appendChild](labels);
    formNode.items.push(labels);
    formNode[_xfa_object.$appendChild](values);
    formNode.items.push(values);
    for (const {
      ref,
      labelRef,
      valueRef,
      connection
    } of formNode.bindItems.children) {
      if (connection) {
        continue;
      }
      if (!ref) {
        continue;
      }
      const nodes = (0, _som.searchNode)(this.root, dataNode, ref, false, false);
      if (!nodes) {
        (0, _util.warn)(`XFA - Invalid reference: ${ref}.`);
        continue;
      }
      for (const node of nodes) {
        if (!node[_xfa_object.$isDescendent](this.datasets)) {
          (0, _util.warn)(`XFA - Invalid ref (${ref}): must be a datasets child.`);
          continue;
        }
        const labelNodes = (0, _som.searchNode)(this.root, node, labelRef, true, false);
        if (!labelNodes) {
          (0, _util.warn)(`XFA - Invalid label: ${labelRef}.`);
          continue;
        }
        const [labelNode] = labelNodes;
        if (!labelNode[_xfa_object.$isDescendent](this.datasets)) {
          (0, _util.warn)(`XFA - Invalid label: must be a datasets child.`);
          continue;
        }
        const valueNodes = (0, _som.searchNode)(this.root, node, valueRef, true, false);
        if (!valueNodes) {
          (0, _util.warn)(`XFA - Invalid value: ${valueRef}.`);
          continue;
        }
        const [valueNode] = valueNodes;
        if (!valueNode[_xfa_object.$isDescendent](this.datasets)) {
          (0, _util.warn)(`XFA - Invalid value: must be a datasets child.`);
          continue;
        }
        const label = createText(labelNode[_xfa_object.$text]());
        const value = createText(valueNode[_xfa_object.$text]());
        labels[_xfa_object.$appendChild](label);
        labels.text.push(label);
        values[_xfa_object.$appendChild](value);
        values.text.push(value);
      }
    }
  }
  _bindOccurrences(formNode, matches, picture) {
    let baseClone;
    if (matches.length > 1) {
      baseClone = formNode[_xfa_object.$clone]();
      baseClone[_xfa_object.$removeChild](baseClone.occur);
      baseClone.occur = null;
    }
    this._bindValue(formNode, matches[0], picture);
    this._setProperties(formNode, matches[0]);
    this._bindItems(formNode, matches[0]);
    if (matches.length === 1) {
      return;
    }
    const parent = formNode[_xfa_object.$getParent]();
    const name = formNode[_xfa_object.$nodeName];
    const pos = parent[_xfa_object.$indexOf](formNode);
    for (let i = 1, ii = matches.length; i < ii; i++) {
      const match = matches[i];
      const clone = baseClone[_xfa_object.$clone]();
      parent[name].push(clone);
      parent[_xfa_object.$insertAt](pos + i, clone);
      this._bindValue(clone, match, picture);
      this._setProperties(clone, match);
      this._bindItems(clone, match);
    }
  }
  _createOccurrences(formNode) {
    if (!this.emptyMerge) {
      return;
    }
    const {
      occur
    } = formNode;
    if (!occur || occur.initial <= 1) {
      return;
    }
    const parent = formNode[_xfa_object.$getParent]();
    const name = formNode[_xfa_object.$nodeName];
    if (!(parent[name] instanceof _xfa_object.XFAObjectArray)) {
      return;
    }
    let currentNumber;
    if (formNode.name) {
      currentNumber = parent[name].children.filter(e => e.name === formNode.name).length;
    } else {
      currentNumber = parent[name].children.length;
    }
    const pos = parent[_xfa_object.$indexOf](formNode) + 1;
    const ii = occur.initial - currentNumber;
    if (ii) {
      const nodeClone = formNode[_xfa_object.$clone]();
      nodeClone[_xfa_object.$removeChild](nodeClone.occur);
      nodeClone.occur = null;
      parent[name].push(nodeClone);
      parent[_xfa_object.$insertAt](pos, nodeClone);
      for (let i = 1; i < ii; i++) {
        const clone = nodeClone[_xfa_object.$clone]();
        parent[name].push(clone);
        parent[_xfa_object.$insertAt](pos + i, clone);
      }
    }
  }
  _getOccurInfo(formNode) {
    const {
      name,
      occur
    } = formNode;
    if (!occur || !name) {
      return [1, 1];
    }
    const max = occur.max === -1 ? Infinity : occur.max;
    return [occur.min, max];
  }
  _setAndBind(formNode, dataNode) {
    this._setProperties(formNode, dataNode);
    this._bindItems(formNode, dataNode);
    this._bindElement(formNode, dataNode);
  }
  _bindElement(formNode, dataNode) {
    const uselessNodes = [];
    this._createOccurrences(formNode);
    for (const child of formNode[_xfa_object.$getChildren]()) {
      if (child[_xfa_object.$data]) {
        continue;
      }
      if (this._mergeMode === undefined && child[_xfa_object.$nodeName] === "subform") {
        this._mergeMode = child.mergeMode === "consumeData";
        const dataChildren = dataNode[_xfa_object.$getChildren]();
        if (dataChildren.length > 0) {
          this._bindOccurrences(child, [dataChildren[0]], null);
        } else if (this.emptyMerge) {
          const nsId = dataNode[_xfa_object.$namespaceId] === NS_DATASETS ? -1 : dataNode[_xfa_object.$namespaceId];
          const dataChild = child[_xfa_object.$data] = new _xfa_object.XmlObject(nsId, child.name || "root");
          dataNode[_xfa_object.$appendChild](dataChild);
          this._bindElement(child, dataChild);
        }
        continue;
      }
      if (!child[_xfa_object.$isBindable]()) {
        continue;
      }
      let global = false;
      let picture = null;
      let ref = null;
      let match = null;
      if (child.bind) {
        switch (child.bind.match) {
          case "none":
            this._setAndBind(child, dataNode);
            continue;
          case "global":
            global = true;
            break;
          case "dataRef":
            if (!child.bind.ref) {
              (0, _util.warn)(`XFA - ref is empty in node ${child[_xfa_object.$nodeName]}.`);
              this._setAndBind(child, dataNode);
              continue;
            }
            ref = child.bind.ref;
            break;
          default:
            break;
        }
        if (child.bind.picture) {
          picture = child.bind.picture[_xfa_object.$content];
        }
      }
      const [min, max] = this._getOccurInfo(child);
      if (ref) {
        match = (0, _som.searchNode)(this.root, dataNode, ref, true, false);
        if (match === null) {
          match = (0, _som.createDataNode)(this.data, dataNode, ref);
          if (!match) {
            continue;
          }
          if (this._isConsumeData()) {
            match[_xfa_object.$consumed] = true;
          }
          this._setAndBind(child, match);
          continue;
        } else {
          if (this._isConsumeData()) {
            match = match.filter(node => !node[_xfa_object.$consumed]);
          }
          if (match.length > max) {
            match = match.slice(0, max);
          } else if (match.length === 0) {
            match = null;
          }
          if (match && this._isConsumeData()) {
            match.forEach(node => {
              node[_xfa_object.$consumed] = true;
            });
          }
        }
      } else {
        if (!child.name) {
          this._setAndBind(child, dataNode);
          continue;
        }
        if (this._isConsumeData()) {
          const matches = [];
          while (matches.length < max) {
            const found = this._findDataByNameToConsume(child.name, child[_xfa_object.$hasSettableValue](), dataNode, global);
            if (!found) {
              break;
            }
            found[_xfa_object.$consumed] = true;
            matches.push(found);
          }
          match = matches.length > 0 ? matches : null;
        } else {
          match = dataNode[_xfa_object.$getRealChildrenByNameIt](child.name, false, this.emptyMerge).next().value;
          if (!match) {
            if (min === 0) {
              uselessNodes.push(child);
              continue;
            }
            const nsId = dataNode[_xfa_object.$namespaceId] === NS_DATASETS ? -1 : dataNode[_xfa_object.$namespaceId];
            match = child[_xfa_object.$data] = new _xfa_object.XmlObject(nsId, child.name);
            if (this.emptyMerge) {
              match[_xfa_object.$consumed] = true;
            }
            dataNode[_xfa_object.$appendChild](match);
            this._setAndBind(child, match);
            continue;
          }
          if (this.emptyMerge) {
            match[_xfa_object.$consumed] = true;
          }
          match = [match];
        }
      }
      if (match) {
        this._bindOccurrences(child, match, picture);
      } else if (min > 0) {
        this._setAndBind(child, dataNode);
      } else {
        uselessNodes.push(child);
      }
    }
    uselessNodes.forEach(node => node[_xfa_object.$getParent]()[_xfa_object.$removeChild](node));
  }
}
exports.Binder = Binder;