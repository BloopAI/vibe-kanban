/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */

import type {
  EditorThemeClasses,
  LexicalEditor,
  LexicalNode,
  EditorState,
  LexicalNodeReplacement,
  HTMLConfig,
} from 'lexical';

export type InitialEditorStateType =
  | null
  | string
  | EditorState
  | ((editor: LexicalEditor) => void);

export type InitialConfigType = $ReadOnly<{
  editable?: boolean,
  namespace: string,
  nodes?: $ReadOnlyArray<Class<LexicalNode> | LexicalNodeReplacement>,
  theme?: EditorThemeClasses,
  editorState?: InitialEditorStateType,
  onError: (error: Error, editor: LexicalEditor) => void,
  html?: HTMLConfig,
}>;

type Props = {
  initialConfig: InitialConfigType,
  children: React.Node,
};

declare export function LexicalComposer(Props): React.MixedElement;
