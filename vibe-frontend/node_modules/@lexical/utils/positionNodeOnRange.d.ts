/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { type LexicalEditor } from 'lexical';
/**
 * Place one or multiple newly created Nodes at the passed Range's position.
 * Multiple nodes will only be created when the Range spans multiple lines (aka
 * client rects).
 *
 * This function can come particularly useful to highlight particular parts of
 * the text without interfering with the EditorState, that will often replicate
 * the state across collab and clipboard.
 *
 * This function accounts for DOM updates which can modify the passed Range.
 * Hence, the function return to remove the listener.
 */
export default function mlcPositionNodeOnRange(editor: LexicalEditor, range: Range, onReposition: (node: Array<HTMLElement>) => void): () => void;
