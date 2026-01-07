export type PDFPageProxy = import("./api").PDFPageProxy;
export type PageViewport = import("./display_utils").PageViewport;
export type IDownloadManager = any;
export type IPDFLinkService = import("../../web/interfaces").IPDFLinkService;
export type AnnotationElementParameters = {
    data: Object;
    layer: HTMLDivElement;
    page: PDFPageProxy;
    viewport: PageViewport;
    linkService: IPDFLinkService;
    downloadManager: any;
    annotationStorage?: AnnotationStorage | undefined;
    /**
     * - Path for image resources, mainly
     * for annotation icons. Include trailing slash.
     */
    imageResourcesPath?: string | undefined;
    renderForms: boolean;
    svgFactory: Object;
    enableScripting?: boolean | undefined;
    hasJSActions?: boolean | undefined;
    fieldObjects?: Object | undefined;
};
export type AnnotationLayerParameters = {
    viewport: PageViewport;
    div: HTMLDivElement;
    annotations: any[];
    page: PDFPageProxy;
    linkService: IPDFLinkService;
    downloadManager: any;
    annotationStorage?: AnnotationStorage | undefined;
    /**
     * - Path for image resources, mainly
     * for annotation icons. Include trailing slash.
     */
    imageResourcesPath?: string | undefined;
    renderForms: boolean;
    /**
     * - Enable embedded script execution.
     */
    enableScripting?: boolean | undefined;
    /**
     * - Some fields have JS actions.
     * The default value is `false`.
     */
    hasJSActions?: boolean | undefined;
    fieldObjects?: {
        [x: string]: Object[];
    } | null | undefined;
    annotationCanvasMap?: Map<string, HTMLCanvasElement> | undefined;
    accessibilityManager?: any;
};
/**
 * @typedef {Object} AnnotationLayerParameters
 * @property {PageViewport} viewport
 * @property {HTMLDivElement} div
 * @property {Array} annotations
 * @property {PDFPageProxy} page
 * @property {IPDFLinkService} linkService
 * @property {IDownloadManager} downloadManager
 * @property {AnnotationStorage} [annotationStorage]
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {boolean} renderForms
 * @property {boolean} [enableScripting] - Enable embedded script execution.
 * @property {boolean} [hasJSActions] - Some fields have JS actions.
 *   The default value is `false`.
 * @property {Object<string, Array<Object>> | null} [fieldObjects]
 * @property {Map<string, HTMLCanvasElement>} [annotationCanvasMap]
 * @property {TextAccessibilityManager} [accessibilityManager]
 */
export class AnnotationLayer {
    static "__#24@#appendElement"(element: any, id: any, div: any, accessibilityManager: any): void;
    /**
     * Render a new annotation layer with all annotation elements.
     *
     * @param {AnnotationLayerParameters} params
     * @memberof AnnotationLayer
     */
    static render(params: AnnotationLayerParameters): void;
    /**
     * Update the annotation elements on existing annotation layer.
     *
     * @param {AnnotationLayerParameters} params
     * @memberof AnnotationLayer
     */
    static update(params: AnnotationLayerParameters): void;
    static "__#24@#setAnnotationCanvasMap"(div: any, annotationCanvasMap: any): void;
}
import { AnnotationStorage } from "./annotation_storage.js";
