export type AnnotationEditorLayer = import("./annotation_editor_layer.js").AnnotationEditorLayer;
/**
 * Basic text editor in order to create a FreeTex annotation.
 */
export class FreeTextEditor extends AnnotationEditor {
    static _freeTextDefaultContent: string;
    static _l10nPromise: any;
    static _internalPadding: number;
    static _defaultColor: null;
    static _defaultFontSize: number;
    static _keyboardManager: KeyboardManager;
    static _type: string;
    static initialize(l10n: any): void;
    static updateDefaultParams(type: any, value: any): void;
    static get defaultPropertiesToUpdate(): any[][];
    /** @inheritdoc */
    static deserialize(data: any, parent: any, uiManager: any): AnnotationEditor;
    constructor(params: any);
    /** @inheritdoc */
    updateParams(type: any, value: any): void;
    get propertiesToUpdate(): any[][];
    /**
     * Commit the content we have in this editor.
     * @returns {undefined}
     */
    commit(): undefined;
    /**
     * ondblclick callback.
     * @param {MouseEvent} event
     */
    dblclick(event: MouseEvent): void;
    /**
     * onkeydown callback.
     * @param {KeyboardEvent} event
     */
    keydown(event: KeyboardEvent): void;
    editorDivKeydown(event: any): void;
    editorDivFocus(event: any): void;
    editorDivBlur(event: any): void;
    editorDivInput(event: any): void;
    /** @inheritdoc */
    render(): HTMLDivElement | null;
    editorDiv: HTMLDivElement | undefined;
    overlayDiv: HTMLDivElement | undefined;
    get contentDiv(): HTMLDivElement | undefined;
    /** @inheritdoc */
    serialize(): {
        annotationType: number;
        color: number[];
        fontSize: any;
        value: string;
        pageIndex: number;
        rect: any[];
        rotation: any;
    } | null;
    #private;
}
import { AnnotationEditor } from "./editor.js";
import { KeyboardManager } from "./tools.js";
