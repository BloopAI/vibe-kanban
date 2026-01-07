export type PageViewport = import("../src/display/display_utils").PageViewport;
export type OptionalContentConfig = import("../src/display/optional_content_config").OptionalContentConfig;
export type EventBus = import("./event_utils").EventBus;
export type IL10n = import("./interfaces").IL10n;
export type IRenderableView = import("./interfaces").IRenderableView;
export type PDFRenderingQueue = import("./pdf_rendering_queue").PDFRenderingQueue;
export type PDFPageViewOptions = {
    /**
     * - The viewer element.
     */
    container?: HTMLDivElement | undefined;
    /**
     * - The application event bus.
     */
    eventBus: EventBus;
    /**
     * - The page unique ID (normally its number).
     */
    id: number;
    /**
     * - The page scale display.
     */
    scale?: number | undefined;
    /**
     * - The page viewport.
     */
    defaultViewport: PageViewport;
    /**
     * -
     * A promise that is resolved with an {@link OptionalContentConfig } instance.
     * The default value is `null`.
     */
    optionalContentConfigPromise?: Promise<import("../src/display/optional_content_config").OptionalContentConfig> | undefined;
    /**
     * - The rendering queue object.
     */
    renderingQueue?: import("./pdf_rendering_queue").PDFRenderingQueue | undefined;
    /**
     * - Controls if the text layer used for
     * selection and searching is created. The constants from {TextLayerMode}
     * should be used. The default value is `TextLayerMode.ENABLE`.
     */
    textLayerMode?: number | undefined;
    /**
     * - Controls if the annotation layer is
     * created, and if interactive form elements or `AnnotationStorage`-data are
     * being rendered. The constants from {@link AnnotationMode } should be used;
     * see also {@link RenderParameters } and {@link GetOperatorListParameters }.
     * The default value is `AnnotationMode.ENABLE_FORMS`.
     */
    annotationMode?: number | undefined;
    /**
     * - Path for image resources, mainly
     * for annotation icons. Include trailing slash.
     */
    imageResourcesPath?: string | undefined;
    /**
     * - Enables CSS only zooming. The default
     * value is `false`.
     */
    useOnlyCssZoom?: boolean | undefined;
    /**
     * - Allows to use an
     * OffscreenCanvas if needed.
     */
    isOffscreenCanvasSupported?: boolean | undefined;
    /**
     * - The maximum supported canvas size in
     * total pixels, i.e. width * height. Use -1 for no limit. The default value
     * is 4096 * 4096 (16 mega-pixels).
     */
    maxCanvasPixels?: number | undefined;
    /**
     * - Overwrites background and foreground colors
     * with user defined ones in order to improve readability in high contrast
     * mode.
     */
    pageColors?: Object | undefined;
    /**
     * - Localization service.
     */
    l10n?: import("./interfaces").IL10n | undefined;
    /**
     * - The function that is used to lookup
     * the necessary layer-properties.
     */
    layerProperties?: Function | undefined;
};
/**
 * @implements {IRenderableView}
 */
