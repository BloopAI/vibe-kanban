export type EventBus = import("./event_utils").EventBus;
export type PDFScriptingManagerOptions = {
    /**
     * - The application event bus.
     */
    eventBus: EventBus;
    /**
     * - The path and filename of the scripting
     * bundle.
     */
    sandboxBundleSrc: string;
    /**
     * - The factory that is used when
     * initializing scripting; must contain a `createScripting` method.
     * PLEASE NOTE: Primarily intended for the default viewer use-case.
     */
    scriptingFactory?: Object | undefined;
    /**
     * - The function that is used to
     * lookup the necessary document properties.
     */
    docPropertiesLookup?: Function | undefined;
};
/**
 * @typedef {Object} PDFScriptingManagerOptions
 * @property {EventBus} eventBus - The application event bus.
 * @property {string} sandboxBundleSrc - The path and filename of the scripting
 *   bundle.
 * @property {Object} [scriptingFactory] - The factory that is used when
 *   initializing scripting; must contain a `createScripting` method.
 *   PLEASE NOTE: Primarily intended for the default viewer use-case.
 * @property {function} [docPropertiesLookup] - The function that is used to
 *   lookup the necessary document properties.
 */
export class PDFScriptingManager {
    /**
     * @param {PDFScriptingManagerOptions} options
     */
    constructor({ eventBus, sandboxBundleSrc, scriptingFactory, docPropertiesLookup, }: PDFScriptingManagerOptions);
    _pdfDocument: any;
    _pdfViewer: any;
    _closeCapability: any;
    _destroyCapability: any;
    _scripting: any;
    _ready: boolean;
    _eventBus: import("./event_utils").EventBus;
    _sandboxBundleSrc: string;
    _scriptingFactory: Object;
    _docPropertiesLookup: Function;
    setViewer(pdfViewer: any): void;
    setDocument(pdfDocument: any): Promise<void>;
    dispatchWillSave(detail: any): Promise<any>;
    dispatchDidSave(detail: any): Promise<any>;
    dispatchWillPrint(detail: any): Promise<any>;
    dispatchDidPrint(detail: any): Promise<any>;
    get destroyPromise(): any;
    get ready(): boolean;
    /**
     * @private
     */
    private get _internalEvents();
    /**
     * @private
     */
    private get _pageOpenPending();
    /**
     * @private
     */
    private get _visitedPages();
    /**
     * @private
     */
    private _updateFromSandbox;
    /**
     * @private
     */
    private _dispatchPageOpen;
    /**
     * @private
     */
    private _dispatchPageClose;
    /**
     * @returns {Promise<Object>} A promise that is resolved with an {Object}
     *   containing the necessary document properties; please find the expected
     *   format in `PDFViewerApplication._scriptingDocProperties`.
     * @private
     */
    private _getDocProperties;
    /**
     * @private
     */
    private _createScripting;
    /**
     * @private
     */
    private _destroyScripting;
}
