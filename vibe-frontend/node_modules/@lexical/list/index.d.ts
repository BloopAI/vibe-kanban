/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { SerializedListItemNode } from './LexicalListItemNode';
import type { ListNodeTagType, ListType, SerializedListNode } from './LexicalListNode';
import type { LexicalCommand, LexicalEditor, NodeKey } from 'lexical';
import { INSERT_CHECK_LIST_COMMAND, registerCheckList } from './checkList';
import { $handleListInsertParagraph, $insertList, $removeList } from './formatList';
import { $createListItemNode, $isListItemNode, ListItemNode } from './LexicalListItemNode';
import { $createListNode, $isListNode, ListNode } from './LexicalListNode';
import { $getListDepth } from './utils';
export { $createListItemNode, $createListNode, $getListDepth, $handleListInsertParagraph, $insertList, $isListItemNode, $isListNode, $removeList, INSERT_CHECK_LIST_COMMAND, ListItemNode, ListNode, ListNodeTagType, ListType, registerCheckList, SerializedListItemNode, SerializedListNode, };
export declare const UPDATE_LIST_START_COMMAND: LexicalCommand<{
    listNodeKey: NodeKey;
    newStart: number;
}>;
export declare const INSERT_UNORDERED_LIST_COMMAND: LexicalCommand<void>;
export declare const INSERT_ORDERED_LIST_COMMAND: LexicalCommand<void>;
export declare const REMOVE_LIST_COMMAND: LexicalCommand<void>;
export declare function registerList(editor: LexicalEditor): () => void;
export declare function registerListStrictIndentTransform(editor: LexicalEditor): () => void;
/**
 * @deprecated use {@link $insertList} from an update or command listener.
 *
 * Inserts a new ListNode. If the selection's anchor node is an empty ListItemNode and is a child of
 * the root/shadow root, it will replace the ListItemNode with a ListNode and the old ListItemNode.
 * Otherwise it will replace its parent with a new ListNode and re-insert the ListItemNode and any previous children.
 * If the selection's anchor node is not an empty ListItemNode, it will add a new ListNode or merge an existing ListNode,
 * unless the the node is a leaf node, in which case it will attempt to find a ListNode up the branch and replace it with
 * a new ListNode, or create a new ListNode at the nearest root/shadow root.
 * @param editor - The lexical editor.
 * @param listType - The type of list, "number" | "bullet" | "check".
 */
export declare function insertList(editor: LexicalEditor, listType: ListType): void;
/**
 * @deprecated use {@link $removeList} from an update or command listener.
 *
 * Searches for the nearest ancestral ListNode and removes it. If selection is an empty ListItemNode
 * it will remove the whole list, including the ListItemNode. For each ListItemNode in the ListNode,
 * removeList will also generate new ParagraphNodes in the removed ListNode's place. Any child node
 * inside a ListItemNode will be appended to the new ParagraphNodes.
 * @param editor - The lexical editor.
 */
export declare function removeList(editor: LexicalEditor): void;
export interface ListConfig {
    /**
     * When `true`, enforces strict indentation rules for list items, ensuring consistent structure.
     * When `false` (default), indentation is more flexible.
     */
    hasStrictIndent: boolean;
}
/**
 * Configures {@link ListNode}, {@link ListItemNode} and registers
 * the strict indent transform if `hasStrictIndent` is true (default false).
 */
export declare const ListExtension: import("lexical").LexicalExtension<ListConfig, "@lexical/list/List", import("@lexical/extension").NamedSignalsOutput<ListConfig>, unknown>;
/**
 * Registers checklist functionality for {@link ListNode} and
 * {@link ListItemNode} with a
 * {@link INSERT_CHECK_LIST_COMMAND} listener and
 * the expected keyboard and mouse interactions for
 * checkboxes.
 */
export declare const CheckListExtension: import("lexical").LexicalExtension<import("lexical").ExtensionConfigBase, "@lexical/list/CheckList", unknown, unknown>;
