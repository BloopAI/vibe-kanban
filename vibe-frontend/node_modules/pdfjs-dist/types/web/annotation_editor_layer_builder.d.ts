export type PDFPageProxy = import("../src/display/api").PDFPageProxy;
export type PageViewport = import("../src/display/display_utils").PageViewport;
export type AnnotationEditorUIManager = import("../src/display/editor/tools.js").AnnotationEditorUIManager;
export type TextAccessibilityManager = import("./text_accessibility.js").TextAccessibilityManager;
export type IL10n = import("./interfaces").IL10n;
export type AnnotationEditorLayerBuilderOptions = {
    uiManager?: import("../src/display/editor/tools.js").AnnotationEditorUIManager | undefined;
    pageDiv: HTMLDivElement;
    pdfPage: PDFPageProxy;
    l10n?: import("./interfaces").IL10n | undefined;
    accessibilityManager?: import("./text_accessibility.js").TextAccessibilityManager | undefined;
};
/**
 * @typedef {Object} AnnotationEditorLayerBuilderOptions
 * @property {AnnotationEditorUIManager} [uiManager]
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPageProxy} pdfPage
 * @property {IL10n} [l10n]
 * @property {TextAccessibilityManager} [accessibilityManager]
 */
export class AnnotationEditorLayerBuilder {
    /**
     * @param {AnnotationEditorLayerBuilderOptions} options
     */
    constructor(options: AnnotationEditorLayerBuilderOptions);
    pageDiv: HTMLDivElement;
    pdfPage: import("../src/display/api").PDFPageProxy;
    accessibilityManager: import("./text_accessibility.js").TextAccessibilityManager | undefined;
    l10n: {
        getLanguage(): Promise<string>;
        getDirection(): Promise<string>;
        get(key: any, args?: null, fallback?: any): Promise<any>;
        translate(element: any): Promise<void>;
    };
    annotationEditorLayer: any;
    div: HTMLDivElement | null;
    _cancelled: boolean;
    /**
     * @param {PageViewport} viewport
     * @param {string} intent (default value is 'display')
     */
    render(viewport: PageViewport, intent?: string): Promise<void>;
    cancel(): void;
    hide(): void;
    show(): void;
    #private;
}
