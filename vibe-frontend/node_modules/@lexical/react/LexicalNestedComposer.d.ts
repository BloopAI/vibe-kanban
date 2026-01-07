/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { JSX } from 'react';
import { EditorThemeClasses, Klass, LexicalEditor, LexicalNode, LexicalNodeReplacement } from 'lexical';
import { ReactNode } from 'react';
export interface LexicalNestedComposerProps {
    /**
     * Any children (e.g. plug-ins) for this editor. Note that the nested editor
     * does not inherit any plug-ins or registrations from those plug-ins (such
     * as transforms and command listeners that may be necessary for correct
     * operation of those nodes) from the parent editor. If you are using nodes
     * that require plug-ins they must also be instantiated here.
     */
    children?: ReactNode;
    /**
     * The nested editor, created outside of this component (typically in the
     * implementation of a LexicalNode) with {@link createEditor}
     */
    initialEditor: LexicalEditor;
    /**
     * Optionally overwrite the theme of the initialEditor
     */
    initialTheme?: EditorThemeClasses;
    /**
     * @deprecated This feature is not safe or correctly implemented and will be
     * removed in v0.32.0. The only correct time to configure the nodes is when
     * creating the initialEditor.
     *
     * @example
     * ```ts
     * // This is normally in the implementation of a LexicalNode that
     * // owns the nested editor
     * editor = createEditor({nodes: [], parentEditor: $getEditor()});
     * ```
     */
    initialNodes?: ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement>;
    /**
     * If this is not explicitly set to true, and the collab plugin is active,
     * rendering the children of this component will not happen until collab is ready.
     */
    skipCollabChecks?: undefined | true;
    /**
     * If this is not explicitly set to true, the editable state of the nested
     * editor will automatically follow the parent editor's editable state.
     * When set to true, the nested editor is responsible for managing its own
     * editable state.
     *
     * Available since v0.29.0
     */
    skipEditableListener?: undefined | true;
}
export declare function LexicalNestedComposer({ initialEditor, children, initialNodes, initialTheme, skipCollabChecks, skipEditableListener, }: LexicalNestedComposerProps): JSX.Element;
