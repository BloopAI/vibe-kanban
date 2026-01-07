/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var devtoolsCore = require('@lexical/devtools-core');
var utils = require('@lexical/utils');
var React = require('react');
var jsxRuntime = require('react/jsx-runtime');

function _interopNamespaceDefault(e) {
  var n = Object.create(null);
  if (e) {
    for (var k in e) {
      n[k] = e[k];
    }
  }
  n.default = e;
  return n;
}

var React__namespace = /*#__PURE__*/_interopNamespaceDefault(React);

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function TreeView({
  treeTypeButtonClassName,
  timeTravelButtonClassName,
  timeTravelPanelSliderClassName,
  timeTravelPanelButtonClassName,
  timeTravelPanelClassName,
  viewClassName,
  editor,
  customPrintNode
}) {
  const treeElementRef = /*#__PURE__*/React__namespace.createRef();
  const [editorCurrentState, setEditorCurrentState] = React.useState(editor.getEditorState());
  const commandsLog = devtoolsCore.useLexicalCommandsLog(editor);
  React.useEffect(() => {
    // Registers listeners to update the tree view when the editor state changes
    return utils.mergeRegister(editor.registerUpdateListener(({
      editorState
    }) => {
      setEditorCurrentState(editorState);
    }), editor.registerEditableListener(() => {
      setEditorCurrentState(editor.getEditorState());
    }));
  }, [editor]);
  React.useEffect(() => {
    const element = treeElementRef.current;
    if (element !== null) {
      // Assigns the editor instance to the tree view DOM element for internal tracking
      // @ts-ignore Internal field used by Lexical
      element.__lexicalEditor = editor;
      return () => {
        // Cleans up the reference when the component is unmounted
        // @ts-ignore Internal field used by Lexical
        element.__lexicalEditor = null;
      };
    }
  }, [editor, treeElementRef]);

  /**
   * Handles toggling the readonly state of the editor.
   *
   * @param {boolean} isReadonly - Whether the editor should be set to readonly.
   */
  const handleEditorReadOnly = isReadonly => {
    const rootElement = editor.getRootElement();
    if (rootElement == null) {
      return;
    }
    rootElement.contentEditable = isReadonly ? 'false' : 'true';
  };
  return /*#__PURE__*/jsxRuntime.jsx(devtoolsCore.TreeView, {
    treeTypeButtonClassName: treeTypeButtonClassName,
    timeTravelButtonClassName: timeTravelButtonClassName,
    timeTravelPanelSliderClassName: timeTravelPanelSliderClassName,
    timeTravelPanelButtonClassName: timeTravelPanelButtonClassName,
    viewClassName: viewClassName,
    timeTravelPanelClassName: timeTravelPanelClassName,
    setEditorReadOnly: handleEditorReadOnly,
    editorState: editorCurrentState,
    setEditorState: state => editor.setEditorState(state),
    generateContent: async function (exportDOM) {
      // Generates the content for the tree view, allowing customization with exportDOM and customPrintNode
      return devtoolsCore.generateContent(editor, commandsLog, exportDOM, customPrintNode);
    },
    ref: treeElementRef,
    commandsLog: commandsLog
  });
}

exports.TreeView = TreeView;
