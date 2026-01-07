export declare function extractHref(elementsChain: string): string;
export declare function extractTexts(elementsChain: string): string[];
export declare function matchString(value: string | undefined | null, pattern: string, matching: 'exact' | 'contains' | 'regex'): boolean;
export declare function matchTexts(texts: string[], pattern: string, matching: 'exact' | 'contains' | 'regex'): boolean;
