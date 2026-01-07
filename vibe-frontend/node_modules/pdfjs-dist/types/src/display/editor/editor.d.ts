export type AnnotationEditorLayer = import("./annotation_editor_layer.js").AnnotationEditorLayer;
export type AnnotationEditorUIManager = import("./tools.js").AnnotationEditorUIManager;
export type AnnotationEditorParameters = {
    /**
     * - the global manager
     */
    uiManager: AnnotationEditorUIManager;
    /**
     * - the layer containing this editor
     */
    parent: AnnotationEditorLayer;
    /**
     * - editor id
     */
    id: string;
    /**
     * - x-coordinate
     */
    x: number;
    /**
     * - y-coordinate
     */
    y: number;
};
/**
 * @typedef {Object} AnnotationEditorParameters
 * @property {AnnotationEditorUIManager} uiManager - the global manager
 * @property {AnnotationEditorLayer} parent - the layer containing this editor
 * @property {string} id - editor id
 * @property {number} x - x-coordinate
 * @property {number} y - y-coordinate
 */
/**
 * Base class for editors.
 */
export class AnnotationEditor {
    static _colorManager: ColorManager;
    static _zIndex: number;
    static get _defaultLineColor(): any;
    /**
     * Deserialize the editor.
     * The result of the deserialization is a new editor.
     *
     * @param {Object} data
     * @param {AnnotationEditorLayer} parent
     * @param {AnnotationEditorUIManager} uiManager
     * @returns {AnnotationEditor}
     */
    static deserialize(data: Object, parent: AnnotationEditorLayer, uiManager: AnnotationEditorUIManager): AnnotationEditor;
    /**
     * @param {AnnotationEditorParameters} parameters
     */
    constructor(parameters: AnnotationEditorParameters);
    _uiManager: null;
    parent: import("./annotation_editor_layer.js").AnnotationEditorLayer;
    id: string;
    width: any;
    height: any;
    pageIndex: number;
    name: any;
    div: HTMLDivElement | null;
    rotation: any;
    pageDimensions: any[];
    pageTranslation: any[];
    x: number;
    y: number;
    isAttachedToDOM: boolean;
    /**
     * Add some commands into the CommandManager (undo/redo stuff).
     * @param {Object} params
     */
    addCommands(params: Object): void;
    get currentLayer(): any;
    /**
     * This editor will be behind the others.
     */
    setInBackground(): void;
    /**
     * This editor will be in the foreground.
     */
    setInForeground(): void;
    setParent(parent: any): void;
    /**
     * onfocus callback.
     */
    focusin(event: any): void;
    /**
     * onblur callback.
     * @param {FocusEvent} event
     */
    focusout(event: FocusEvent): void;
    commitOrRemove(): void;
    /**
     * Commit the data contained in this editor.
     */
    commit(): void;
    addToAnnotationStorage(): void;
    /**
     * We use drag-and-drop in order to move an editor on a page.
     * @param {DragEvent} event
     */
    dragstart(event: DragEvent): void;
    startX: number | undefined;
    startY: number | undefined;
    /**
     * Set the editor position within its parent.
     * @param {number} x
     * @param {number} y
     * @param {number} tx - x-translation in screen coordinates.
     * @param {number} ty - y-translation in screen coordinates.
     */
    setAt(x: number, y: number, tx: number, ty: number): void;
    /**
     * Translate the editor position within its parent.
     * @param {number} x - x-translation in screen coordinates.
     * @param {number} y - y-translation in screen coordinates.
     */
    translate(x: number, y: number): void;
    /**
     * Convert a screen translation into a page one.
     * @param {number} x
     * @param {number} y
     */
    screenToPageTranslation(x: number, y: number): number[];
    get parentScale(): any;
    get parentRotation(): any;
    get parentDimensions(): number[];
    /**
     * Set the dimensions of this editor.
     * @param {number} width
     * @param {number} height
     */
    setDims(width: number, height: number): void;
    fixDims(): void;
    /**
     * Get the translation used to position this editor when it's created.
     * @returns {Array<number>}
     */
    getInitialTranslation(): Array<number>;
    /**
     * Render this editor in a div.
     * @returns {HTMLDivElement}
     */
    render(): HTMLDivElement;
    /**
     * Onpointerdown callback.
     * @param {PointerEvent} event
     */
    pointerdown(event: PointerEvent): void;
    getRect(tx: any, ty: any): any[];
    getRectInCurrentCoords(rect: any, pageHeight: any): any[];
    /**
     * Executed once this editor has been rendered.
     */
    onceAdded(): void;
    /**
     * Check if the editor contains something.
     * @returns {boolean}
     */
    isEmpty(): boolean;
    /**
     * Enable edit mode.
     */
    enableEditMode(): void;
    /**
     * Disable edit mode.
     */
    disableEditMode(): void;
    /**
     * Check if the editor is edited.
     * @returns {boolean}
     */
    isInEditMode(): boolean;
    /**
     * If it returns true, then this editor handle the keyboard
     * events itself.
     * @returns {boolean}
     */
    shouldGetKeyboardEvents(): boolean;
    /**
     * Check if this editor needs to be rebuilt or not.
     * @returns {boolean}
     */
    needsToBeRebuilt(): boolean;
    /**
     * Rebuild the editor in case it has been removed on undo.
     *
     * To implement in subclasses.
     */
    rebuild(): void;
    /**
     * Serialize the editor.
     * The result of the serialization will be used to construct a
     * new annotation to add to the pdf document.
     *
     * To implement in subclasses.
     */
    serialize(): void;
    /**
     * Remove this editor.
     * It's used on ctrl+backspace action.
     */
    remove(): void;
    /**
     * Select this editor.
     */
    select(): void;
    /**
     * Unselect this editor.
     */
    unselect(): void;
    /**
     * Update some parameters which have been changed through the UI.
     * @param {number} type
     * @param {*} value
     */
    updateParams(type: number, value: any): void;
    /**
     * When the user disables the editing mode some editors can change some of
     * their properties.
     */
    disableEditing(): void;
    /**
     * When the user enables the editing mode some editors can change some of
     * their properties.
     */
    enableEditing(): void;
    /**
     * Get some properties to update in the UI.
     * @returns {Object}
     */
    get propertiesToUpdate(): Object;
    /**
     * Get the div which really contains the displayed content.
     */
    get contentDiv(): HTMLDivElement | null;
    /**
     * When set to true, it means that this editor is currently edited.
     * @param {boolean} value
     */
    set isEditing(arg: boolean);
    /**
     * If true then the editor is currently edited.
     * @type {boolean}
     */
    get isEditing(): boolean;
    #private;
}
import { ColorManager } from "./tools.js";
