/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { BaseSelection, LexicalEditor, LexicalNode } from 'lexical';
export interface LexicalClipboardData {
    'text/html'?: string | undefined;
    'application/x-lexical-editor'?: string | undefined;
    'text/plain': string;
}
/**
 * Returns the *currently selected* Lexical content as an HTML string, relying on the
 * logic defined in the exportDOM methods on the LexicalNode classes. Note that
 * this will not return the HTML content of the entire editor (unless all the content is included
 * in the current selection).
 *
 * @param editor - LexicalEditor instance to get HTML content from
 * @param selection - The selection to use (default is $getSelection())
 * @returns a string of HTML content
 */
export declare function $getHtmlContent(editor: LexicalEditor, selection?: BaseSelection | null): string;
/**
 * Returns the *currently selected* Lexical content as a JSON string, relying on the
 * logic defined in the exportJSON methods on the LexicalNode classes. Note that
 * this will not return the JSON content of the entire editor (unless all the content is included
 * in the current selection).
 *
 * @param editor  - LexicalEditor instance to get the JSON content from
 * @param selection - The selection to use (default is $getSelection())
 * @returns
 */
export declare function $getLexicalContent(editor: LexicalEditor, selection?: BaseSelection | null): null | string;
/**
 * Attempts to insert content of the mime-types text/plain or text/uri-list from
 * the provided DataTransfer object into the editor at the provided selection.
 * text/uri-list is only used if text/plain is not also provided.
 *
 * @param dataTransfer an object conforming to the [DataTransfer interface] (https://html.spec.whatwg.org/multipage/dnd.html#the-datatransfer-interface)
 * @param selection the selection to use as the insertion point for the content in the DataTransfer object
 */
export declare function $insertDataTransferForPlainText(dataTransfer: DataTransfer, selection: BaseSelection): void;
/**
 * Attempts to insert content of the mime-types application/x-lexical-editor, text/html,
 * text/plain, or text/uri-list (in descending order of priority) from the provided DataTransfer
 * object into the editor at the provided selection.
 *
 * @param dataTransfer an object conforming to the [DataTransfer interface] (https://html.spec.whatwg.org/multipage/dnd.html#the-datatransfer-interface)
 * @param selection the selection to use as the insertion point for the content in the DataTransfer object
 * @param editor the LexicalEditor the content is being inserted into.
 */
export declare function $insertDataTransferForRichText(dataTransfer: DataTransfer, selection: BaseSelection, editor: LexicalEditor): void;
/**
 * Inserts Lexical nodes into the editor using different strategies depending on
 * some simple selection-based heuristics. If you're looking for a generic way to
 * to insert nodes into the editor at a specific selection point, you probably want
 * {@link lexical.$insertNodes}
 *
 * @param editor LexicalEditor instance to insert the nodes into.
 * @param nodes The nodes to insert.
 * @param selection The selection to insert the nodes into.
 */
export declare function $insertGeneratedNodes(editor: LexicalEditor, nodes: Array<LexicalNode>, selection: BaseSelection): void;
export interface BaseSerializedNode {
    children?: Array<BaseSerializedNode>;
    type: string;
    version: number;
}
/**
 * Gets the Lexical JSON of the nodes inside the provided Selection.
 *
 * @param editor LexicalEditor to get the JSON content from.
 * @param selection Selection to get the JSON content from.
 * @returns an object with the editor namespace and a list of serializable nodes as JavaScript objects.
 */
export declare function $generateJSONFromSelectedNodes<SerializedNode extends BaseSerializedNode>(editor: LexicalEditor, selection: BaseSelection | null): {
    namespace: string;
    nodes: Array<SerializedNode>;
};
/**
 * This method takes an array of objects conforming to the BaseSerializedNode interface and returns
 * an Array containing instances of the corresponding LexicalNode classes registered on the editor.
 * Normally, you'd get an Array of BaseSerialized nodes from {@link $generateJSONFromSelectedNodes}
 *
 * @param serializedNodes an Array of objects conforming to the BaseSerializedNode interface.
 * @returns an Array of Lexical Node objects.
 */
export declare function $generateNodesFromSerializedNodes(serializedNodes: Array<BaseSerializedNode>): Array<LexicalNode>;
/**
 * Copies the content of the current selection to the clipboard in
 * text/plain, text/html, and application/x-lexical-editor (Lexical JSON)
 * formats.
 *
 * @param editor the LexicalEditor instance to copy content from
 * @param event the native browser ClipboardEvent to add the content to.
 * @returns
 */
export declare function copyToClipboard(editor: LexicalEditor, event: null | ClipboardEvent, data?: LexicalClipboardData): Promise<boolean>;
/**
 * Serialize the content of the current selection to strings in
 * text/plain, text/html, and application/x-lexical-editor (Lexical JSON)
 * formats (as available).
 *
 * @param selection the selection to serialize (defaults to $getSelection())
 * @returns LexicalClipboardData
 */
export declare function $getClipboardDataFromSelection(selection?: BaseSelection | null): LexicalClipboardData;
/**
 * Call setData on the given clipboardData for each MIME type present
 * in the given data (from {@link $getClipboardDataFromSelection})
 *
 * @param clipboardData the event.clipboardData to populate from data
 * @param data The lexical data
 */
export declare function setLexicalClipboardDataTransfer(clipboardData: DataTransfer, data: LexicalClipboardData): void;
