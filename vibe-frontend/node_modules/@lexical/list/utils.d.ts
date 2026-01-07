/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalNode, Spread } from 'lexical';
import { ListItemNode, ListNode } from './';
/**
 * Checks the depth of listNode from the root node.
 * @param listNode - The ListNode to be checked.
 * @returns The depth of the ListNode.
 */
export declare function $getListDepth(listNode: ListNode): number;
/**
 * Finds the nearest ancestral ListNode and returns it, throws an invariant if listItem is not a ListItemNode.
 * @param listItem - The node to be checked.
 * @returns The ListNode found.
 */
export declare function $getTopListNode(listItem: LexicalNode): ListNode;
/**
 * Checks if listItem has no child ListNodes and has no ListItemNode ancestors with siblings.
 * @param listItem - the ListItemNode to be checked.
 * @returns true if listItem has no child ListNode and no ListItemNode ancestors with siblings, false otherwise.
 */
export declare function $isLastItemInList(listItem: ListItemNode): boolean;
/**
 * A recursive Depth-First Search (Postorder Traversal) that finds all of a node's children
 * that are of type ListItemNode and returns them in an array.
 * @param node - The ListNode to start the search.
 * @returns An array containing all nodes of type ListItemNode found.
 */
export declare function $getAllListItems(node: ListNode): Array<ListItemNode>;
declare const NestedListNodeBrand: unique symbol;
/**
 * Checks to see if the passed node is a ListItemNode and has a ListNode as a child.
 * @param node - The node to be checked.
 * @returns true if the node is a ListItemNode and has a ListNode child, false otherwise.
 */
export declare function isNestedListNode(node: LexicalNode | null | undefined): node is Spread<{
    getFirstChild(): ListNode;
    [NestedListNodeBrand]: never;
}, ListItemNode>;
/**
 * Traverses up the tree and returns the first ListItemNode found.
 * @param node - Node to start the search.
 * @returns The first ListItemNode found, or null if none exist.
 */
export declare function $findNearestListItemNode(node: LexicalNode): ListItemNode | null;
/**
 * Takes a deeply nested ListNode or ListItemNode and traverses up the branch to delete the first
 * ancestral ListNode (which could be the root ListNode) or ListItemNode with siblings, essentially
 * bringing the deeply nested node up the branch once. Would remove sublist if it has siblings.
 * Should not break ListItem -> List -> ListItem chain as empty List/ItemNodes should be removed on .remove().
 * @param sublist - The nested ListNode or ListItemNode to be brought up the branch.
 */
export declare function $removeHighestEmptyListParent(sublist: ListItemNode | ListNode): void;
/**
 * Wraps a node into a ListItemNode.
 * @param node - The node to be wrapped into a ListItemNode
 * @returns The ListItemNode which the passed node is wrapped in.
 */
export declare function $wrapInListItem(node: LexicalNode): ListItemNode;
export {};
