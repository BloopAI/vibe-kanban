export type PDFPageProxy = import("../src/display/api").PDFPageProxy;
export type PageViewport = import("../src/display/display_utils").PageViewport;
export type IPDFLinkService = import("./interfaces").IPDFLinkService;
export type XfaLayerBuilderOptions = {
    pageDiv: HTMLDivElement;
    pdfPage: PDFPageProxy;
    annotationStorage?: any;
    linkService: IPDFLinkService;
    xfaHtml?: Object | undefined;
};
/**
 * @typedef {Object} XfaLayerBuilderOptions
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPageProxy} pdfPage
 * @property {AnnotationStorage} [annotationStorage]
 * @property {IPDFLinkService} linkService
 * @property {Object} [xfaHtml]
 */
export class XfaLayerBuilder {
    /**
     * @param {XfaLayerBuilderOptions} options
     */
    constructor({ pageDiv, pdfPage, annotationStorage, linkService, xfaHtml, }: XfaLayerBuilderOptions);
    pageDiv: HTMLDivElement;
    pdfPage: import("../src/display/api").PDFPageProxy;
    annotationStorage: any;
    linkService: import("./interfaces").IPDFLinkService;
    xfaHtml: Object;
    div: HTMLDivElement | null;
    _cancelled: boolean;
    /**
     * @param {PageViewport} viewport
     * @param {string} intent (default value is 'display')
     * @returns {Promise<Object | void>} A promise that is resolved when rendering
     *   of the XFA layer is complete. The first rendering will return an object
     *   with a `textDivs` property that can be used with the TextHighlighter.
     */
    render(viewport: PageViewport, intent?: string): Promise<Object | void>;
    cancel(): void;
    hide(): void;
}
