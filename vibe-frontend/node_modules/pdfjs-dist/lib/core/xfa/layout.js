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
exports.addHTML = addHTML;
exports.checkDimensions = checkDimensions;
exports.flushHTML = flushHTML;
exports.getAvailableSpace = getAvailableSpace;
var _xfa_object = require("./xfa_object.js");
var _html_utils = require("./html_utils.js");
function createLine(node, children) {
  return {
    name: "div",
    attributes: {
      class: [node.layout === "lr-tb" ? "xfaLr" : "xfaRl"]
    },
    children
  };
}
function flushHTML(node) {
  if (!node[_xfa_object.$extra]) {
    return null;
  }
  const attributes = node[_xfa_object.$extra].attributes;
  const html = {
    name: "div",
    attributes,
    children: node[_xfa_object.$extra].children
  };
  if (node[_xfa_object.$extra].failingNode) {
    const htmlFromFailing = node[_xfa_object.$extra].failingNode[_xfa_object.$flushHTML]();
    if (htmlFromFailing) {
      if (node.layout.endsWith("-tb")) {
        html.children.push(createLine(node, [htmlFromFailing]));
      } else {
        html.children.push(htmlFromFailing);
      }
    }
  }
  if (html.children.length === 0) {
    return null;
  }
  return html;
}
function addHTML(node, html, bbox) {
  const extra = node[_xfa_object.$extra];
  const availableSpace = extra.availableSpace;
  const [x, y, w, h] = bbox;
  switch (node.layout) {
    case "position":
      {
        extra.width = Math.max(extra.width, x + w);
        extra.height = Math.max(extra.height, y + h);
        extra.children.push(html);
        break;
      }
    case "lr-tb":
    case "rl-tb":
      if (!extra.line || extra.attempt === 1) {
        extra.line = createLine(node, []);
        extra.children.push(extra.line);
        extra.numberInLine = 0;
      }
      extra.numberInLine += 1;
      extra.line.children.push(html);
      if (extra.attempt === 0) {
        extra.currentWidth += w;
        extra.height = Math.max(extra.height, extra.prevHeight + h);
      } else {
        extra.currentWidth = w;
        extra.prevHeight = extra.height;
        extra.height += h;
        extra.attempt = 0;
      }
      extra.width = Math.max(extra.width, extra.currentWidth);
      break;
    case "rl-row":
    case "row":
      {
        extra.children.push(html);
        extra.width += w;
        extra.height = Math.max(extra.height, h);
        const height = (0, _html_utils.measureToString)(extra.height);
        for (const child of extra.children) {
          child.attributes.style.height = height;
        }
        break;
      }
    case "table":
      {
        extra.width = Math.min(availableSpace.width, Math.max(extra.width, w));
        extra.height += h;
        extra.children.push(html);
        break;
      }
    case "tb":
      {
        extra.width = Math.min(availableSpace.width, Math.max(extra.width, w));
        extra.height += h;
        extra.children.push(html);
        break;
      }
  }
}
function getAvailableSpace(node) {
  const availableSpace = node[_xfa_object.$extra].availableSpace;
  const marginV = node.margin ? node.margin.topInset + node.margin.bottomInset : 0;
  const marginH = node.margin ? node.margin.leftInset + node.margin.rightInset : 0;
  switch (node.layout) {
    case "lr-tb":
    case "rl-tb":
      if (node[_xfa_object.$extra].attempt === 0) {
        return {
          width: availableSpace.width - marginH - node[_xfa_object.$extra].currentWidth,
          height: availableSpace.height - marginV - node[_xfa_object.$extra].prevHeight
        };
      }
      return {
        width: availableSpace.width - marginH,
        height: availableSpace.height - marginV - node[_xfa_object.$extra].height
      };
    case "rl-row":
    case "row":
      const width = node[_xfa_object.$extra].columnWidths.slice(node[_xfa_object.$extra].currentColumn).reduce((a, x) => a + x);
      return {
        width,
        height: availableSpace.height - marginH
      };
    case "table":
    case "tb":
      return {
        width: availableSpace.width - marginH,
        height: availableSpace.height - marginV - node[_xfa_object.$extra].height
      };
    case "position":
    default:
      return availableSpace;
  }
}
function getTransformedBBox(node) {
  let w = node.w === "" ? NaN : node.w;
  let h = node.h === "" ? NaN : node.h;
  let [centerX, centerY] = [0, 0];
  switch (node.anchorType || "") {
    case "bottomCenter":
      [centerX, centerY] = [w / 2, h];
      break;
    case "bottomLeft":
      [centerX, centerY] = [0, h];
      break;
    case "bottomRight":
      [centerX, centerY] = [w, h];
      break;
    case "middleCenter":
      [centerX, centerY] = [w / 2, h / 2];
      break;
    case "middleLeft":
      [centerX, centerY] = [0, h / 2];
      break;
    case "middleRight":
      [centerX, centerY] = [w, h / 2];
      break;
    case "topCenter":
      [centerX, centerY] = [w / 2, 0];
      break;
    case "topRight":
      [centerX, centerY] = [w, 0];
      break;
  }
  let x, y;
  switch (node.rotate || 0) {
    case 0:
      [x, y] = [-centerX, -centerY];
      break;
    case 90:
      [x, y] = [-centerY, centerX];
      [w, h] = [h, -w];
      break;
    case 180:
      [x, y] = [centerX, centerY];
      [w, h] = [-w, -h];
      break;
    case 270:
      [x, y] = [centerY, -centerX];
      [w, h] = [-h, w];
      break;
  }
  return [node.x + x + Math.min(0, w), node.y + y + Math.min(0, h), Math.abs(w), Math.abs(h)];
}
function checkDimensions(node, space) {
  if (node[_xfa_object.$getTemplateRoot]()[_xfa_object.$extra].firstUnsplittable === null) {
    return true;
  }
  if (node.w === 0 || node.h === 0) {
    return true;
  }
  const ERROR = 2;
  const parent = node[_xfa_object.$getSubformParent]();
  const attempt = parent[_xfa_object.$extra] && parent[_xfa_object.$extra].attempt || 0;
  const [, y, w, h] = getTransformedBBox(node);
  switch (parent.layout) {
    case "lr-tb":
    case "rl-tb":
      if (attempt === 0) {
        if (!node[_xfa_object.$getTemplateRoot]()[_xfa_object.$extra].noLayoutFailure) {
          if (node.h !== "" && Math.round(h - space.height) > ERROR) {
            return false;
          }
          if (node.w !== "") {
            if (Math.round(w - space.width) <= ERROR) {
              return true;
            }
            if (parent[_xfa_object.$extra].numberInLine === 0) {
              return space.height > ERROR;
            }
            return false;
          }
          return space.width > ERROR;
        }
        if (node.w !== "") {
          return Math.round(w - space.width) <= ERROR;
        }
        return space.width > ERROR;
      }
      if (node[_xfa_object.$getTemplateRoot]()[_xfa_object.$extra].noLayoutFailure) {
        return true;
      }
      if (node.h !== "" && Math.round(h - space.height) > ERROR) {
        return false;
      }
      if (node.w === "" || Math.round(w - space.width) <= ERROR) {
        return space.height > ERROR;
      }
      if (parent[_xfa_object.$isThereMoreWidth]()) {
        return false;
      }
      return space.height > ERROR;
    case "table":
    case "tb":
      if (node[_xfa_object.$getTemplateRoot]()[_xfa_object.$extra].noLayoutFailure) {
        return true;
      }
      if (node.h !== "" && !node[_xfa_object.$isSplittable]()) {
        return Math.round(h - space.height) <= ERROR;
      }
      if (node.w === "" || Math.round(w - space.width) <= ERROR) {
        return space.height > ERROR;
      }
      if (parent[_xfa_object.$isThereMoreWidth]()) {
        return false;
      }
      return space.height > ERROR;
    case "position":
      if (node[_xfa_object.$getTemplateRoot]()[_xfa_object.$extra].noLayoutFailure) {
        return true;
      }
      if (node.h === "" || Math.round(h + y - space.height) <= ERROR) {
        return true;
      }
      const area = node[_xfa_object.$getTemplateRoot]()[_xfa_object.$extra].currentContentArea;
      return h + y > area.h;
    case "rl-row":
    case "row":
      if (node[_xfa_object.$getTemplateRoot]()[_xfa_object.$extra].noLayoutFailure) {
        return true;
      }
      if (node.h !== "") {
        return Math.round(h - space.height) <= ERROR;
      }
      return true;
    default:
      return true;
  }
}