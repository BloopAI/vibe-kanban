export type PDFPageProxy = import("../src/display/api").PDFPageProxy;
export type PageViewport = import("../src/display/display_utils").PageViewport;
export type RenderingStates = any;
/**
 * @interface
 */
export class IDownloadManager {
    /**
     * @param {string} url
     * @param {string} filename
     */
    downloadUrl(url: string, filename: string): void;
    /**
     * @param {Uint8Array} data
     * @param {string} filename
     * @param {string} [contentType]
     */
    downloadData(data: Uint8Array, filename: string, contentType?: string | undefined): void;
    /**
     * @param {HTMLElement} element
     * @param {Uint8Array} data
     * @param {string} filename
     * @returns {boolean} Indicating if the data was opened.
     */
    openOrDownloadData(element: HTMLElement, data: Uint8Array, filename: string): boolean;
    /**
     * @param {Blob} blob
     * @param {string} url
     * @param {string} filename
     */
    download(blob: Blob, url: string, filename: string): void;
}
/**
 * @interface
 */
export class IL10n {
    /**
     * @returns {Promise<string>} - Resolves to the current locale.
     */
    getLanguage(): Promise<string>;
    /**
     * @returns {Promise<string>} - Resolves to 'rtl' or 'ltr'.
     */
    getDirection(): Promise<string>;
    /**
     * Translates text identified by the key and adds/formats data using the args
     * property bag. If the key was not found, translation falls back to the
     * fallback text.
     * @param {string} key
     * @param {Object | null} [args]
     * @param {string} [fallback]
     * @returns {Promise<string>}
     */
    get(key: string, args?: Object | null | undefined, fallback?: string | undefined): Promise<string>;
    /**
     * Translates HTML element.
     * @param {HTMLElement} element
     * @returns {Promise<void>}
     */
    translate(element: HTMLElement): Promise<void>;
}
/** @typedef {import("../src/display/api").PDFPageProxy} PDFPageProxy */
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
/** @typedef {import("./ui_utils").RenderingStates} RenderingStates */
/**
 * @interface
 */
export class IPDFLinkService {
    /**
     * @type {number}
     */
    get pagesCount(): number;
    /**
     * @param {number} value
     */
    set page(arg: number);
    /**
     * @type {number}
     */
    get page(): number;
    /**
     * @param {number} value
     */
    set rotation(arg: number);
    /**
     * @type {number}
     */
    get rotation(): number;
    /**
     * @type {boolean}
     */
    get isInPresentationMode(): boolean;
    /**
     * @param {boolean} value
     */
    set externalLinkEnabled(arg: boolean);
    /**
     * @type {boolean}
     */
    get externalLinkEnabled(): boolean;
    /**
     * @param {string|Array} dest - The named, or explicit, PDF destination.
     */
    goToDestination(dest: string | any[]): Promise<void>;
    /**
     * @param {number|string} val - The page number, or page label.
     */
    goToPage(val: number | string): void;
    /**
     * @param {HTMLAnchorElement} link
     * @param {string} url
     * @param {boolean} [newWindow]
     */
    addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow?: boolean | undefined): void;
    /**
     * @param dest - The PDF destination object.
     * @returns {string} The hyperlink to the PDF object.
     */
    getDestinationHash(dest: any): string;
    /**
     * @param hash - The PDF parameters/hash.
     * @returns {string} The hyperlink to the PDF object.
     */
    getAnchorUrl(hash: any): string;
    /**
     * @param {string} hash
     */
    setHash(hash: string): void;
    /**
     * @param {string} action
     */
    executeNamedAction(action: string): void;
    /**
     * @param {Object} action
     */
    executeSetOCGState(action: Object): void;
    /**
     * @param {number} pageNum - page number.
     * @param {Object} pageRef - reference to the page.
     */
    cachePageRef(pageNum: number, pageRef: Object): void;
    /**
     * @param {number} pageNumber
     */
    isPageVisible(pageNumber: number): void;
    /**
     * @param {number} pageNumber
     */
    isPageCached(pageNumber: number): void;
}
/**
 * @interface
 */
export class IRenderableView {
    /** @type {function | null} */
    resume: Function | null;
    /**
     * @type {string} - Unique ID for rendering queue.
     */
    get renderingId(): string;
    /**
     * @type {RenderingStates}
     */
    get renderingState(): any;
    /**
     * @returns {Promise} Resolved on draw completion.
     */
    draw(): Promise<any>;
}
