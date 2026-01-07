export class FontFaceObject {
    constructor(translatedData: any, { isEvalSupported, disableFontFace, ignoreErrors, onUnsupportedFeature, fontRegistry, }: {
        isEvalSupported?: boolean | undefined;
        disableFontFace?: boolean | undefined;
        ignoreErrors?: boolean | undefined;
        onUnsupportedFeature: any;
        fontRegistry?: null | undefined;
    });
    compiledGlyphs: any;
    isEvalSupported: boolean;
    disableFontFace: boolean;
    ignoreErrors: boolean;
    _onUnsupportedFeature: any;
    fontRegistry: any;
    createNativeFontFace(): FontFace | null;
    createFontFaceRule(): string | null;
    getPathGenerator(objs: any, character: any): any;
}
export class FontLoader {
    constructor({ onUnsupportedFeature, ownerDocument, styleElement, }: {
        onUnsupportedFeature: any;
        ownerDocument?: Document | undefined;
        styleElement?: null | undefined;
    });
    _onUnsupportedFeature: any;
    _document: Document;
    nativeFontFaces: any[];
    styleElement: HTMLStyleElement | null;
    loadingRequests: any[] | undefined;
    loadTestFontId: number | undefined;
    addNativeFontFace(nativeFontFace: any): void;
    insertRule(rule: any): void;
    clear(): void;
    bind(font: any): Promise<void>;
    get isFontLoadingAPISupported(): any;
    get isSyncFontLoadingSupported(): any;
    _queueLoadingCallback(callback: any): {
        done: boolean;
        complete: () => void;
        callback: any;
    };
    get _loadTestFont(): any;
    _prepareFontLoadEvent(font: any, request: any): void;
}
