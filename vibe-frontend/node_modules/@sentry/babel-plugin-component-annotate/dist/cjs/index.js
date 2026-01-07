'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _iterableToArrayLimit(arr, i) {
  var _i = null == arr ? null : "undefined" != typeof Symbol && arr[Symbol.iterator] || arr["@@iterator"];
  if (null != _i) {
    var _s,
      _e,
      _x,
      _r,
      _arr = [],
      _n = !0,
      _d = !1;
    try {
      if (_x = (_i = _i.call(arr)).next, 0 === i) {
        if (Object(_i) !== _i) return;
        _n = !1;
      } else for (; !(_n = (_s = _x.call(_i)).done) && (_arr.push(_s.value), _arr.length !== i); _n = !0);
    } catch (err) {
      _d = !0, _e = err;
    } finally {
      try {
        if (!_n && null != _i.return && (_r = _i.return(), Object(_r) !== _r)) return;
      } finally {
        if (_d) throw _e;
      }
    }
    return _arr;
  }
}
function _typeof(obj) {
  "@babel/helpers - typeof";

  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) {
    return typeof obj;
  } : function (obj) {
    return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
  }, _typeof(obj);
}
function _slicedToArray(arr, i) {
  return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
}
function _arrayWithHoles(arr) {
  if (Array.isArray(arr)) return arr;
}
function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
}
function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;
  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];
  return arr2;
}
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}

/**
 * MIT License
 *
 * Copyright (c) 2020 Engineering at FullStory
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */

