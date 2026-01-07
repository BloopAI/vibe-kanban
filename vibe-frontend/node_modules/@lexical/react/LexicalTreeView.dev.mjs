/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalCommandsLog, TreeView as TreeView$1, generateContent } from '@lexical/devtools-core';
import { mergeRegister } from '@lexical/utils';
import * as React from 'react';
import { useState, useEffect } from 'react';
import { jsx } from 'react/jsx-runtime';

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
  const treeElementRef = /*#__PURE__*/React.createRef();
  const [editorCurrentState, setEditorCurrentState] = useState(editor.getEditorState());
  const commandsLog = useLexicalCommandsLog(editor);
  useEffect(() => {
    // Registers listeners to update the tree view when the editor state changes
    return mergeRegister(editor.registerUpdateListener(({
      editorState
    }) => {
      setEditorCurrentState(editorState);
    }), editor.registerEditableListener(() => {
      setEditorCurrentState(editor.getEditorState());
    }));
  }, [editor]);
  useEffect(() => {
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
  return /*#__PURE__*/jsx(TreeView$1, {
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
      return generateContent(editor, commandsLog, exportDOM, customPrintNode);
    },
    ref: treeElementRef,
    commandsLog: commandsLog
  });
}

export { TreeView };
