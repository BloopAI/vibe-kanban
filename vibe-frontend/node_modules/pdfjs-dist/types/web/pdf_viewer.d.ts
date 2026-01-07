export type PDFDocumentProxy = import("../src/display/api").PDFDocumentProxy;
export type PDFPageProxy = import("../src/display/api").PDFPageProxy;
export type PageViewport = import("../src/display/display_utils").PageViewport;
export type OptionalContentConfig = import("../src/display/optional_content_config").OptionalContentConfig;
export type EventBus = import("./event_utils").EventBus;
export type IDownloadManager = import("./interfaces").IDownloadManager;
export type IL10n = import("./interfaces").IL10n;
export type IPDFLinkService = import("./interfaces").IPDFLinkService;
export type PDFViewerOptions = {
    /**
     * - The container for the viewer element.
     */
    container: HTMLDivElement;
    /**
     * - The viewer element.
     */
    viewer?: HTMLDivElement | undefined;
    /**
     * - The application event bus.
     */
    eventBus: EventBus;
    /**
     * - The navigation/linking service.
     */
    linkService: IPDFLinkService;
    /**
     * - The download manager
     * component.
     */
    downloadManager?: import("./interfaces").IDownloadManager | undefined;
    /**
     * - The find controller
     * component.
     */
    findController?: any;
    /**
     * - The scripting manager
     * component.
     */
    scriptingManager?: any;
    /**
     * - The rendering queue object.
     */
    renderingQueue?: PDFRenderingQueue | undefined;
    /**
     * - Removes the border shadow around
     * the pages. The default value is `false`.
     */
    removePageBorders?: boolean | undefined;
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
     * - Enables the creation and editing
     * of new Annotations. The constants from {@link AnnotationEditorType } should
     * be used. The default value is `AnnotationEditorType.NONE`.
     */
    annotationEditorMode?: number | undefined;
    /**
     * - Path for image resources, mainly
     * mainly for annotation icons. Include trailing slash.
     */
    imageResourcesPath?: string | undefined;
    /**
     * - Enables automatic rotation of
     * landscape pages upon printing. The default is `false`.
     */
    enablePrintAutoRotate?: boolean | undefined;
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
     * - Localization service.
     */
    l10n: IL10n;
    /**
     * - Enables PDF document permissions,
     * when they exist. The default value is `false`.
     */
    enablePermissions?: boolean | undefined;
    /**
     * - Overwrites background and foreground colors
     * with user defined ones in order to improve readability in high contrast
     * mode.
     */
    pageColors?: Object | undefined;
};
export namespace PagesCountLimit {
    const FORCE_SCROLL_MODE_PAGE: number;
    const FORCE_LAZY_PAGE_INIT: number;
    const PAUSE_EAGER_PAGE_INIT: number;
}
/**
 * @typedef {Object} PDFViewerOptions
 * @property {HTMLDivElement} container - The container for the viewer element.
 * @property {HTMLDivElement} [viewer] - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {IDownloadManager} [downloadManager] - The download manager
 *   component.
 * @property {PDFFindController} [findController] - The find controller
 *   component.
 * @property {PDFScriptingManager} [scriptingManager] - The scripting manager
 *   component.
 * @property {PDFRenderingQueue} [renderingQueue] - The rendering queue object.
 * @property {boolean} [removePageBorders] - Removes the border shadow around
 *   the pages. The default value is `false`.
 * @property {number} [textLayerMode] - Controls if the text layer used for
 *   selection and searching is created. The constants from {TextLayerMode}
 *   should be used. The default value is `TextLayerMode.ENABLE`.
 * @property {number} [annotationMode] - Controls if the annotation layer is
 *   created, and if interactive form elements or `AnnotationStorage`-data are
 *   being rendered. The constants from {@link AnnotationMode} should be used;
 *   see also {@link RenderParameters} and {@link GetOperatorListParameters}.
 *   The default value is `AnnotationMode.ENABLE_FORMS`.
 * @property {number} [annotationEditorMode] - Enables the creation and editing
 *   of new Annotations. The constants from {@link AnnotationEditorType} should
 *   be used. The default value is `AnnotationEditorType.NONE`.
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   mainly for annotation icons. Include trailing slash.
 * @property {boolean} [enablePrintAutoRotate] - Enables automatic rotation of
 *   landscape pages upon printing. The default is `false`.
 * @property {boolean} [useOnlyCssZoom] - Enables CSS only zooming. The default
 *   value is `false`.
 * @property {boolean} [isOffscreenCanvasSupported] - Allows to use an
 *   OffscreenCanvas if needed.
 * @property {number} [maxCanvasPixels] - The maximum supported canvas size in
 *   total pixels, i.e. width * height. Use -1 for no limit. The default value
 *   is 4096 * 4096 (16 mega-pixels).
 * @property {IL10n} l10n - Localization service.
 * @property {boolean} [enablePermissions] - Enables PDF document permissions,
 *   when they exist. The default value is `false`.
 * @property {Object} [pageColors] - Overwrites background and foreground colors
 *   with user defined ones in order to improve readability in high contrast
 *   mode.
 */
