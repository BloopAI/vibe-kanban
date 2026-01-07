/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { type NodeKey } from 'lexical';
import { ReadonlySignal } from './signals';
/**
 * An extension that provides a `watchNodeKey` output that
 * returns a signal for the selection state of a node.
 *
 * Typically used for tracking whether a DecoratorNode is
 * currently selected or not. A framework independent
 * alternative to {@link useLexicalNodeSelection}.
 */
export declare const NodeSelectionExtension: import("lexical").LexicalExtension<import("lexical").ExtensionConfigBase, "@lexical/extension/NodeSelection", {
    watchNodeKey: (key: NodeKey) => ReadonlySignal<boolean>;
}, unknown>;
