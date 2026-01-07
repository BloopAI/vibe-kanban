/**
 * Basic draw editor in order to generate an Ink annotation.
 */
export class InkEditor extends AnnotationEditor {
    static _defaultColor: null;
    static _defaultOpacity: number;
    static _defaultThickness: number;
    static _l10nPromise: any;
    static _type: string;
    static initialize(l10n: any): void;
    static updateDefaultParams(type: any, value: any): void;
    static get defaultPropertiesToUpdate(): any[][];
    /**
     * Convert the output of fitCurve in some Path2D.
     * @param {Arra<Array<number>} bezier
     * @returns {Path2D}
     */
    static "__#2@#buildPath2D"(bezier: Arra<number[]>): Path2D;
    /** @inheritdoc */
    static deserialize(data: any, parent: any, uiManager: any): AnnotationEditor;
    constructor(params: any);
    color: any;
    thickness: any;
    opacity: any;
    paths: any[];
    bezierPath2D: any[];
    currentPath: any[];
    scaleFactor: number;
    translationX: number;
    translationY: number;
    /** @inheritdoc */
    updateParams(type: any, value: any): void;
    /** @inheritdoc */
    get propertiesToUpdate(): any[][];
    canvas: HTMLCanvasElement | null | undefined;
    onScaleChanging(): void;
    /**
     * onpointerdown callback for the canvas we're drawing on.
     * @param {PointerEvent} event
     */
    canvasPointerdown(event: PointerEvent): void;
    /**
     * onpointermove callback for the canvas we're drawing on.
     * @param {PointerEvent} event
     */
    canvasPointermove(event: PointerEvent): void;
    /**
     * onpointerup callback for the canvas we're drawing on.
     * @param {PointerEvent} event
     */
    canvasPointerup(event: PointerEvent): void;
    /**
     * onpointerleave callback for the canvas we're drawing on.
     * @param {PointerEvent} event
     */
    canvasPointerleave(event: PointerEvent): void;
    ctx: CanvasRenderingContext2D | null | undefined;
    /** @inheritdoc */
    render(): HTMLDivElement | null;
    /**
     * When the dimensions of the div change the inner canvas must
     * renew its dimensions, hence it must redraw its own contents.
     * @param {number} width - the new width of the div
     * @param {number} height - the new height of the div
     * @returns
     */
    setDimensions(width: number, height: number): void;
    /** @inheritdoc */
    serialize(): {
        annotationType: number;
        color: number[];
        thickness: any;
        opacity: any;
        paths: {
            bezier: number[];
            points: number[];
        }[];
        pageIndex: number;
        rect: any[];
        rotation: any;
    } | null;
    #private;
}
import { AnnotationEditor } from "./editor.js";
export { fitCurve };