export class PDFPageViewBuffer {
    constructor(size: any);
    push(view: any): void;
    /**
     * After calling resize, the size of the buffer will be `newSize`.
     * The optional parameter `idsToKeep` is, if present, a Set of page-ids to
     * push to the back of the buffer, delaying their destruction. The size of
     * `idsToKeep` has no impact on the final size of the buffer; if `idsToKeep`
     * is larger than `newSize`, some of those pages will be destroyed anyway.
     */
    resize(newSize: any, idsToKeep?: null): void;
    has(view: any): boolean;
    [Symbol.iterator](): IterableIterator<any>;
    #private;
}
/**
 * Simple viewer control to display PDF content/pages.
 */
export class PDFViewer {
    /**
     * @param {PDFViewerOptions} options
     */
    constructor(options: PDFViewerOptions);
    container: HTMLDivElement;
    viewer: Element | null;
    eventBus: import("./event_utils").EventBus;
    linkService: import("./interfaces").IPDFLinkService;
    downloadManager: import("./interfaces").IDownloadManager | null;
    findController: any;
    _scriptingManager: any;
    textLayerMode: number;
    imageResourcesPath: string;
    enablePrintAutoRotate: boolean;
    removePageBorders: boolean | undefined;
    renderer: any;
    useOnlyCssZoom: boolean;
    isOffscreenCanvasSupported: boolean;
    maxCanvasPixels: number | undefined;
    l10n: import("./interfaces").IL10n;
    pageColors: Object | null;
    defaultRenderingQueue: boolean;
    renderingQueue: PDFRenderingQueue | undefined;
    scroll: {
        right: boolean;
        down: boolean;
        lastX: any;
        lastY: any;
        _eventHandler: (evt: any) => void;
    };
    presentationModeState: number;
    _onBeforeDraw: ((evt: any) => void) | null;
    _onAfterDraw: any;
    get pagesCount(): number;
    getPageView(index: any): any;
    /**
     * @type {boolean} - True if all {PDFPageView} objects are initialized.
     */
    get pageViewsReady(): boolean;
    /**
     * @type {boolean}
     */
    get renderForms(): boolean;
    /**
     * @type {boolean}
     */
    get enableScripting(): boolean;
    /**
     * @param {number} val - The page number.
     */
    set currentPageNumber(arg: number);
    /**
     * @type {number}
     */
    get currentPageNumber(): number;
    /**
     * @returns {boolean} Whether the pageNumber is valid (within bounds).
     * @private
     */
    private _setCurrentPageNumber;
    _currentPageNumber: any;
    /**
     * @param {string} val - The page label.
     */
    set currentPageLabel(arg: string | null);
    /**
     * @type {string|null} Returns the current page label, or `null` if no page
     *   labels exist.
     */
    get currentPageLabel(): string | null;
    /**
     * @param {number} val - Scale of the pages in percents.
     */
    set currentScale(arg: number);
    /**
     * @type {number}
     */
    get currentScale(): number;
    /**
     * @param val - The scale of the pages (in percent or predefined value).
     */
    set currentScaleValue(arg: string);
    /**
     * @type {string}
     */
    get currentScaleValue(): string;
    /**
     * @param {number} rotation - The rotation of the pages (0, 90, 180, 270).
     */
    set pagesRotation(arg: number);
    /**
     * @type {number}
     */
    get pagesRotation(): number;
    _pagesRotation: any;
    get firstPagePromise(): any;
    get onePageRendered(): any;
    get pagesPromise(): any;
    /**
     * @param {PDFDocumentProxy} pdfDocument
     */
    setDocument(pdfDocument: PDFDocumentProxy): void;
    pdfDocument: import("../src/display/api").PDFDocumentProxy | undefined;
    _scrollMode: any;
    _optionalContentConfigPromise: Promise<import("../src/display/optional_content_config").OptionalContentConfig> | null | undefined;
    /**
     * @param {Array|null} labels
     */
    setPageLabels(labels: any[] | null): void;
    _pageLabels: any[] | null | undefined;
    _resetView(): void;
    _pages: any[] | undefined;
    _currentScale: any;
    _currentScaleValue: any;
    _location: {
        pageNumber: any;
        scale: any;
        top: number;
        left: number;
        rotation: any;
        pdfOpenParams: string;
    } | null | undefined;
    _firstPageCapability: any;
    _onePageRenderedCapability: any;
    _pagesCapability: any;
    _previousScrollMode: any;
    _spreadMode: any;
    _scrollUpdate(): void;
    _setScaleUpdatePages(newScale: any, newValue: any, { noScroll, preset, drawingDelay }: {
        noScroll?: boolean | undefined;
        preset?: boolean | undefined;
        drawingDelay?: number | undefined;
    }): void;
    /**
     * @private
     */
    private get _pageWidthScaleFactor();
    _setScale(value: any, options: any): void;
    /**
     * @param {string} label - The page label.
     * @returns {number|null} The page number corresponding to the page label,
     *   or `null` when no page labels exist and/or the input is invalid.
     */
    pageLabelToPageNumber(label: string): number | null;
    /**
     * @typedef {Object} ScrollPageIntoViewParameters
     * @property {number} pageNumber - The page number.
     * @property {Array} [destArray] - The original PDF destination array, in the
     *   format: <page-ref> </XYZ|/FitXXX> <args..>
     * @property {boolean} [allowNegativeOffset] - Allow negative page offsets.
     *   The default value is `false`.
     * @property {boolean} [ignoreDestinationZoom] - Ignore the zoom argument in
     *   the destination array. The default value is `false`.
     */
    /**
     * Scrolls page into view.
     * @param {ScrollPageIntoViewParameters} params
     */
    scrollPageIntoView({ pageNumber, destArray, allowNegativeOffset, ignoreDestinationZoom, }: {
        /**
         * - The page number.
         */
        pageNumber: number;
        /**
         * - The original PDF destination array, in the
         * format: <page-ref> </XYZ|/FitXXX> <args..>
         */
        destArray?: any[] | undefined;
        /**
         * - Allow negative page offsets.
         * The default value is `false`.
         */
        allowNegativeOffset?: boolean | undefined;
        /**
         * - Ignore the zoom argument in
         * the destination array. The default value is `false`.
         */
        ignoreDestinationZoom?: boolean | undefined;
    }): void;
    _updateLocation(firstPage: any): void;
    update(): void;
    containsElement(element: any): boolean;
    focus(): void;
    get _isContainerRtl(): boolean;
    get isInPresentationMode(): boolean;
    get isChangingPresentationMode(): boolean;
    get isHorizontalScrollbarEnabled(): boolean;
    get isVerticalScrollbarEnabled(): boolean;
    _getVisiblePages(): Object;
    /**
     * @param {number} pageNumber
     */
    isPageVisible(pageNumber: number): any;
    /**
     * @param {number} pageNumber
     */
    isPageCached(pageNumber: number): any;
    cleanup(): void;
    /**
     * @private
     */
    private _cancelRendering;
    forceRendering(currentlyVisiblePages: any): boolean;
    /**
     * @type {boolean} Whether all pages of the PDF document have identical
     *   widths and heights.
     */
    get hasEqualPageSizes(): boolean;
    /**
     * Returns sizes of the pages.
     * @returns {Array} Array of objects with width/height/rotation fields.
     */
    getPagesOverview(): any[];
    /**
     * @param {Promise<OptionalContentConfig>} promise - A promise that is
     *   resolved with an {@link OptionalContentConfig} instance.
     */
    set optionalContentConfigPromise(arg: Promise<import("../src/display/optional_content_config").OptionalContentConfig | null>);
    /**
     * @type {Promise<OptionalContentConfig | null>}
     */
    get optionalContentConfigPromise(): Promise<import("../src/display/optional_content_config").OptionalContentConfig | null>;
    /**
     * @param {number} mode - The direction in which the document pages should be
     *   laid out within the scrolling container.
     *   The constants from {ScrollMode} should be used.
     */
    set scrollMode(arg: number);
    /**
     * @type {number} One of the values in {ScrollMode}.
     */
    get scrollMode(): number;
    _updateScrollMode(pageNumber?: null): void;
    /**
     * @param {number} mode - Group the pages in spreads, starting with odd- or
     *   even-number pages (unless `SpreadMode.NONE` is used).
     *   The constants from {SpreadMode} should be used.
     */
    set spreadMode(arg: number);
    /**
     * @type {number} One of the values in {SpreadMode}.
     */
    get spreadMode(): number;
    _updateSpreadMode(pageNumber?: null): void;
    /**
     * @private
     */
    private _getPageAdvance;
    /**
     * Go to the next page, taking scroll/spread-modes into account.
     * @returns {boolean} Whether navigation occured.
     */
    nextPage(): boolean;
    /**
     * Go to the previous page, taking scroll/spread-modes into account.
     * @returns {boolean} Whether navigation occured.
     */
    previousPage(): boolean;
    /**
     * Increase the current zoom level one, or more, times.
     * @param {Object|null} [options]
     */
    increaseScale(options?: Object | null | undefined): void;
    /**
     * Decrease the current zoom level one, or more, times.
     * @param {Object|null} [options]
     */
    decreaseScale(options?: Object | null | undefined): void;
    get containerTopLeft(): number[];
    /**
     * @param {number} mode - AnnotationEditor mode (None, FreeText, Ink, ...)
     */
    set annotationEditorMode(arg: number);
    /**
     * @type {number}
     */
    get annotationEditorMode(): number;
    set annotationEditorParams(arg: any);
    refresh(noUpdate?: boolean, updateArgs?: any): void;
    #private;
}
import { PDFRenderingQueue } from "./pdf_rendering_queue.js";
