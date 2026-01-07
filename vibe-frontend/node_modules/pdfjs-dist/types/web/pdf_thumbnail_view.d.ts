export type IL10n = import("./interfaces").IL10n;
export type IPDFLinkService = import("./interfaces").IPDFLinkService;
export type IRenderableView = import("./interfaces").IRenderableView;
export type PDFRenderingQueue = import("./pdf_rendering_queue").PDFRenderingQueue;
export type PDFThumbnailViewOptions = {
    /**
     * - The viewer element.
     */
    container: HTMLDivElement;
    /**
     * - The thumbnail's unique ID (normally its number).
     */
    id: number;
    /**
     * - The page viewport.
     */
    defaultViewport: PageViewport;
    /**
     * -
     * A promise that is resolved with an {@link OptionalContentConfig } instance.
     * The default value is `null`.
     */
    optionalContentConfigPromise?: Promise<OptionalContentConfig> | undefined;
    /**
     * - The navigation/linking service.
     */
    linkService: IPDFLinkService;
    /**
     * - The rendering queue object.
     */
    renderingQueue: PDFRenderingQueue;
    /**
     * - Localization service.
     */
    l10n: IL10n;
    /**
     * - Overwrites background and foreground colors
     * with user defined ones in order to improve readability in high contrast
     * mode.
     */
    pageColors?: Object | undefined;
};
/**
 * @implements {IRenderableView}
 */
export class PDFThumbnailView implements IRenderableView {
    /**
     * @param {PDFThumbnailViewOptions} options
     */
    constructor({ container, id, defaultViewport, optionalContentConfigPromise, linkService, renderingQueue, l10n, pageColors, }: PDFThumbnailViewOptions);
    id: number;
    renderingId: string;
    pageLabel: string | null;
    pdfPage: any;
    rotation: number;
    viewport: PageViewport;
    pdfPageRotate: any;
    _optionalContentConfigPromise: Promise<OptionalContentConfig> | null;
    pageColors: Object | null;
    linkService: import("./interfaces").IPDFLinkService;
    renderingQueue: import("./pdf_rendering_queue").PDFRenderingQueue;
    renderTask: any;
    renderingState: number;
    resume: (() => void) | null;
    canvasWidth: number;
    canvasHeight: number;
    scale: number;
    l10n: import("./interfaces").IL10n;
    anchor: HTMLAnchorElement;
    div: HTMLDivElement;
    ring: HTMLDivElement;
    setPdfPage(pdfPage: any): void;
    reset(): void;
    update({ rotation }: {
        rotation?: null | undefined;
    }): void;
    /**
     * PLEASE NOTE: Most likely you want to use the `this.reset()` method,
     *              rather than calling this one directly.
     */
    cancelRendering(): void;
    /**
     * @private
     */
    private _getPageDrawContext;
    /**
     * @private
     */
    private _convertCanvasToImage;
    image: HTMLImageElement | undefined;
    draw(): any;
    setImage(pageView: any): void;
    /**
     * @private
     */
    private _reduceImage;
    get _thumbPageTitle(): Promise<string>;
    get _thumbPageCanvas(): Promise<string>;
    /**
     * @param {string|null} label
     */
    setPageLabel(label: string | null): void;
}
/**
 * @typedef {Object} PDFThumbnailViewOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {number} id - The thumbnail's unique ID (normally its number).
 * @property {PageViewport} defaultViewport - The page viewport.
 * @property {Promise<OptionalContentConfig>} [optionalContentConfigPromise] -
 *   A promise that is resolved with an {@link OptionalContentConfig} instance.
 *   The default value is `null`.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
 * @property {IL10n} l10n - Localization service.
 * @property {Object} [pageColors] - Overwrites background and foreground colors
 *   with user defined ones in order to improve readability in high contrast
 *   mode.
 */
export class TempImageFactory {
    static "__#36@#tempCanvas": null;
    static getCanvas(width: any, height: any): (HTMLCanvasElement | CanvasRenderingContext2D | null)[];
    static destroyCanvas(): void;
}