var KNOWN_INCOMPATIBLE_PLUGINS = [
// This module might be causing an issue preventing clicks. For safety, we won't run on this module.
"react-native-testfairy",
// This module checks for unexpected property keys and throws an exception.
"@react-navigation"];
var DEFAULT_IGNORED_ELEMENTS = ["a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins", "kbd", "keygen", "label", "legend", "li", "link", "main", "map", "mark", "menu", "menuitem", "meter", "nav", "noscript", "object", "ol", "optgroup", "option", "output", "p", "param", "pre", "progress", "q", "rb", "rp", "rt", "rtc", "ruby", "s", "samp", "script", "section", "select", "small", "source", "span", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var", "video", "wbr"];

var webComponentName = "data-sentry-component";
var webElementName = "data-sentry-element";
var webSourceFileName = "data-sentry-source-file";
var nativeComponentName = "dataSentryComponent";
var nativeElementName = "dataSentryElement";
var nativeSourceFileName = "dataSentrySourceFile";
// We must export the plugin as default, otherwise the Babel loader will not be able to resolve it when configured using its string identifier
function componentNameAnnotatePlugin(_ref) {
  var t = _ref.types;
  return {
    visitor: {
      FunctionDeclaration: function FunctionDeclaration(path, state) {
        var _state$opts$ignoredCo;
        if (!path.node.id || !path.node.id.name) {
          return;
        }
        if (isKnownIncompatiblePluginFromState(state)) {
          return;
        }
        functionBodyPushAttributes(state.opts["annotate-fragments"] === true, t, path, path.node.id.name, sourceFileNameFromState(state), attributeNamesFromState(state), (_state$opts$ignoredCo = state.opts.ignoredComponents) !== null && _state$opts$ignoredCo !== void 0 ? _state$opts$ignoredCo : []);
      },
      ArrowFunctionExpression: function ArrowFunctionExpression(path, state) {
        var _state$opts$ignoredCo2;
        // We're expecting a `VariableDeclarator` like `const MyComponent =`
        var parent = path.parent;
        if (!parent || !("id" in parent) || !parent.id || !("name" in parent.id) || !parent.id.name) {
          return;
        }
        if (isKnownIncompatiblePluginFromState(state)) {
          return;
        }
        functionBodyPushAttributes(state.opts["annotate-fragments"] === true, t, path, parent.id.name, sourceFileNameFromState(state), attributeNamesFromState(state), (_state$opts$ignoredCo2 = state.opts.ignoredComponents) !== null && _state$opts$ignoredCo2 !== void 0 ? _state$opts$ignoredCo2 : []);
      },
      ClassDeclaration: function ClassDeclaration(path, state) {
        var _state$opts$ignoredCo3;
        var name = path.get("id");
        var properties = path.get("body").get("body");
        var render = properties.find(function (prop) {
          return prop.isClassMethod() && prop.get("key").isIdentifier({
            name: "render"
          });
        });
        if (!render || !render.traverse || isKnownIncompatiblePluginFromState(state)) {
          return;
        }
        var ignoredComponents = (_state$opts$ignoredCo3 = state.opts.ignoredComponents) !== null && _state$opts$ignoredCo3 !== void 0 ? _state$opts$ignoredCo3 : [];
        render.traverse({
          ReturnStatement: function ReturnStatement(returnStatement) {
            var arg = returnStatement.get("argument");
            if (!arg.isJSXElement() && !arg.isJSXFragment()) {
              return;
            }
            processJSX(state.opts["annotate-fragments"] === true, t, arg, name.node && name.node.name, sourceFileNameFromState(state), attributeNamesFromState(state), ignoredComponents);
          }
        });
      }
    }
  };
}
function functionBodyPushAttributes(annotateFragments, t, path, componentName, sourceFileName, attributeNames, ignoredComponents) {
  var jsxNode;
  var functionBody = path.get("body").get("body");
  if (!("length" in functionBody) && functionBody.parent && (functionBody.parent.type === "JSXElement" || functionBody.parent.type === "JSXFragment")) {
    var maybeJsxNode = functionBody.find(function (c) {
      return c.type === "JSXElement" || c.type === "JSXFragment";
    });
    if (!maybeJsxNode) {
      return;
    }
    jsxNode = maybeJsxNode;
  } else {
    var returnStatement = functionBody.find(function (c) {
      return c.type === "ReturnStatement";
    });
    if (!returnStatement) {
      return;
    }
    var arg = returnStatement.get("argument");
    if (!arg) {
      return;
    }
    if (Array.isArray(arg)) {
      return;
    }

    // Handle the case of a function body returning a ternary operation.
    // `return (maybeTrue ? '' : (<SubComponent />))`
    if (arg.isConditionalExpression()) {
      var consequent = arg.get("consequent");
      if (consequent.isJSXFragment() || consequent.isJSXElement()) {
        processJSX(annotateFragments, t, consequent, componentName, sourceFileName, attributeNames, ignoredComponents);
      }
      var alternate = arg.get("alternate");
      if (alternate.isJSXFragment() || alternate.isJSXElement()) {
        processJSX(annotateFragments, t, alternate, componentName, sourceFileName, attributeNames, ignoredComponents);
      }
      return;
    }
    if (!arg.isJSXFragment() && !arg.isJSXElement()) {
      return;
    }
    jsxNode = arg;
  }
  if (!jsxNode) {
    return;
  }
  processJSX(annotateFragments, t, jsxNode, componentName, sourceFileName, attributeNames, ignoredComponents);
}
function processJSX(annotateFragments, t, jsxNode, componentName, sourceFileName, attributeNames, ignoredComponents) {
  if (!jsxNode) {
    return;
  }
  // NOTE: I don't know of a case where `openingElement` would have more than one item,
  // but it's safer to always iterate
  var paths = jsxNode.get("openingElement");
  var openingElements = Array.isArray(paths) ? paths : [paths];
  openingElements.forEach(function (openingElement) {
    applyAttributes(t, openingElement, componentName, sourceFileName, attributeNames, ignoredComponents);
  });
  var children = jsxNode.get("children");
  // TODO: See why `Array.isArray` doesn't have correct behaviour here
  if (children && !("length" in children)) {
    // A single child was found, maybe a bit of static text
    children = [children];
  }
  var shouldSetComponentName = annotateFragments;
  children.forEach(function (child) {
    // Happens for some node types like plain text
    if (!child.node) {
      return;
    }

    // Children don't receive the data-component attribute so we pass null for componentName unless it's the first child of a Fragment with a node and `annotateFragments` is true
    var openingElement = child.get("openingElement");
    // TODO: Improve this. We never expect to have multiple opening elements
    // but if it's possible, this should work
    if (Array.isArray(openingElement)) {
      return;
    }
    if (shouldSetComponentName && openingElement && openingElement.node) {
      shouldSetComponentName = false;
      processJSX(annotateFragments, t, child, componentName, sourceFileName, attributeNames, ignoredComponents);
    } else {
      processJSX(annotateFragments, t, child, null, sourceFileName, attributeNames, ignoredComponents);
    }
  });
}
function applyAttributes(t, openingElement, componentName, sourceFileName, attributeNames, ignoredComponents) {
  var _attributeNames = _slicedToArray(attributeNames, 3),
    componentAttributeName = _attributeNames[0],
    elementAttributeName = _attributeNames[1],
    sourceFileAttributeName = _attributeNames[2];
  if (isReactFragment(t, openingElement)) {
    return;
  }
  // e.g., Raw JSX text like the `A` in `<h1>a</h1>`
  if (!openingElement.node) {
    return;
  }
  if (!openingElement.node.attributes) openingElement.node.attributes = [];
  var elementName = getPathName(t, openingElement);
  var isAnIgnoredComponent = ignoredComponents.some(function (ignoredComponent) {
    return ignoredComponent === componentName || ignoredComponent === elementName;
  });

  // Add a stable attribute for the element name but only for non-DOM names
  var isAnIgnoredElement = false;
  if (!isAnIgnoredComponent && !hasAttributeWithName(openingElement, componentAttributeName) && (componentAttributeName !== elementAttributeName || !componentName)) {
    if (DEFAULT_IGNORED_ELEMENTS.includes(elementName)) {
      isAnIgnoredElement = true;
    } else {
      // TODO: Is it possible to avoid this null check?
      if (elementAttributeName) {
        openingElement.node.attributes.push(t.jSXAttribute(t.jSXIdentifier(elementAttributeName), t.stringLiteral(elementName)));
      }
    }
  }

  // Add a stable attribute for the component name (absent for non-root elements)
  if (componentName && !isAnIgnoredComponent && !hasAttributeWithName(openingElement, componentAttributeName)) {
    // TODO: Is it possible to avoid this null check?
    if (componentAttributeName) {
      openingElement.node.attributes.push(t.jSXAttribute(t.jSXIdentifier(componentAttributeName), t.stringLiteral(componentName)));
    }
  }

  // Add a stable attribute for the source file name (absent for non-root elements)
  if (sourceFileName && !isAnIgnoredComponent && (componentName || isAnIgnoredElement === false) && !hasAttributeWithName(openingElement, sourceFileAttributeName)) {
    // TODO: Is it possible to avoid this null check?
    if (sourceFileAttributeName) {
      openingElement.node.attributes.push(t.jSXAttribute(t.jSXIdentifier(sourceFileAttributeName), t.stringLiteral(sourceFileName)));
    }
  }
}
function sourceFileNameFromState(state) {
  var name = fullSourceFileNameFromState(state);
  if (!name) {
    return undefined;
  }
  if (name.indexOf("/") !== -1) {
    return name.split("/").pop();
  } else if (name.indexOf("\\") !== -1) {
    return name.split("\\").pop();
  } else {
    return name;
  }
}
function fullSourceFileNameFromState(state) {
  var _state$file$opts$pars;
  // @ts-expect-error This type is incorrect in Babel, `sourceFileName` is the correct type
  var name = (_state$file$opts$pars = state.file.opts.parserOpts) === null || _state$file$opts$pars === void 0 ? void 0 : _state$file$opts$pars.sourceFileName;
  if (typeof name === "string") {
    return name;
  }
  return null;
}
function isKnownIncompatiblePluginFromState(state) {
  var fullSourceFileName = fullSourceFileNameFromState(state);
  if (!fullSourceFileName) {
    return false;
  }
  return KNOWN_INCOMPATIBLE_PLUGINS.some(function (pluginName) {
    if (fullSourceFileName.includes("/node_modules/".concat(pluginName, "/")) || fullSourceFileName.includes("\\node_modules\\".concat(pluginName, "\\"))) {
      return true;
    }
    return false;
  });
}
function attributeNamesFromState(state) {
  if (state.opts["native"]) {
    return [nativeComponentName, nativeElementName, nativeSourceFileName];
  }
  return [webComponentName, webElementName, webSourceFileName];
}
function isReactFragment(t, openingElement) {
  if (openingElement.isJSXFragment()) {
    return true;
  }
  var elementName = getPathName(t, openingElement);
  if (elementName === "Fragment" || elementName === "React.Fragment") {
    return true;
  }

  // TODO: All these objects are typed as unknown, maybe an oversight in Babel types?
  if (openingElement.node && "name" in openingElement.node && openingElement.node.name && _typeof(openingElement.node.name) === "object" && "type" in openingElement.node.name && openingElement.node.name.type === "JSXMemberExpression") {
    if (!("name" in openingElement.node)) {
      return false;
    }
    var nodeName = openingElement.node.name;
    if (_typeof(nodeName) !== "object" || !nodeName) {
      return false;
    }
    if ("object" in nodeName && "property" in nodeName) {
      var nodeNameObject = nodeName.object;
      var nodeNameProperty = nodeName.property;
      if (_typeof(nodeNameObject) !== "object" || _typeof(nodeNameProperty) !== "object") {
        return false;
      }
      if (!nodeNameObject || !nodeNameProperty) {
        return false;
      }
      var objectName = "name" in nodeNameObject && nodeNameObject.name;
      var propertyName = "name" in nodeNameProperty && nodeNameProperty.name;
      if (objectName === "React" && propertyName === "Fragment") {
        return true;
      }
    }
  }
  return false;
}
function hasAttributeWithName(openingElement, name) {
  if (!name) {
    return false;
  }
  return openingElement.node.attributes.some(function (node) {
    if (node.type === "JSXAttribute") {
      return node.name.name === name;
    }
    return false;
  });
}
function getPathName(t, path) {
  if (!path.node) return UNKNOWN_ELEMENT_NAME;
  if (!("name" in path.node)) {
    return UNKNOWN_ELEMENT_NAME;
  }
  var name = path.node.name;
  if (typeof name === "string") {
    return name;
  }
  if (t.isIdentifier(name) || t.isJSXIdentifier(name)) {
    return name.name;
  }
  if (t.isJSXNamespacedName(name)) {
    return name.name.name;
  }

  // Handle JSX member expressions like Tab.Group
  if (t.isJSXMemberExpression(name)) {
    var objectName = getJSXMemberExpressionObjectName(t, name.object);
    var propertyName = name.property.name;
    return "".concat(objectName, ".").concat(propertyName);
  }
  return UNKNOWN_ELEMENT_NAME;
}

// Recursively handle nested member expressions (e.g. Components.UI.Header)
function getJSXMemberExpressionObjectName(t, object) {
  if (t.isJSXIdentifier(object)) {
    return object.name;
  }
  if (t.isJSXMemberExpression(object)) {
    var objectName = getJSXMemberExpressionObjectName(t, object.object);
    return "".concat(objectName, ".").concat(object.property.name);
  }
  return UNKNOWN_ELEMENT_NAME;
}
var UNKNOWN_ELEMENT_NAME = "unknown";

exports["default"] = componentNameAnnotatePlugin;
//# sourceMappingURL=index.js.map
