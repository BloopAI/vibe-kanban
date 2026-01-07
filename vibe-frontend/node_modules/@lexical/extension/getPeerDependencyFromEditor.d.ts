/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { AnyLexicalExtension, LexicalEditor, LexicalExtensionDependency } from 'lexical';
/**
 * @experimental
 * Get the finalized config and output of an Extension that was used to build the
 * editor by name.
 *
 * This can be used from the implementation of a LexicalNode or in other
 * situation where you have an editor reference but it's not easy to pass the
 * config around. Use this version if you do not have a concrete reference to
 * the Extension for some reason (e.g. it is an optional peer dependency, or you
 * are avoiding a circular import).
 *
 * Both the explicit Extension type and the name are required.
 *
 *  @example
 * ```tsx
 * import type { HistoryExtension } from "@lexical/history";
 * getPeerDependencyFromEditor<typeof HistoryExtension>(editor, "@lexical/history/History");
 * ```

 * @param editor - The editor that may have been built using extension
 * @param extensionName - The name of the Extension
 * @returns The config and output of the Extension or undefined
 */
export declare function getPeerDependencyFromEditor<Extension extends AnyLexicalExtension = never>(editor: LexicalEditor, extensionName: Extension['name']): LexicalExtensionDependency<Extension> | undefined;
/**
 * Get the finalized config and output of an Extension that was used to build the
 * editor by name.
 *
 * This can be used from the implementation of a LexicalNode or in other
 * situation where you have an editor reference but it's not easy to pass the
 * config around. Use this version if you do not have a concrete reference to
 * the Extension for some reason (e.g. it is an optional peer dependency, or you
 * are avoiding a circular import).
 *
 * Both the explicit Extension type and the name are required.
 *
 *  @example
 * ```tsx
 * import type { EmojiExtension } from "./EmojiExtension";
 * export class EmojiNode extends TextNode {
 *   // other implementation details not included
 *   createDOM(
 *     config: EditorConfig,
 *     editor?: LexicalEditor | undefined
 *   ): HTMLElement {
 *     const dom = super.createDOM(config, editor);
 *     addClassNamesToElement(
 *       dom,
 *       getPeerDependencyFromEditorOrThrow<typeof EmojiExtension>(
 *         editor || $getEditor(),
 *         "@lexical/playground/emoji",
 *       ).config.emojiClass,
 *     );
 *     return dom;
 *   }
 * }
 * ```

 * @param editor - The editor that may have been built using extension
 * @param extensionName - The name of the Extension
 * @returns The config and output of the Extension
 */
export declare function getPeerDependencyFromEditorOrThrow<Extension extends AnyLexicalExtension = never>(editor: LexicalEditor, extensionName: Extension['name']): LexicalExtensionDependency<Extension>;
