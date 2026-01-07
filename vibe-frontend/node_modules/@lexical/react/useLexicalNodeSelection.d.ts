/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { NodeKey } from 'lexical';
/**
 * A custom hook to manage the selection state of a specific node in a Lexical editor.
 *
 * This hook provides utilities to:
 * - Check if a node is selected.
 * - Update its selection state.
 * - Clear the selection.
 *
 * @param {NodeKey} key - The key of the node to track selection for.
 * @returns {[boolean, (selected: boolean) => void, () => void]} A tuple containing:
 * - `isSelected` (boolean): Whether the node is currently selected.
 * - `setSelected` (function): A function to set the selection state of the node.
 * - `clearSelected` (function): A function to clear the selection of the node.
 *
 */
export declare function useLexicalNodeSelection(key: NodeKey): [boolean, (selected: boolean) => void, () => void];