export class PDFPageView implements IRenderableView {
    /**
     * @param {PDFPageViewOptions} options
     */
    constructor(options: PDFPageViewOptions);
    id: number;
    renderingId: string;
    pdfPage: any;
    pageLabel: string | null;
    rotation: number;
    scale: number;
    viewport: import("../src/display/display_utils").PageViewport;
    pdfPageRotate: number;
    _optionalContentConfigPromise: Promise<import("../src/display/optional_content_config").OptionalContentConfig> | null;
    hasRestrictedScaling: boolean;
    textLayerMode: number;
    imageResourcesPath: string;
    useOnlyCssZoom: boolean;
    isOffscreenCanvasSupported: boolean;
    maxCanvasPixels: any;
    pageColors: Object | null;
    eventBus: import("./event_utils").EventBus;
    renderingQueue: import("./pdf_rendering_queue").PDFRenderingQueue | undefined;
    renderer: any;
    l10n: {
        getLanguage(): Promise<string>;
        getDirection(): Promise<string>;
        get(key: any, args?: null, fallback?: any): Promise<any>;
        translate(element: any): Promise<void>;
    };
    paintTask: {
        promise: any;
        onRenderContinue(cont: any): void;
        cancel(extraDelay?: number): void;
        readonly separateAnnots: any;
    } | null;
    paintedViewportMap: WeakMap<object, any>;
    resume: (() => void) | null;
    _renderError: any;
    _isStandalone: boolean | undefined;
    _annotationCanvasMap: any;
    annotationLayer: AnnotationLayerBuilder | null;
    annotationEditorLayer: AnnotationEditorLayerBuilder | null;
    textLayer: TextLayerBuilder | null;
    zoomLayer: ParentNode | null;
    xfaLayer: XfaLayerBuilder | null;
    structTreeLayer: any;
    div: HTMLDivElement;
    set renderingState(arg: number);
    get renderingState(): number;
    setPdfPage(pdfPage: any): void;
    destroy(): void;
    get _textHighlighter(): any;
    /**
     * @private
     */
    private _resetZoomLayer;
    reset({ keepZoomLayer, keepAnnotationLayer, keepAnnotationEditorLayer, keepXfaLayer, keepTextLayer, }?: {
        keepZoomLayer?: boolean | undefined;
        keepAnnotationLayer?: boolean | undefined;
        keepAnnotationEditorLayer?: boolean | undefined;
        keepXfaLayer?: boolean | undefined;
        keepTextLayer?: boolean | undefined;
    }): void;
    update({ scale, rotation, optionalContentConfigPromise, drawingDelay, }: {
        scale?: number | undefined;
        rotation?: null | undefined;
        optionalContentConfigPromise?: null | undefined;
        drawingDelay?: number | undefined;
    }): void;
    /**
     * PLEASE NOTE: Most likely you want to use the `this.reset()` method,
     *              rather than calling this one directly.
     */
    cancelRendering({ keepAnnotationLayer, keepAnnotationEditorLayer, keepXfaLayer, keepTextLayer, cancelExtraDelay, }?: {
        keepAnnotationLayer?: boolean | undefined;
        keepAnnotationEditorLayer?: boolean | undefined;
        keepXfaLayer?: boolean | undefined;
        keepTextLayer?: boolean | undefined;
        cancelExtraDelay?: number | undefined;
    }): void;
    cssTransform({ target, redrawAnnotationLayer, redrawAnnotationEditorLayer, redrawXfaLayer, redrawTextLayer, hideTextLayer, }: {
        target: any;
        redrawAnnotationLayer?: boolean | undefined;
        redrawAnnotationEditorLayer?: boolean | undefined;
        redrawXfaLayer?: boolean | undefined;
        redrawTextLayer?: boolean | undefined;
        hideTextLayer?: boolean | undefined;
    }): void;
    get width(): number;
    get height(): number;
    getPagePoint(x: any, y: any): Object;
    draw(): any;
    paintOnCanvas(canvasWrapper: any): {
        promise: any;
        onRenderContinue(cont: any): void;
        cancel(extraDelay?: number): void;
        readonly separateAnnots: any;
    };
    canvas: HTMLCanvasElement | undefined;
    outputScale: OutputScale | undefined;
    paintOnSvg(wrapper: any): {
        promise: any;
        onRenderContinue(cont: any): void;
        cancel(): void;
        readonly separateAnnots: boolean;
    };
    svg: any;
    /**
     * @param {string|null} label
     */
    setPageLabel(label: string | null): void;
    /**
     * For use by the `PDFThumbnailView.setImage`-method.
     * @ignore
     */
    get thumbnailCanvas(): HTMLCanvasElement | null | undefined;
    #private;
}
import { AnnotationLayerBuilder } from "./annotation_layer_builder.js";
import { AnnotationEditorLayerBuilder } from "./annotation_editor_layer_builder.js";
import { TextLayerBuilder } from "./text_layer_builder.js";
import { XfaLayerBuilder } from "./xfa_layer_builder.js";
import { OutputScale } from "./ui_utils.js";
