/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor } from 'lexical';
import type { JSX } from 'react';
import { CustomPrintNodeFn } from '@lexical/devtools-core';
/**
 * TreeView is a React component that provides a visual representation of
 * the Lexical editor's state and enables debugging features like time travel
 * and custom tree node rendering.
 *
 * @param {Object} props - The properties passed to the TreeView component.
 * @param {LexicalEditor} props.editor - The Lexical editor instance to be visualized and debugged.
 * @param {string} [props.treeTypeButtonClassName] - Custom class name for the tree type toggle button.
 * @param {string} [props.timeTravelButtonClassName] - Custom class name for the time travel toggle button.
 * @param {string} [props.timeTravelPanelButtonClassName] - Custom class name for buttons inside the time travel panel.
 * @param {string} [props.timeTravelPanelClassName] - Custom class name for the overall time travel panel container.
 * @param {string} [props.timeTravelPanelSliderClassName] - Custom class name for the time travel slider in the panel.
 * @param {string} [props.viewClassName] - Custom class name for the tree view container.
 * @param {CustomPrintNodeFn} [props.customPrintNode] - A function for customizing the display of nodes in the tree.
 *
 * @returns {JSX.Element} - A React element that visualizes the editor's state and supports debugging interactions.
 */
export declare function TreeView({ treeTypeButtonClassName, timeTravelButtonClassName, timeTravelPanelSliderClassName, timeTravelPanelButtonClassName, timeTravelPanelClassName, viewClassName, editor, customPrintNode, }: {
    editor: LexicalEditor;
    treeTypeButtonClassName?: string;
    timeTravelButtonClassName?: string;
    timeTravelPanelButtonClassName?: string;
    timeTravelPanelClassName?: string;
    timeTravelPanelSliderClassName?: string;
    viewClassName?: string;
    customPrintNode?: CustomPrintNodeFn;
}): JSX.Element;
