import { RequestWithOptions } from './types';
export declare const SUPPORTS_REQUEST: boolean;
/**
 * Extends a URL with additional query parameters
 * @param url - The URL to extend
 * @param params - The parameters to add
 * @param replace - When true (default), new params overwrite existing ones with same key. When false, existing params are preserved.
 * @returns The URL with extended parameters
 */
export declare const extendURLParams: (url: string, params: Record<string, any>, replace?: boolean) => string;
export declare const jsonStringify: (data: any, space?: string | number) => string;
export declare const request: (_options: RequestWithOptions) => void;
