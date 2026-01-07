export function fixupLangCode(langCode: any): any;
export function getL10nFallback(key: any, args: any): any;
export namespace NullL10n {
    function getLanguage(): Promise<string>;
    function getDirection(): Promise<string>;
    function get(key: any, args?: null, fallback?: any): Promise<any>;
    function translate(element: any): Promise<void>;
}
