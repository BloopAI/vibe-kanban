export type PDFPageProxy = import("../src/display/api").PDFPageProxy;
export type PageViewport = import("../src/display/display_utils").PageViewport;
export type IDownloadManager = import("./interfaces").IDownloadManager;
export type IL10n = import("./interfaces").IL10n;
export type IPDFLinkService = import("./interfaces").IPDFLinkService;
export type TextAccessibilityManager = any;
export type AnnotationLayerBuilderOptions = {
    pageDiv: HTMLDivElement;
    pdfPage: PDFPageProxy;
    annotationStorage?: any;
    /**
     * - Path for image resources, mainly
     * for annotation icons. Include trailing slash.
     */
    imageResourcesPath?: string | undefined;
    renderForms: boolean;
    linkService: IPDFLinkService;
    downloadManager: IDownloadManager;
    /**
     * - Localization service.
     */
    l10n: IL10n;
    enableScripting?: boolean | undefined;
    hasJSActionsPromise?: Promise<boolean> | undefined;
    fieldObjectsPromise?: Promise<{
        [x: string]: Object[];
    } | null> | undefined;
    annotationCanvasMap?: Map<string, HTMLCanvasElement> | undefined;
    accessibilityManager?: any;
};
/**
 * @typedef {Object} AnnotationLayerBuilderOptions
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPageProxy} pdfPage
 * @property {AnnotationStorage} [annotationStorage]
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {boolean} renderForms
 * @property {IPDFLinkService} linkService
 * @property {IDownloadManager} downloadManager
 * @property {IL10n} l10n - Localization service.
 * @property {boolean} [enableScripting]
 * @property {Promise<boolean>} [hasJSActionsPromise]
 * @property {Promise<Object<string, Array<Object>> | null>}
 *   [fieldObjectsPromise]
 * @property {Map<string, HTMLCanvasElement>} [annotationCanvasMap]
 * @property {TextAccessibilityManager} [accessibilityManager]
 */
export class AnnotationLayerBuilder {
    /**
     * @param {AnnotationLayerBuilderOptions} options
     */
    constructor({ pageDiv, pdfPage, linkService, downloadManager, annotationStorage, imageResourcesPath, renderForms, l10n, enableScripting, hasJSActionsPromise, fieldObjectsPromise, annotationCanvasMap, accessibilityManager, }: AnnotationLayerBuilderOptions);
    pageDiv: HTMLDivElement;
    pdfPage: import("../src/display/api").PDFPageProxy;
    linkService: import("./interfaces").IPDFLinkService;
    downloadManager: import("./interfaces").IDownloadManager;
    imageResourcesPath: string;
    renderForms: boolean;
    l10n: import("./interfaces").IL10n;
    annotationStorage: any;
    enableScripting: boolean;
    _hasJSActionsPromise: Promise<boolean>;
    _fieldObjectsPromise: Promise<{
        [x: string]: Object[];
    } | null>;
    _annotationCanvasMap: Map<string, HTMLCanvasElement>;
    _accessibilityManager: any;
    div: HTMLDivElement | null;
    _cancelled: boolean;
    _eventBus: any;
    /**
     * @param {PageViewport} viewport
     * @param {string} intent (default value is 'display')
     * @returns {Promise<void>} A promise that is resolved when rendering of the
     *   annotations is complete.
     */
    render(viewport: PageViewport, intent?: string): Promise<void>;
    cancel(): void;
    hide(): void;
    #private;
}
